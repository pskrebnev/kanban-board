import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

// Opt-in integration test. Provide TEST_DATABASE_URL (or DATABASE_URL) pointing
// at a freshly migrated database to run it; otherwise it is skipped.
//
// Intended usage (e.g. in CI):
//   1. Start a clean Postgres.
//   2. Run `npm run migrate:up`.
//   3. Run `npm test` with TEST_DATABASE_URL set.
//
// This proves spec §13: after migrations a fresh database contains schema and
// migration metadata only, with no application data.

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const runOrSkip = databaseUrl ? describe : describe.skip;

const expectedTables = [
  "users",
  "email_verification_tokens",
  "password_reset_tokens",
  "teams",
  "epics",
  "tickets",
  "comments",
] as const;

runOrSkip("migration smoke test", () => {
  const pool = new pg.Pool({ connectionString: databaseUrl });

  afterAll(async () => {
    await pool.end();
  });

  it("creates all domain tables", async () => {
    const { rows } = await pool.query<{ table_name: string }>(
      `select table_name
         from information_schema.tables
        where table_schema = 'public'`,
    );

    const tableNames = rows.map((row) => row.table_name);

    for (const table of expectedTables) {
      expect(tableNames).toContain(table);
    }
  });

  it("starts with no application data", async () => {
    for (const table of expectedTables) {
      const { rows } = await pool.query<{ count: number }>(
        `select count(*)::int as count from ${table}`,
      );

      expect(rows[0]?.count).toBe(0);
    }
  });
});
