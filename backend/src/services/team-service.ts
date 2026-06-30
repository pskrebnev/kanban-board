import type pg from "pg";

import { ConflictError, NotFoundError } from "../errors.js";
import {
  createTeam,
  deleteTeam,
  findTeamById,
  isTeamReferenced,
  listTeams,
  renameTeam,
  type TeamRow,
} from "../repositories/team-repository.js";

// Postgres SQLSTATE codes we translate into domain errors.
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

export type Team = {
  id: string;
  name: string;
};

export type TeamSummary = Team & {
  referenced: boolean;
};

export type TeamServiceDeps = {
  pool: pg.Pool;
};

export type TeamService = {
  list(): Promise<TeamSummary[]>;
  create(name: string): Promise<Team>;
  rename(id: string, name: string): Promise<Team>;
  remove(id: string): Promise<void>;
};

function toTeam(row: TeamRow): Team {
  return { id: row.id, name: row.name };
}

function isPgError(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === code;
}

export function createTeamService(deps: TeamServiceDeps): TeamService {
  const { pool } = deps;

  return {
    async list() {
      const rows = await listTeams(pool);
      return rows.map((row) => ({ id: row.id, name: row.name, referenced: row.referenced }));
    },

    async create(name) {
      try {
        const row = await createTeam(pool, name);
        return toTeam(row);
      } catch (error) {
        if (isPgError(error, UNIQUE_VIOLATION)) {
          throw new ConflictError("A team with this name already exists");
        }
        throw error;
      }
    },

    async rename(id, name) {
      const existing = await findTeamById(pool, id);
      if (!existing) {
        throw new NotFoundError("Team not found");
      }

      try {
        const row = await renameTeam(pool, id, name);
        if (!row) {
          throw new NotFoundError("Team not found");
        }
        return toTeam(row);
      } catch (error) {
        if (isPgError(error, UNIQUE_VIOLATION)) {
          throw new ConflictError("A team with this name already exists");
        }
        throw error;
      }
    },

    async remove(id) {
      const existing = await findTeamById(pool, id);
      if (!existing) {
        throw new NotFoundError("Team not found");
      }

      // Pre-check references so the message is specific; the FK-restrict
      // constraint is the ultimate safeguard against a concurrent insert.
      if (await isTeamReferenced(pool, id)) {
        throw new ConflictError("Team has epics or tickets and cannot be deleted");
      }

      try {
        await deleteTeam(pool, id);
      } catch (error) {
        if (isPgError(error, FOREIGN_KEY_VIOLATION)) {
          throw new ConflictError("Team has epics or tickets and cannot be deleted");
        }
        throw error;
      }
    },
  };
}
