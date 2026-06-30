import pg from "pg";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { signSession } from "../src/auth/jwt.js";
import { createPool } from "../src/db/pool.js";
import { SESSION_COOKIE } from "../src/middleware/require-auth.js";
import type { AuthService } from "../src/services/auth-service.js";

// Opt-in integration test against a real, migrated Postgres. Provide
// TEST_DATABASE_URL (or DATABASE_URL) to run it; otherwise it is skipped. It
// exercises the full HTTP stack: router + zod validation + requireAuth + DB.

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const runOrSkip = databaseUrl ? describe : describe.skip;

const JWT_SECRET = "teams-integration-secret";

runOrSkip("teams API (integration)", () => {
  const pool: pg.Pool = createPool(databaseUrl as string);
  const app = createApp({
    pool,
    authService: {} as unknown as AuthService,
    jwtSecret: JWT_SECRET,
    cookieSecure: false,
  });

  let cookie = "";

  async function resetDb(): Promise<void> {
    await pool.query(
      "truncate table comments, tickets, epics, teams, password_reset_tokens, email_verification_tokens, users restart identity cascade",
    );
  }

  async function createVerifiedUser(): Promise<{ id: string; email: string }> {
    const email = "teams.tester@example.com";
    const { rows } = await pool.query<{ id: string }>(
      `insert into users (email, password_hash, email_verified)
       values ($1, $2, true) returning id`,
      [email, "not-a-real-hash"],
    );
    return { id: rows[0]!.id, email };
  }

  beforeEach(async () => {
    await resetDb();
    const user = await createVerifiedUser();
    const token = signSession({ sub: user.id, email: user.email }, JWT_SECRET);
    cookie = `${SESSION_COOKIE}=${token}`;
  });

  afterAll(async () => {
    await resetDb();
    await pool.end();
  });

  async function seedEpicForTeam(teamId: string): Promise<void> {
    await pool.query(`insert into epics (team_id, title) values ($1, $2)`, [teamId, "Epic A"]);
  }

  it("creates, lists, and orders teams", async () => {
    const created = await request(app).post("/api/teams").set("Cookie", cookie).send({ name: "Mobile" });
    expect(created.status).toBe(201);
    expect(created.body.team.name).toBe("Mobile");

    await request(app).post("/api/teams").set("Cookie", cookie).send({ name: "Platform" });

    const list = await request(app).get("/api/teams").set("Cookie", cookie);
    expect(list.status).toBe(200);
    expect(list.body.teams.map((t: { name: string }) => t.name)).toEqual(["Mobile", "Platform"]);
    expect(list.body.teams.every((t: { referenced: boolean }) => t.referenced === false)).toBe(true);
  });

  it("trims the name and rejects empty/oversize names", async () => {
    const trimmed = await request(app)
      .post("/api/teams")
      .set("Cookie", cookie)
      .send({ name: "  Spaced  " });
    expect(trimmed.status).toBe(201);
    expect(trimmed.body.team.name).toBe("Spaced");

    const empty = await request(app).post("/api/teams").set("Cookie", cookie).send({ name: "   " });
    expect(empty.status).toBe(400);

    const oversize = await request(app)
      .post("/api/teams")
      .set("Cookie", cookie)
      .send({ name: "x".repeat(101) });
    expect(oversize.status).toBe(400);
  });

  it("rejects duplicate names case-insensitively with 409", async () => {
    await request(app).post("/api/teams").set("Cookie", cookie).send({ name: "Platform" });

    const dup = await request(app).post("/api/teams").set("Cookie", cookie).send({ name: "platform" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("conflict");
  });

  it("renames a team and reports 404 for a missing id", async () => {
    const created = await request(app).post("/api/teams").set("Cookie", cookie).send({ name: "Old" });
    const id = created.body.team.id as string;

    const renamed = await request(app).patch(`/api/teams/${id}`).set("Cookie", cookie).send({ name: "New" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.team.name).toBe("New");

    const missing = await request(app)
      .patch("/api/teams/00000000-0000-0000-0000-000000000000")
      .set("Cookie", cookie)
      .send({ name: "Whatever" });
    expect(missing.status).toBe(404);
  });

  it("rejects renaming to an existing name with 409", async () => {
    await request(app).post("/api/teams").set("Cookie", cookie).send({ name: "Alpha" });
    const beta = await request(app).post("/api/teams").set("Cookie", cookie).send({ name: "Beta" });

    const conflict = await request(app)
      .patch(`/api/teams/${beta.body.team.id}`)
      .set("Cookie", cookie)
      .send({ name: "alpha" });
    expect(conflict.status).toBe(409);
  });

  it("validates the id format with 400", async () => {
    const bad = await request(app).patch("/api/teams/not-a-uuid").set("Cookie", cookie).send({ name: "X" });
    expect(bad.status).toBe(400);
  });

  it("deletes an unreferenced team and 404s for a missing id", async () => {
    const created = await request(app).post("/api/teams").set("Cookie", cookie).send({ name: "Disposable" });
    const id = created.body.team.id as string;

    const deleted = await request(app).delete(`/api/teams/${id}`).set("Cookie", cookie);
    expect(deleted.status).toBe(204);

    const missing = await request(app)
      .delete("/api/teams/00000000-0000-0000-0000-000000000000")
      .set("Cookie", cookie);
    expect(missing.status).toBe(404);
  });

  it("blocks deleting a referenced team with 409 and a clear message", async () => {
    const created = await request(app).post("/api/teams").set("Cookie", cookie).send({ name: "Referenced" });
    const id = created.body.team.id as string;
    await seedEpicForTeam(id);

    const blocked = await request(app).delete(`/api/teams/${id}`).set("Cookie", cookie);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toMatch(/epics or tickets/i);

    // The list should now flag the team as referenced.
    const list = await request(app).get("/api/teams").set("Cookie", cookie);
    const team = list.body.teams.find((t: { id: string }) => t.id === id);
    expect(team.referenced).toBe(true);
  });

  it("rejects anonymous requests with 401", async () => {
    const anon = await request(app).get("/api/teams");
    expect(anon.status).toBe(401);
  });
});
