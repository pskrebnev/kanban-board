import type pg from "pg";

import { query } from "../db/pool.js";

export type PasswordResetTokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
};

export async function createPasswordResetToken(
  pool: pg.Pool,
  userId: string,
  tokenHash: string,
  expiresAt: Date,
): Promise<PasswordResetTokenRow> {
  const result = await query<PasswordResetTokenRow>(
    pool,
    `insert into password_reset_tokens (user_id, token_hash, expires_at)
     values ($1, $2, $3)
     returning *`,
    [userId, tokenHash, expiresAt],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error("Failed to create password reset token");
  }

  return row;
}

export async function findPasswordResetTokenByHash(
  pool: pg.Pool,
  tokenHash: string,
): Promise<PasswordResetTokenRow | null> {
  const result = await query<PasswordResetTokenRow>(
    pool,
    `select * from password_reset_tokens where token_hash = $1`,
    [tokenHash],
  );

  return result.rows[0] ?? null;
}

export async function consumePasswordResetToken(pool: pg.Pool, id: string): Promise<void> {
  await query(
    pool,
    `update password_reset_tokens
        set consumed_at = now()
      where id = $1`,
    [id],
  );
}

/** Invalidates all unused reset tokens for a user so only the freshest one is valid. */
export async function invalidateUserPasswordResetTokens(
  pool: pg.Pool,
  userId: string,
): Promise<void> {
  await query(
    pool,
    `update password_reset_tokens
        set consumed_at = now()
      where user_id = $1
        and consumed_at is null`,
    [userId],
  );
}
