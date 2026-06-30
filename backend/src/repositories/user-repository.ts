import type pg from "pg";

import { query } from "../db/pool.js";

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  email_verified: boolean;
  created_at: Date;
  modified_at: Date;
};

export async function createUser(
  pool: pg.Pool,
  email: string,
  passwordHash: string,
): Promise<UserRow> {
  const result = await query<UserRow>(
    pool,
    `insert into users (email, password_hash)
     values ($1, $2)
     returning *`,
    [email, passwordHash],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error("Failed to create user");
  }

  return row;
}

export async function findUserByEmail(pool: pg.Pool, email: string): Promise<UserRow | null> {
  const result = await query<UserRow>(pool, `select * from users where email = $1`, [email]);

  return result.rows[0] ?? null;
}

export async function findUserById(pool: pg.Pool, id: string): Promise<UserRow | null> {
  const result = await query<UserRow>(pool, `select * from users where id = $1`, [id]);

  return result.rows[0] ?? null;
}

export async function markUserVerified(pool: pg.Pool, id: string): Promise<void> {
  await query(
    pool,
    `update users
        set email_verified = true,
            modified_at = now()
      where id = $1`,
    [id],
  );
}

/**
 * Updates a user's password. A successful reset also marks the email as
 * verified, since clicking the emailed reset link proves control of the inbox.
 */
export async function updateUserPassword(
  pool: pg.Pool,
  id: string,
  passwordHash: string,
): Promise<void> {
  await query(
    pool,
    `update users
        set password_hash = $2,
            email_verified = true,
            modified_at = now()
      where id = $1`,
    [id, passwordHash],
  );
}
