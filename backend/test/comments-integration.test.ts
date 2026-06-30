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

const JWT_SECRET = "comments-integration-secret";
const MISSING_UUID = "00000000-0000-0000-0000-000000000000";

runOrSkip("comments API (integration)", () => {
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

  async function createTicket(teamId: string): Promise<string> {
    const created = await request(app)
      .post("/api/tickets")
      .set("Cookie", cookie)
      .send({ teamId, type: "feature", title: "Ticket", body: "Body" });
    return created.body.ticket.id as string;
  }

  function addComment(ticketId: string, body: unknown) {
    return request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", cookie)
      .send({ body });
  }

  beforeEach(async () => {
    await resetDb();
    const { rows } = await pool.query<{ id: string }>(
      `insert into users (email, password_hash, email_verified)
       values ($1, $2, true) returning id`,
      ["comments.tester@example.com", "not-a-real-hash"],
    );
    userId = rows[0]!.id;
    cookie = `${SESSION_COOKIE}=${signSession({ sub: userId, email: "comments.tester@example.com" }, JWT_SECRET)}`;
  });

  afterAll(async () => {
    await resetDb();
    await pool.end();
  });

  it("adds a comment (author + created_at from server) and reads it back", async () => {
    const teamId = await createTeam("Platform");
    const ticketId = await createTicket(teamId);

    const created = await addComment(ticketId, "First comment");
    expect(created.status).toBe(201);
    expect(created.body.comment.body).toBe("First comment");
    expect(created.body.comment.ticketId).toBe(ticketId);
    expect(created.body.comment.authorId).toBe(userId);
    expect(created.body.comment.authorEmail).toBe("comments.tester@example.com");
    expect(typeof created.body.comment.createdAt).toBe("string");

    const list = await request(app)
      .get(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", cookie);
    expect(list.status).toBe(200);
    expect(list.body.comments).toHaveLength(1);
    expect(list.body.comments[0].body).toBe("First comment");
  });

  it("trims the body and rejects empty/whitespace/oversize bodies with 400", async () => {
    const teamId = await createTeam("Platform");
    const ticketId = await createTicket(teamId);

    const trimmed = await addComment(ticketId, "  Spaced  ");
    expect(trimmed.status).toBe(201);
    expect(trimmed.body.comment.body).toBe("Spaced");

    expect((await addComment(ticketId, "")).status).toBe(400);
    expect((await addComment(ticketId, "   ")).status).toBe(400);
    expect((await addComment(ticketId, "x".repeat(20001))).status).toBe(400);
  });

  it("derives author_id from the session, ignoring a body-supplied authorId", async () => {
    const teamId = await createTeam("Platform");
    const ticketId = await createTicket(teamId);

    const created = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", cookie)
      .send({ body: "Mine", authorId: MISSING_UUID });
    expect(created.status).toBe(201);
    expect(created.body.comment.authorId).toBe(userId);
  });

  it("returns comments oldest-first", async () => {
    const teamId = await createTeam("Platform");
    const ticketId = await createTicket(teamId);

    await addComment(ticketId, "one");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await addComment(ticketId, "two");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await addComment(ticketId, "three");

    const list = await request(app)
      .get(`/api/tickets/${ticketId}/comments`)
      .set("Cookie", cookie);
    expect(list.body.comments.map((c: { body: string }) => c.body)).toEqual(["one", "two", "three"]);
  });

  it("does not change the ticket's modified_at when a comment is added", async () => {
    const teamId = await createTeam("Platform");
    const ticketId = await createTicket(teamId);

    const before = await request(app).get(`/api/tickets/${ticketId}`).set("Cookie", cookie);
    const originalModified = before.body.ticket.modifiedAt as string;

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect((await addComment(ticketId, "A comment")).status).toBe(201);

    const after = await request(app).get(`/api/tickets/${ticketId}`).set("Cookie", cookie);
    expect(after.body.ticket.modifiedAt).toBe(originalModified);
  });

  it("404s for an unknown ticket and 400s for a non-UUID id (list and add)", async () => {
    expect(
      (await request(app).get(`/api/tickets/${MISSING_UUID}/comments`).set("Cookie", cookie)).status,
    ).toBe(404);
    expect((await addComment(MISSING_UUID, "hi")).status).toBe(404);

    expect(
      (await request(app).get(`/api/tickets/not-a-uuid/comments`).set("Cookie", cookie)).status,
    ).toBe(400);
    expect((await addComment("not-a-uuid", "hi")).status).toBe(400);
  });

  it("removes comments when their ticket is deleted (cascade)", async () => {
    const teamId = await createTeam("Platform");
    const ticketId = await createTicket(teamId);
    await addComment(ticketId, "doomed");

    const deleted = await request(app).delete(`/api/tickets/${ticketId}`).set("Cookie", cookie);
    expect(deleted.status).toBe(204);

    const remaining = await pool.query(
      `select count(*)::int as n from comments where ticket_id = $1`,
      [ticketId],
    );
    expect(remaining.rows[0].n).toBe(0);
  });

  it("rejects anonymous requests with 401", async () => {
    const teamId = await createTeam("Platform");
    const ticketId = await createTicket(teamId);

    expect((await request(app).get(`/api/tickets/${ticketId}/comments`)).status).toBe(401);
    expect(
      (await request(app).post(`/api/tickets/${ticketId}/comments`).send({ body: "nope" })).status,
    ).toBe(401);
  });
});
