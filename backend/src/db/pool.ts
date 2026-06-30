import pg from "pg";

const { Pool } = pg;

export type QueryParams = ReadonlyArray<unknown>;

/**
 * Creates the shared connection pool. A single pool should be created per
 * process and injected where needed; avoid creating a pool per request.
 */
export function createPool(connectionString: string): pg.Pool {
  return new Pool({ connectionString });
}

/**
 * Thin typed query helper around a pool. Keeps call sites concise and gives a
 * single place to add logging or instrumentation later.
 */
export async function query<Row extends pg.QueryResultRow>(
  pool: pg.Pool,
  text: string,
  params?: QueryParams,
): Promise<pg.QueryResult<Row>> {
  return pool.query<Row>(text, params ? [...params] : undefined);
}
