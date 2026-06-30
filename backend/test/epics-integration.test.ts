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

const JWT_SECRET = "epics-integration-secret";
const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

runOrSkip("epics API (integration)", () => {
  const pool: pg.Pool = createPool(databaseUrl as string);
  const app = createApp({
    pool,
    authService: {} as unknown as AuthService,
    jwtSecret: JWT_SECRET,
    cookieSecure: false,
  });

  let cookie = "";
  let userId = "";

  async function resetDb(): Promise<void> {
    await pool.query(
      "truncate table comments, tickets, epics, teams, password_reset_tokens, email_verification_tokens, users restart identity cascade",
    );
  }

  async function createTeam(name: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into teams (name) values ($1) returning id`,
      [name],
    );
    return rows[0]!.id;
  }

  async function seedTicketForEpic(teamId: string, epicId: string): Promise<void> {
    await pool.query(
      `insert into tickets (team_id, epic_id, type, state, title, body, created_by)
       values ($1, $2, 'feature', 'new', 'Seed ticket', 'body', $3)`,
      [teamId, epicId, userId],
    );
  }

  beforeEach(async () => {
    await resetDb();
    const { rows } = await pool.query<{ id: string }>(
      `insert into users (email, password_hash, email_verified)
       values ($1, $2, true) returning id`,
      ["epics.tester@example.com", "not-a-real-hash"],
    );
    userId = rows[0]!.id;
    cookie = `${SESSION_COOKIE}=${signSession({ sub: userId, email: "epics.tester@example.com" }, JWT_SECRET)}`;
  });

  afterAll(async () => {
    await resetDb();
    await pool.end();
  });

  it("creates, lists (with team name + referenced), and orders epics", async () => {
    const teamId = await createTeam("Platform");

    const created = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ teamId, title: "Beta epic", description: "desc" });
    expect(created.status).toBe(201);
    expect(created.body.epic.title).toBe("Beta epic");
    expect(created.body.epic.teamId).toBe(teamId);

    await request(app).post("/api/epics").set("Cookie", cookie).send({ teamId, title: "Alpha epic" });

    const list = await request(app).get("/api/epics").set("Cookie", cookie);
    expect(list.status).toBe(200);
    expect(list.body.epics.map((e: { title: string }) => e.title)).toEqual(["Alpha epic", "Beta epic"]);
    expect(list.body.epics[0].teamName).toBe("Platform");
    expect(list.body.epics.every((e: { referenced: boolean }) => e.referenced === false)).toBe(true);
  });

  it("trims the title and rejects empty/oversize titles", async () => {
    const teamId = await createTeam("Platform");

    const trimmed = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ teamId, title: "  Spaced  " });
    expect(trimmed.status).toBe(201);
    expect(trimmed.body.epic.title).toBe("Spaced");

    const empty = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ teamId, title: "   " });
    expect(empty.status).toBe(400);

    const oversize = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ teamId, title: "x".repeat(201) });
    expect(oversize.status).toBe(400);
  });

  it("treats description as optional (null when omitted)", async () => {
    const teamId = await createTeam("Platform");

    const created = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ teamId, title: "No description" });
    expect(created.status).toBe(201);
    expect(created.body.epic.description).toBeNull();
  });

  it("rejects creation without a team or with an unknown team", async () => {
    const noTeam = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ title: "Orphan" });
    expect(noTeam.status).toBe(400);

    const unknownTeam = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ teamId: MISSING_UUID, title: "Orphan" });
    expect(unknownTeam.status).toBe(400);
  });

  it("edits title/description and 404s for a missing id", async () => {
    const teamId = await createTeam("Platform");
    const created = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ teamId, title: "Old", description: "old" });
    const id = created.body.epic.id as string;

    const edited = await request(app)
      .patch(`/api/epics/${id}`)
      .set("Cookie", cookie)
      .send({ title: "New", description: "new" });
    expect(edited.status).toBe(200);
    expect(edited.body.epic.title).toBe("New");
    expect(edited.body.epic.description).toBe("new");

    const missing = await request(app)
      .patch(`/api/epics/${MISSING_UUID}`)
      .set("Cookie", cookie)
      .send({ title: "Whatever" });
    expect(missing.status).toBe(404);
  });

  it("keeps the team immutable", async () => {
    const teamA = await createTeam("Team A");
    const teamB = await createTeam("Team B");
    const created = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ teamId: teamA, title: "Fixed team" });
    const id = created.body.epic.id as string;

    // Same team is fine.
    const sameTeam = await request(app)
      .patch(`/api/epics/${id}`)
      .set("Cookie", cookie)
      .send({ title: "Fixed team", teamId: teamA });
    expect(sameTeam.status).toBe(200);

    // A different team is rejected.
    const moved = await request(app)
      .patch(`/api/epics/${id}`)
      .set("Cookie", cookie)
      .send({ title: "Fixed team", teamId: teamB });
    expect(moved.status).toBe(400);
    expect(moved.body.error.message).toMatch(/team cannot be changed/i);
  });

  it("filters the list by team", async () => {
    const teamA = await createTeam("Team A");
    const teamB = await createTeam("Team B");
    await request(app).post("/api/epics").set("Cookie", cookie).send({ teamId: teamA, title: "A1" });
    await request(app).post("/api/epics").set("Cookie", cookie).send({ teamId: teamB, title: "B1" });

    const filtered = await request(app).get(`/api/epics?teamId=${teamA}`).set("Cookie", cookie);
    expect(filtered.status).toBe(200);
    expect(filtered.body.epics).toHaveLength(1);
    expect(filtered.body.epics[0].title).toBe("A1");

    const all = await request(app).get("/api/epics").set("Cookie", cookie);
    expect(all.body.epics).toHaveLength(2);
  });

  it("validates id and teamId formats with 400", async () => {
    const badId = await request(app)
      .patch("/api/epics/not-a-uuid")
      .set("Cookie", cookie)
      .send({ title: "X" });
    expect(badId.status).toBe(400);

    const badFilter = await request(app).get("/api/epics?teamId=not-a-uuid").set("Cookie", cookie);
    expect(badFilter.status).toBe(400);
  });

  it("deletes an unreferenced epic and 404s for a missing id", async () => {
    const teamId = await createTeam("Platform");
    const created = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ teamId, title: "Disposable" });
    const id = created.body.epic.id as string;

    const deleted = await request(app).delete(`/api/epics/${id}`).set("Cookie", cookie);
    expect(deleted.status).toBe(204);

    const missing = await request(app).delete(`/api/epics/${MISSING_UUID}`).set("Cookie", cookie);
    expect(missing.status).toBe(404);
  });

  it("blocks deleting an epic referenced by tickets with 409", async () => {
    const teamId = await createTeam("Platform");
    const created = await request(app)
      .post("/api/epics")
      .set("Cookie", cookie)
      .send({ teamId, title: "Referenced" });
    const id = created.body.epic.id as string;
    await seedTicketForEpic(teamId, id);

    const blocked = await request(app).delete(`/api/epics/${id}`).set("Cookie", cookie);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toMatch(/tickets/i);

    const list = await request(app).get("/api/epics").set("Cookie", cookie);
    const epic = list.body.epics.find((e: { id: string }) => e.id === id);
    expect(epic.referenced).toBe(true);
  });

  it("rejects anonymous requests with 401", async () => {
    const anon = await request(app).get("/api/epics");
    expect(anon.status).toBe(401);
  });
});
