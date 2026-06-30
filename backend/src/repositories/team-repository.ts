import type pg from "pg";

import { query } from "../db/pool.js";

export type TeamRow = {
  id: string;
  name: string;
  created_at: Date;
  modified_at: Date;
};

// A team row plus whether any epic or ticket references it, so the API can
// expose delete-eligibility in a single list call.
export type TeamListRow = TeamRow & { referenced: boolean };

export async function listTeams(pool: pg.Pool): Promise<TeamListRow[]> {
  const result = await query<TeamListRow>(
    pool,
    `select t.id,
            t.name,
            t.created_at,
            t.modified_at,
            (exists (select 1 from epics e where e.team_id = t.id)
             or exists (select 1 from tickets ti where ti.team_id = t.id)) as referenced
       from teams t
      order by t.name asc`,
  );

  return result.rows;
}

export async function createTeam(pool: pg.Pool, name: string): Promise<TeamRow> {
  const result = await query<TeamRow>(
    pool,
    `insert into teams (name) values ($1) returning id, name, created_at, modified_at`,
    [name],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error("Failed to create team");
  }

  return row;
}

export async function findTeamById(pool: pg.Pool, id: string): Promise<TeamRow | null> {
  const result = await query<TeamRow>(
    pool,
    `select id, name, created_at, modified_at from teams where id = $1`,
    [id],
  );

  return result.rows[0] ?? null;
}

export async function renameTeam(pool: pg.Pool, id: string, name: string): Promise<TeamRow | null> {
  const result = await query<TeamRow>(
    pool,
    `update teams
        set name = $2,
            modified_at = now()
      where id = $1
      returning id, name, created_at, modified_at`,
    [id, name],
  );

  return result.rows[0] ?? null;
}

export async function deleteTeam(pool: pg.Pool, id: string): Promise<boolean> {
  const result = await query(pool, `delete from teams where id = $1`, [id]);

  return (result.rowCount ?? 0) > 0;
}

/**
 * Returns true when any epic or ticket references the team. Used to give the
 * delete path a specific, friendly conflict message instead of relying solely
 * on the database FK-restrict violation.
 */
export async function isTeamReferenced(pool: pg.Pool, id: string): Promise<boolean> {
  const result = await query<{ referenced: boolean }>(
    pool,
    `select (exists (select 1 from epics e where e.team_id = $1)
             or exists (select 1 from tickets ti where ti.team_id = $1)) as referenced`,
    [id],
  );

  return result.rows[0]?.referenced ?? false;
}
