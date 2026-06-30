import type pg from "pg";

import { query } from "../db/pool.js";

export type VerificationTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
};

export async function createVerificationToken(
  pool: pg.Pool,
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<VerificationTokenRow> {
  const result = await query<VerificationTokenRow>(
    pool,
    `insert into email_verification_tokens (user_id, token_hash, expires_at)
     values ($1, $2, $3)
     returning *`,
    [userId, tokenHash, expiresAt],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error("Failed to create verification token");
  }

  return row;
}

export async function findVerificationTokenByHash(
  pool: pg.Pool,
  tokenHash: string,
): Promise<VerificationTokenRow | null> {
  const result = await query<VerificationTokenRow>(
    pool,
    `select * from email_verification_tokens where token_hash = $1`,
    [tokenHash],
  );

  return result.rows[0] ?? null;
}

export async function consumeVerificationToken(pool: pg.Pool, id: string): Promise<void> {
  await query(
    pool,
    `update email_verification_tokens
        set consumed_at = now()
      where id = $1`,
    [id],
  );
}

/** Invalidates all unused tokens for a user so a freshly issued token is the only valid one. */
export async function invalidateUserTokens(pool: pg.Pool, userId: string): Promise<void> {
  await query(
    pool,
    `update email_verification_tokens
        set consumed_at = now()
      where user_id = $1
        and consumed_at is null`,
    [userId],
  );
}
