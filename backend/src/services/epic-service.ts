import type pg from "pg";

import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import {
  createEpic,
  deleteEpic,
  findEpicById,
  isEpicReferenced,
  listEpics,
  updateEpic,
  type EpicRow,
} from "../repositories/epic-repository.js";
import { findTeamById } from "../repositories/team-repository.js";

// Postgres SQLSTATE codes we translate into domain errors.
const FOREIGN_KEY_VIOLATION = "23503";

export type Epic = {
  id: string;
  teamId: string;
  title: string;
  description: string | null;
};

export type EpicSummary = Epic & {
  teamName: string;
  referenced: boolean;
};

export type CreateEpicInput = {
  teamId: string;
  title: string;
  description: string | null;
};

export type UpdateEpicInput = {
  title: string;
  description: string | null;
  // Present only so an attempt to change the team can be rejected explicitly.
  teamId?: string;
};

export type EpicServiceDeps = {
  pool: pg.Pool;
};

export type EpicService = {
  list(teamId?: string): Promise<EpicSummary[]>;
  create(input: CreateEpicInput): Promise<Epic>;
  update(id: string, input: UpdateEpicInput): Promise<Epic>;
  remove(id: string): Promise<void>;
};

function toEpic(row: EpicRow): Epic {
  return { id: row.id, teamId: row.team_id, title: row.title, description: row.description };
}

function isPgError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === code;
}

/**
 * Cross-resource rule reused by Phase 5 (tickets): an epic chosen for a ticket
 * must belong to the same team as the ticket. Throws a `ValidationError` when
 * the epic is missing or belongs to a different team.
 */
export async function assertEpicBelongsToTeam(
  pool: pg.Pool,
  epicId: string,
  teamId: string,
): Promise<void> {
  const epic = await findEpicById(pool, epicId);

  if (!epic) {
    throw new ValidationError("Epic not found");
  }

  if (epic.team_id !== teamId) {
    throw new ValidationError("Epic does not belong to the selected team");
  }
}

export function createEpicService(deps: EpicServiceDeps): EpicService {
  const { pool } = deps;

  return {
    async list(teamId) {
      const rows = await listEpics(pool, teamId);
      return rows.map((row) => ({
        id: row.id,
        teamId: row.team_id,
        teamName: row.team_name,
        title: row.title,
        description: row.description,
        referenced: row.referenced,
      }));
    },

    async create(input) {
      const team = await findTeamById(pool, input.teamId);
      if (!team) {
        throw new ValidationError("Team not found");
      }

      try {
        const row = await createEpic(pool, input.teamId, input.title, input.description);
        return toEpic(row);
      } catch (error) {
        // Fallback if the team was deleted between the check and the insert.
        if (isPgError(error, FOREIGN_KEY_VIOLATION)) {
          throw new ValidationError("Team not found");
        }
        throw error;
      }
    },

    async update(id, input) {
      const existing = await findEpicById(pool, id);
      if (!existing) {
        throw new NotFoundError("Epic not found");
      }

      if (input.teamId !== undefined && input.teamId !== existing.team_id) {
        throw new ValidationError("An epic's team cannot be changed");
      }

      const row = await updateEpic(pool, id, input.title, input.description);
      if (!row) {
        throw new NotFoundError("Epic not found");
      }
      return toEpic(row);
    },

    async remove(id) {
      const existing = await findEpicById(pool, id);
      if (!existing) {
        throw new NotFoundError("Epic not found");
      }

      // Pre-check references so the message is specific; the FK-restrict
      // constraint on tickets.epic_id is the ultimate safeguard.
      if (await isEpicReferenced(pool, id)) {
        throw new ConflictError("Epic has tickets and cannot be deleted");
      }

      try {
        await deleteEpic(pool, id);
      } catch (error) {
        if (isPgError(error, FOREIGN_KEY_VIOLATION)) {
          throw new ConflictError("Epic has tickets and cannot be deleted");
        }
        throw error;
      }
    },
  };
}
