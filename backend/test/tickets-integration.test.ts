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

const JWT_SECRET = "tickets-integration-secret";
const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

runOrSkip("tickets API (integration)", () => {
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

  async function createEpic(teamId: string, title: string): Promise<string> {
    const { rows } = await pool.query<{ id: string }>(
      `insert into epics (team_id, title) values ($1, $2) returning id`,
      [teamId, title],
    );
    return rows[0]!.id;
  }

  function create(teamId: string, overrides: Record<string, unknown> = {}) {
    return request(app)
      .post("/api/tickets")
      .set("Cookie", cookie)
      .send({ teamId, type: "feature", title: "Ticket", body: "Body", ...overrides });
  }

  beforeEach(async () => {
    await resetDb();
    const { rows } = await pool.query<{ id: string }>(
      `insert into users (email, password_hash, email_verified)
       values ($1, $2, true) returning id`,
      ["tickets.tester@example.com", "not-a-real-hash"],
    );
    userId = rows[0]!.id;
    cookie = `${SESSION_COOKIE}=${signSession({ sub: userId, email: "tickets.tester@example.com" }, JWT_SECRET)}`;
  });

  afterAll(async () => {
    await resetDb();
    await pool.end();
  });

  it("creates a ticket (created_by from session, default state new) and reads it back", async () => {
    const teamId = await createTeam("Platform");

    const created = await create(teamId, { title: "First ticket", body: "Do the thing" });
    expect(created.status).toBe(201);
    expect(created.body.ticket.title).toBe("First ticket");
    expect(created.body.ticket.state).toBe("new");
    expect(created.body.ticket.createdBy).toBe(userId);
    expect(created.body.ticket.createdByEmail).toBe("tickets.tester@example.com");
    expect(created.body.ticket.teamName).toBe("Platform");

    const detail = await request(app)
      .get(`/api/tickets/${created.body.ticket.id}`)
      .set("Cookie", cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.ticket.body).toBe("Do the thing");
  });

  it("ignores a body-supplied createdBy and uses the session user", async () => {
    const teamId = await createTeam("Platform");
    const created = await create(teamId, { createdBy: MISSING_UUID });
    expect(created.status).toBe(201);
    expect(created.body.ticket.createdBy).toBe(userId);
  });

  it("validates required fields and trims the title", async () => {
    const teamId = await createTeam("Platform");

    const trimmed = await create(teamId, { title: "  Spaced  " });
    expect(trimmed.status).toBe(201);
    expect(trimmed.body.ticket.title).toBe("Spaced");

    expect((await create(teamId, { title: "   " })).status).toBe(400);
    expect((await create(teamId, { body: "" })).status).toBe(400);
    expect((await create(teamId, { title: "x".repeat(201) })).status).toBe(400);
    const noTeam = await request(app)
      .post("/api/tickets")
      .set("Cookie", cookie)
      .send({ type: "feature", title: "x", body: "y" });
    expect(noTeam.status).toBe(400);
  });

  it("rejects invalid type and state enums", async () => {
    const teamId = await createTeam("Platform");
    expect((await create(teamId, { type: "task" })).status).toBe(400);
    expect((await create(teamId, { state: "archived" })).status).toBe(400);
  });

  it("rejects an unknown team", async () => {
    const unknown = await create(MISSING_UUID);
    expect(unknown.status).toBe(400);
  });

  it("accepts a same-team epic and rejects a cross-team epic", async () => {
    const teamA = await createTeam("Team A");
    const teamB = await createTeam("Team B");
    const epicA = await createEpic(teamA, "Epic A");
    const epicB = await createEpic(teamB, "Epic B");

    const ok = await create(teamA, { epicId: epicA });
    expect(ok.status).toBe(201);
    expect(ok.body.ticket.epicId).toBe(epicA);
    expect(ok.body.ticket.epicTitle).toBe("Epic A");

    const crossTeam = await create(teamA, { epicId: epicB });
    expect(crossTeam.status).toBe(400);
    expect(crossTeam.body.error.message).toMatch(/team/i);
  });

  it("advances modified_at only on a real change (no-op save keeps it)", async () => {
    const teamId = await createTeam("Platform");
    const created = await create(teamId, { title: "Stable", body: "Same" });
    const id = created.body.ticket.id as string;
    const originalModified = created.body.ticket.modifiedAt as string;

    // No-op save: identical values must not bump modified_at.
    const noop = await request(app)
      .patch(`/api/tickets/${id}`)
      .set("Cookie", cookie)
      .send({ title: "Stable", body: "Same", type: "feature" });
    expect(noop.status).toBe(200);
    expect(noop.body.ticket.modifiedAt).toBe(originalModified);

    // Real change: modified_at advances.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const changed = await request(app)
      .patch(`/api/tickets/${id}`)
      .set("Cookie", cookie)
      .send({ title: "Renamed" });
    expect(changed.status).toBe(200);
    expect(changed.body.ticket.title).toBe("Renamed");
    expect(new Date(changed.body.ticket.modifiedAt).getTime()).toBeGreaterThan(
      new Date(originalModified).getTime(),
    );
  });

  it("persists a state change sent through the general update endpoint (edit form)", async () => {
    const teamId = await createTeam("Platform");
    const created = await create(teamId);
    const id = created.body.ticket.id as string;
    expect(created.body.ticket.state).toBe("new");

    // The ticket edit form saves state as part of PATCH /:id (not the dedicated
    // /state endpoint); it must persist just like a drag-and-drop move does.
    const updated = await request(app)
      .patch(`/api/tickets/${id}`)
      .set("Cookie", cookie)
      .send({ state: "in_progress" });
    expect(updated.status).toBe(200);
    expect(updated.body.ticket.state).toBe("in_progress");

    const reread = await request(app).get(`/api/tickets/${id}`).set("Cookie", cookie);
    expect(reread.body.ticket.state).toBe("in_progress");
  });

  it("changes state immediately via the state endpoint and ignores a same-state no-op", async () => {
    const teamId = await createTeam("Platform");
    const created = await create(teamId);
    const id = created.body.ticket.id as string;
    const originalModified = created.body.ticket.modifiedAt as string;

    await new Promise((resolve) => setTimeout(resolve, 5));
    const moved = await request(app)
      .patch(`/api/tickets/${id}/state`)
      .set("Cookie", cookie)
      .send({ state: "in_progress" });
    expect(moved.status).toBe(200);
    expect(moved.body.ticket.state).toBe("in_progress");
    expect(new Date(moved.body.ticket.modifiedAt).getTime()).toBeGreaterThan(
      new Date(originalModified).getTime(),
    );

    const sameState = await request(app)
      .patch(`/api/tickets/${id}/state`)
      .set("Cookie", cookie)
      .send({ state: "in_progress" });
    expect(sameState.status).toBe(200);
    expect(sameState.body.ticket.modifiedAt).toBe(moved.body.ticket.modifiedAt);
  });

  it("rejects changing the team to one the current epic does not belong to", async () => {
    const teamA = await createTeam("Team A");
    const teamB = await createTeam("Team B");
    const epicA = await createEpic(teamA, "Epic A");
    const created = await create(teamA, { epicId: epicA });
    const id = created.body.ticket.id as string;

    // Moving to team B while keeping epic A (team A's) must fail.
    const moved = await request(app)
      .patch(`/api/tickets/${id}`)
      .set("Cookie", cookie)
      .send({ teamId: teamB });
    expect(moved.status).toBe(400);

    // Clearing the epic and moving teams succeeds.
    const cleared = await request(app)
      .patch(`/api/tickets/${id}`)
      .set("Cookie", cookie)
      .send({ teamId: teamB, epicId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.ticket.teamId).toBe(teamB);
    expect(cleared.body.ticket.epicId).toBeNull();
  });

  it("filters by team, state, type, and epic", async () => {
    const teamA = await createTeam("Team A");
    const teamB = await createTeam("Team B");
    const epicA = await createEpic(teamA, "Epic A");
    await create(teamA, { type: "bug", epicId: epicA });
    await create(teamA, { type: "feature" });
    await create(teamB, { type: "bug" });

    const byTeam = await request(app).get(`/api/tickets?teamId=${teamA}`).set("Cookie", cookie);
    expect(byTeam.body.tickets).toHaveLength(2);

    const byType = await request(app)
      .get(`/api/tickets?teamId=${teamA}&type=bug`)
      .set("Cookie", cookie);
    expect(byType.body.tickets).toHaveLength(1);

    const byEpic = await request(app).get(`/api/tickets?epicId=${epicA}`).set("Cookie", cookie);
    expect(byEpic.body.tickets).toHaveLength(1);

    const all = await request(app).get("/api/tickets").set("Cookie", cookie);
    expect(all.body.tickets).toHaveLength(3);
  });

  it("deletes a ticket and cascades its comments; 404 for a missing id", async () => {
    const teamId = await createTeam("Platform");
    const created = await create(teamId);
    const id = created.body.ticket.id as string;

    await pool.query(
      `insert into comments (ticket_id, author_id, body) values ($1, $2, $3)`,
      [id, userId, "a comment"],
    );

    const deleted = await request(app).delete(`/api/tickets/${id}`).set("Cookie", cookie);
    expect(deleted.status).toBe(204);

    const remainingComments = await pool.query(`select count(*)::int as n from comments where ticket_id = $1`, [id]);
    expect(remainingComments.rows[0].n).toBe(0);

    const missing = await request(app).delete(`/api/tickets/${MISSING_UUID}`).set("Cookie", cookie);
    expect(missing.status).toBe(404);
  });

  it("validates id format and 404s for a missing detail", async () => {
    const badId = await request(app).get("/api/tickets/not-a-uuid").set("Cookie", cookie);
    expect(badId.status).toBe(400);

    const missing = await request(app).get(`/api/tickets/${MISSING_UUID}`).set("Cookie", cookie);
    expect(missing.status).toBe(404);
  });

  it("rejects anonymous requests with 401", async () => {
    expect((await request(app).get("/api/tickets")).status).toBe(401);
  });
});
