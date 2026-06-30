import type pg from "pg";

import { query } from "../db/pool.js";

export type EpicRow = {
  id: string;
  team_id: string;
  title: string;
  description: string | null;
  created_at: Date;
  modified_at: Date;
};

// An epic row joined to its team name and with a flag for whether any ticket
// references it, so the API can expose delete-eligibility and team context in a
// single list call.
export type EpicListRow = EpicRow & {
  team_name: string;
  referenced: boolean;
};

export async function listEpics(pool: pg.Pool, teamId?: string): Promise<EpicListRow[]> {
  const filter = teamId ? "where e.team_id = $1" : "";
  const params = teamId ? [teamId] : [];

  const result = await query<EpicListRow>(
    pool,
    `select e.id,
            e.team_id,
            t.name as team_name,
            e.title,
            e.description,
            e.created_at,
            e.modified_at,
            exists (select 1 from tickets ti where ti.epic_id = e.id) as referenced
       from epics e
       join teams t on t.id = e.team_id
       ${filter}
      order by e.title asc`,
    params,
  );

  return result.rows;
}

export async function createEpic(
  pool: pg.Pool,
  teamId: string,
  title: string,
  description: string | null,
): Promise<EpicRow> {
  const result = await query<EpicRow>(
    pool,
    `insert into epics (team_id, title, description)
     values ($1, $2, $3)
     returning id, team_id, title, description, created_at, modified_at`,
    [teamId, title, description],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error("Failed to create epic");
  }

  return row;
}

export async function findEpicById(pool: pg.Pool, id: string): Promise<EpicRow | null> {
  const result = await query<EpicRow>(
    pool,
    `select id, team_id, title, description, created_at, modified_at from epics where id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function updateEpic(
  pool: pg.Pool,
  id: string,
  title: string,
  description: string | null,
): Promise<EpicRow | null> {
  const result = await query<EpicRow>(
    pool,
    `update epics
        set title = $2,
            description = $3,
            modified_at = now()
      where id = $1
      returning id, team_id, title, description, created_at, modified_at`,
    [id, title, description],
  );

  return result.rows[0] ?? null;
}

export async function deleteEpic(pool: pg.Pool, id: string): Promise<boolean> {
  const result = await query(pool, `delete from epics where id = $1`, [id]);

  return (result.rowCount ?? 0) > 0;
}

/**
 * Returns true when any ticket references the epic. Used to give the delete
 * path a specific, friendly conflict message instead of relying solely on the
 * database FK-restrict violation.
 */
export async function isEpicReferenced(pool: pg.Pool, id: string): Promise<boolean> {
  const result = await query<{ referenced: boolean }>(
    pool,
    `select exists (select 1 from tickets ti where ti.epic_id = $1) as referenced`,
    [id],
  );

  return result.rows[0]?.referenced ?? false;
}
