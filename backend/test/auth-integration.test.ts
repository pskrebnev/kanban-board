import pg from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { hashToken } from "../src/auth/tokens.js";
import { createPool } from "../src/db/pool.js";
import { AppError } from "../src/errors.js";
import type { Mailer } from "../src/email/mailer.js";
import { createAuthService } from "../src/services/auth-service.js";

// Opt-in integration test against a real, migrated Postgres. Provide
// TEST_DATABASE_URL (or DATABASE_URL) to run it; otherwise it is skipped.

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const runOrSkip = databaseUrl ? describe : describe.skip;

function tokenFromUrl(url: string): string {
  return new URL(url).searchParams.get("token") ?? "";
}

async function expectStatus(promise: Promise<unknown>, status: number): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected an error with status ${status} but none was thrown`);
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).status).toBe(status);
  }
}

runOrSkip("auth flow (integration)", () => {
  const pool: pg.Pool = createPool(databaseUrl as string);
  const sentLinks: string[] = [];
  const mailer: Mailer = {
    async sendVerificationEmail(_to, verifyUrl) {
      sentLinks.push(verifyUrl);
    },
  };
  const auth = createAuthService({ pool, mailer, appBaseUrl: "http://localhost:3000" });

  beforeEach(async () => {
    sentLinks.length = 0;
    await pool.query("truncate table email_verification_tokens, users restart identity cascade");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("signs up, blocks unverified login, verifies, then logs in", async () => {
    await auth.signup("User@Example.com", "supersecret");

    // Unverified users cannot log in.
    await expectStatus(auth.login("user@example.com", "supersecret"), 403);

    const token = tokenFromUrl(sentLinks[0] ?? "");
    await auth.verify(token);

    const user = await auth.login("user@example.com", "supersecret");
    expect(user.email).toBe("user@example.com");
    expect(user.emailVerified).toBe(true);
  });

  it("normalizes email case and rejects duplicates", async () => {
    await auth.signup("Dup@Example.com", "supersecret");
    await expectStatus(auth.signup("dup@example.com", "supersecret"), 409);
  });

  it("rejects a weak password", async () => {
    await expectStatus(auth.signup("weak@example.com", "short"), 400);
  });

  it("rejects bad credentials generically", async () => {
    await auth.signup("real@example.com", "supersecret");
    const token = tokenFromUrl(sentLinks[0] ?? "");
    await auth.verify(token);

    await expectStatus(auth.login("real@example.com", "wrongpass"), 401);
    await expectStatus(auth.login("nobody@example.com", "supersecret"), 401);
  });

  it("treats a verification token as single-use", async () => {
    await auth.signup("once@example.com", "supersecret");
    const token = tokenFromUrl(sentLinks[0] ?? "");

    await auth.verify(token);
    await expectStatus(auth.verify(token), 400);
  });

  it("invalidates earlier tokens when a new one is issued", async () => {
    await auth.signup("resend@example.com", "supersecret");
    const firstToken = tokenFromUrl(sentLinks[0] ?? "");

    await auth.resend("resend@example.com");
    const secondToken = tokenFromUrl(sentLinks[1] ?? "");

    expect(secondToken).not.toBe(firstToken);
    await expectStatus(auth.verify(firstToken), 400);
    await auth.verify(secondToken);
  });

  it("rejects an expired token", async () => {
    await auth.signup("expired@example.com", "supersecret");
    const { rows } = await pool.query<{ id: string }>(
      "select id from users where email = $1",
      ["expired@example.com"],
    );
    const userId = rows[0]?.id;
    expect(userId).toBeTruthy();

    const rawToken = "expired-token-value";
    await pool.query(
      `insert into email_verification_tokens (user_id, token_hash, expires_at)
       values ($1, $2, now() - interval '1 hour')`,
      [userId, hashToken(rawToken)],
    );

    await expectStatus(auth.verify(rawToken), 400);
  });
});
