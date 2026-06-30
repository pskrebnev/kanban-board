import type pg from "pg";

import { query } from "../db/pool.js";

export const TICKET_TYPES = ["bug", "feature", "fix"] as const;
export const TICKET_STATES = [
  "new",
  "ready_for_implementation",
  "in_progress",
  "ready_for_acceptance",
  "done",
] as const;

export type TicketType = (typeof TICKET_TYPES)[number];
export type TicketState = (typeof TICKET_STATES)[number];

export type TicketRow = {
  id: string;
  team_id: string;
  epic_id: string | null;
  type: TicketType;
  state: TicketState;
  title: string;
  body: string;
  created_by: string;
  created_at: Date;
  modified_at: Date;
};

// A ticket row enriched with the human-readable names the detail/list screens
// need, so the API avoids N+1 lookups for team, epic, and author.
export type TicketDetailRow = TicketRow & {
  team_name: string;
  epic_title: string | null;
  created_by_email: string;
};

export type TicketFilters = {
  teamId?: string;
  state?: TicketState;
  type?: TicketType;
  epicId?: string;
};

const DETAIL_SELECT = `
  select t.id,
         t.team_id,
         tm.name as team_name,
         t.epic_id,
         e.title as epic_title,
         t.type,
         t.state,
         t.title,
         t.body,
         t.created_by,
         u.email as created_by_email,
         t.created_at,
         t.modified_at
    from tickets t
    join teams tm on tm.id = t.team_id
    left join epics e on e.id = t.epic_id
    join users u on u.id = t.created_by`;

export async function listTickets(
  pool: pg.Pool,
  filters: TicketFilters = {},
): Promise<TicketDetailRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.teamId) {
    params.push(filters.teamId);
    conditions.push(`t.team_id = $${params.length}`);
  }
  if (filters.state) {
    params.push(filters.state);
    conditions.push(`t.state = $${params.length}`);
  }
  if (filters.type) {
    params.push(filters.type);
    conditions.push(`t.type = $${params.length}`);
  }
  if (filters.epicId) {
    params.push(filters.epicId);
    conditions.push(`t.epic_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";

  // Newest-modified first matches the in-column ordering the Phase 7 board needs.
  const result = await query<TicketDetailRow>(
    pool,
    `${DETAIL_SELECT} ${where} order by t.modified_at desc`,
    params,
  );

  return result.rows;
}

export async function findTicketById(pool: pg.Pool, id: string): Promise<TicketDetailRow | null> {
  const result = await query<TicketDetailRow>(pool, `${DETAIL_SELECT} where t.id = $1`, [id]);
  return result.rows[0] ?? null;
}

export type CreateTicketRow = {
  teamId: string;
  epicId: string | null;
  type: TicketType;
  state: TicketState;
  title: string;
  body: string;
  createdBy: string;
};

export async function createTicket(pool: pg.Pool, input: CreateTicketRow): Promise<string> {
  const result = await query<{ id: string }>(
    pool,
    `insert into tickets (team_id, epic_id, type, state, title, body, created_by)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [input.teamId, input.epicId, input.type, input.state, input.title, input.body, input.createdBy],
  );

  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error("Failed to create ticket");
  }
  return id;
}

// The set of columns an update may change. `epic_id` is nullable so it can be
// cleared. Only the keys actually present are written, and the caller is
// responsible for omitting unchanged columns (modified-timestamp semantics).
export type TicketUpdateColumns = Partial<{
  team_id: string;
  epic_id: string | null;
  type: TicketType;
  state: TicketState;
  title: string;
  body: string;
}>;

export async function updateTicket(
  pool: pg.Pool,
  id: string,
  columns: TicketUpdateColumns,
): Promise<void> {
  const assignments: string[] = [];
  const params: unknown[] = [];

  for (const [column, value] of Object.entries(columns)) {
    params.push(value);
    assignments.push(`${column} = $${params.length}`);
  }

  // Always advance modified_at when there is a real change to persist.
  assignments.push("modified_at = now()");

  params.push(id);
  await query(pool, `update tickets set ${assignments.join(", ")} where id = $${params.length}`, params);
}

export async function deleteTicket(pool: pg.Pool, id: string): Promise<boolean> {
  const result = await query(pool, `delete from tickets where id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}
