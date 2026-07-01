import pg from "pg";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { signSession } from "../src/auth/jwt.js";
import { createPool } from "../src/db/pool.js";
import { SESSION_COOKIE } from "../src/middleware/require-auth.js";
import type { AuthService } from "../src/services/auth-service.js";

// Opt-in integration test against a real, migrated Postgres. Provide
// TEST_DATABASE_URL (or DATABASE_URL) to run it; otherwise it is skipped.
//
// This is the Phase 8 cross-cutting guard (spec §9, §11, §13): it proves that
// every protected endpoint requires an authenticated, verified session, that
// the public allow-list stays reachable, and that the documented HTTP status
// codes (400/401/403/404/409) hold across resources.

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const runOrSkip = databaseUrl ? describe : describe.skip;

const JWT_SECRET = "access-control-integration-secret";
const SOME_UUID = "11111111-1111-1111-1111-111111111111";
const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

type Method = "get" | "post" | "patch" | "delete";

// Every business route that must sit behind requireAuth. requireAuth runs before
// body/param validation, so the auth checks hold regardless of payload.
const PROTECTED_ROUTES: Array<{ method: Method; path: string }> = [
  { method: "get", path: "/api/teams" },
  { method: "post", path: "/api/teams" },
  { method: "patch", path: `/api/teams/${SOME_UUID}` },
  { method: "delete", path: `/api/teams/${SOME_UUID}` },
  { method: "get", path: "/api/epics" },
  { method: "post", path: "/api/epics" },
  { method: "patch", path: `/api/epics/${SOME_UUID}` },
  { method: "delete", path: `/api/epics/${SOME_UUID}` },
  { method: "get", path: "/api/tickets" },
  { method: "post", path: "/api/tickets" },
  { method: "get", path: `/api/tickets/${SOME_UUID}` },
  { method: "patch", path: `/api/tickets/${SOME_UUID}` },
  { method: "delete", path: `/api/tickets/${SOME_UUID}` },
  { method: "patch", path: `/api/tickets/${SOME_UUID}/state` },
  { method: "get", path: `/api/tickets/${SOME_UUID}/comments` },
  { method: "post", path: `/api/tickets/${SOME_UUID}/comments` },
];

runOrSkip("access control & API contract (integration)", () => {
  const pool: pg.Pool = createPool(databaseUrl as string);
  const app = createApp({
    pool,
    authService: {} as unknown as AuthService,
    jwtSecret: JWT_SECRET,
    cookieSecure: false,
  });

  let verifiedCookie = "";
  let unverifiedCookie = "";

  async function resetDb(): Promise<void> {
    await pool.query(
      "truncate table comments, tickets, epics, teams, password_reset_tokens, email_verification_tokens, users restart identity cascade",
    );
  }

  async function createUser(email: string, verified: boolean): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into users (email, password_hash, email_verified) values ($1, $2, $3) returning id`,
      [email, "not-a-real-hash", verified],
    );
    return rows[0]!.id;
  }

  async function createTeam(name: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into teams (name) values ($1) returning id`,
      [name],
    );
    return rows[0]!.id;
  }

  async function createEpic(teamId: string, title: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into epics (team_id, title) values ($1, $2) returning id`,
      [teamId, title],
    );
    return rows[0]!.id;
  }

  beforeEach(async () => {
    await resetDb();
    const verifiedId = await createUser("verified@example.com", true);
    const unverifiedId = await createUser("unverified@example.com", false);
    verifiedCookie = `${SESSION_COOKIE}=${signSession({ sub: verifiedId, email: "verified@example.com" }, JWT_SECRET)}`;
    unverifiedCookie = `${SESSION_COOKIE}=${signSession({ sub: unverifiedId, email: "unverified@example.com" }, JWT_SECRET)}`;
  });

  afterAll(async () => {
    await resetDb();
    await pool.end();
  });

  describe("protected endpoints reject anonymous requests (401)", () => {
    it.each(PROTECTED_ROUTES)("$method $path → 401 without a session", async ({ method, path }) => {
      const response = await request(app)[method](path);
      expect(response.status).toBe(401);
    });
  });

  describe("protected endpoints reject unverified users (403)", () => {
    it.each(PROTECTED_ROUTES)(
      "$method $path → 403 with an unverified session",
      async ({ method, path }) => {
        const response = await request(app)[method](path).set("Cookie", unverifiedCookie);
        expect(response.status).toBe(403);
      },
    );
  });

  describe("public endpoints stay reachable without authentication", () => {
    it("GET /api/health → 200", async () => {
      expect((await request(app).get("/api/health")).status).toBe(200);
    });

    it("GET /api/ready → not 401/403", async () => {
      const response = await request(app).get("/api/ready");
      expect([401, 403]).not.toContain(response.status);
    });

    it("GET /api (resource index) → 200", async () => {
      expect((await request(app).get("/api")).status).toBe(200);
    });
  });

  describe("HTTP status-code contract (400 / 404 / 409)", () => {
    it("400 for validation failures and malformed ids", async () => {
      const emptyName = await request(app)
        .post("/api/teams")
        .set("Cookie", verifiedCookie)
        .send({ name: "   " });
      expect(emptyName.status).toBe(400);

      const badId = await request(app).get("/api/tickets/not-a-uuid").set("Cookie", verifiedCookie);
      expect(badId.status).toBe(400);
    });

    it("404 for missing records", async () => {
      const missingTicket = await request(app)
        .get(`/api/tickets/${MISSING_UUID}`)
        .set("Cookie", verifiedCookie);
      expect(missingTicket.status).toBe(404);

      const missingTeam = await request(app)
        .patch(`/api/teams/${MISSING_UUID}`)
        .set("Cookie", verifiedCookie)
        .send({ name: "Renamed" });
      expect(missingTeam.status).toBe(404);
    });

    it("409 when deleting a team that still has an epic", async () => {
      const teamId = await createTeam("Referenced Team");
      await createEpic(teamId, "Blocking Epic");

      const response = await request(app)
        .delete(`/api/teams/${teamId}`)
        .set("Cookie", verifiedCookie);
      expect(response.status).toBe(409);
    });

    it("409 when deleting an epic that still has a ticket", async () => {
      const teamId = await createTeam("Team With Ticket");
      const epicId = await createEpic(teamId, "Referenced Epic");
      await pool.query(
        `insert into tickets (team_id, epic_id, type, state, title, body, created_by)
         values ($1, $2, 'feature', 'new', 'T', 'B', (select id from users where email = 'verified@example.com'))`,
        [teamId, epicId],
      );

      const response = await request(app)
        .delete(`/api/epics/${epicId}`)
        .set("Cookie", verifiedCookie);
      expect(response.status).toBe(409);
    });
  });
});
