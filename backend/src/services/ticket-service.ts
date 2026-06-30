import type pg from "pg";

import { NotFoundError, ValidationError } from "../errors.js";
import { assertEpicBelongsToTeam } from "./epic-service.js";
import { findTeamById } from "../repositories/team-repository.js";
import {
  createTicket,
  deleteTicket,
  findTicketById,
  listTickets,
  updateTicket,
  type TicketDetailRow,
  type TicketFilters,
  type TicketState,
  type TicketType,
  type TicketUpdateColumns,
} from "../repositories/ticket-repository.js";

export type Ticket = {
  id: string;
  teamId: string;
  teamName: string;
  epicId: string | null;
  epicTitle: string | null;
  type: TicketType;
  state: TicketState;
  title: string;
  body: string;
  createdBy: string;
  createdByEmail: string;
  createdAt: string;
  modifiedAt: string;
};

export type CreateTicketInput = {
  teamId: string;
  epicId?: string | null;
  type: TicketType;
  state?: TicketState;
  title: string;
  body: string;
};

// Every field is optional: a PATCH may touch any subset. `epicId` distinguishes
// `undefined` (leave unchanged) from `null` (clear the epic).
export type UpdateTicketInput = {
  teamId?: string;
  epicId?: string | null;
  type?: TicketType;
  state?: TicketState;
  title?: string;
  body?: string;
};

export type TicketServiceDeps = {
  pool: pg.Pool;
};

export type TicketService = {
  list(filters: TicketFilters): Promise<Ticket[]>;
  get(id: string): Promise<Ticket | null>;
  create(input: CreateTicketInput, createdBy: string): Promise<Ticket>;
  update(id: string, input: UpdateTicketInput): Promise<Ticket>;
  changeState(id: string, state: TicketState): Promise<Ticket>;
  remove(id: string): Promise<void>;
};

function toTicket(row: TicketDetailRow): Ticket {
  return {
    id: row.id,
    teamId: row.team_id,
    teamName: row.team_name,
    epicId: row.epic_id,
    epicTitle: row.epic_title,
    type: row.type,
    state: row.state,
    title: row.title,
    body: row.body,
    createdBy: row.created_by,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at.toISOString(),
    modifiedAt: row.modified_at.toISOString(),
  };
}

async function assertTeamExists(pool: pg.Pool, teamId: string): Promise<void> {
  const team = await findTeamById(pool, teamId);
  if (!team) {
    throw new ValidationError("Team not found");
  }
}

export function createTicketService(deps: TicketServiceDeps): TicketService {
  const { pool } = deps;

  async function detailOrThrow(id: string): Promise<Ticket> {
    const row = await findTicketById(pool, id);
    if (!row) {
      throw new NotFoundError("Ticket not found");
    }
    return toTicket(row);
  }

  return {
    async list(filters) {
      const rows = await listTickets(pool, filters);
      return rows.map(toTicket);
    },

    async get(id) {
      const row = await findTicketById(pool, id);
      return row ? toTicket(row) : null;
    },

    async create(input, createdBy) {
      await assertTeamExists(pool, input.teamId);

      const epicId = input.epicId ?? null;
      if (epicId !== null) {
        await assertEpicBelongsToTeam(pool, epicId, input.teamId);
      }

      const id = await createTicket(pool, {
        teamId: input.teamId,
        epicId,
        type: input.type,
        state: input.state ?? "new",
        title: input.title,
        body: input.body,
        createdBy,
      });

      return detailOrThrow(id);
    },

    async update(id, input) {
      const existing = await findTicketById(pool, id);
      if (!existing) {
        throw new NotFoundError("Ticket not found");
      }

      // Resolve the post-update team/epic so references can be validated and the
      // cross-team epic rule holds even when the team changes in the same call.
      const nextTeamId = input.teamId ?? existing.team_id;
      const nextEpicId = input.epicId !== undefined ? input.epicId : existing.epic_id;

      if (input.teamId !== undefined && input.teamId !== existing.team_id) {
        await assertTeamExists(pool, input.teamId);
      }

      if (nextEpicId !== null) {
        await assertEpicBelongsToTeam(pool, nextEpicId, nextTeamId);
      }

      // Build the set of genuinely changed columns; a no-op save must not touch
      // modified_at (spec §6).
      const changed: TicketUpdateColumns = {};
      if (input.title !== undefined && input.title !== existing.title) {
        changed.title = input.title;
      }
      if (input.body !== undefined && input.body !== existing.body) {
        changed.body = input.body;
      }
      if (input.type !== undefined && input.type !== existing.type) {
        changed.type = input.type;
      }
      if (input.state !== undefined && input.state !== existing.state) {
        changed.state = input.state;
      }
      if (nextTeamId !== existing.team_id) {
        changed.team_id = nextTeamId;
      }
      if (nextEpicId !== existing.epic_id) {
        changed.epic_id = nextEpicId;
      }

      if (Object.keys(changed).length === 0) {
        return toTicket(existing);
      }

      await updateTicket(pool, id, changed);
      return detailOrThrow(id);
    },

    async changeState(id, state) {
      const existing = await findTicketById(pool, id);
      if (!existing) {
        throw new NotFoundError("Ticket not found");
      }

      // Same state is a no-op: persist nothing and leave modified_at untouched.
      if (existing.state === state) {
        return toTicket(existing);
      }

      await updateTicket(pool, id, { state });
      return detailOrThrow(id);
    },

    async remove(id) {
      const removed = await deleteTicket(pool, id);
      if (!removed) {
        throw new NotFoundError("Ticket not found");
      }
      // Comments are removed automatically via comments.ticket_id ON DELETE CASCADE.
    },
  };
}
