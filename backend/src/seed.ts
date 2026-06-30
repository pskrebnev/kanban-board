import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type pg from "pg";
import { z } from "zod";

import { hashPassword } from "./auth/password.js";
import { createPool } from "./db/pool.js";

// Development/QA seed loader. This is intentionally NOT part of the default
// runtime: the spec requires a fresh database to contain schema + migration
// metadata only. Run it explicitly (`npm run seed`) or via SEED_ON_START=true
// in the ephemeral seed compose file.
//
// The dataset is read from a JSON file so data can be exported/edited and
// imported into the app without code changes. Point SEED_FILE at your own file
// to import custom data; otherwise the bundled seed/data.json is used. The
// script is idempotent: it truncates all application tables and re-inserts the
// dataset, so every run produces the same known state.

const ticketTypes = ["bug", "feature", "fix"] as const;
const ticketStates = [
  "new",
  "ready_for_implementation",
  "in_progress",
  "ready_for_acceptance",
  "done",
] as const;

const datasetSchema = z.object({
  users: z
    .array(
      z.object({
        email: z.email(),
        password: z.string().min(8),
        emailVerified: z.boolean().optional(),
      }),
    )
    .default([]),
  teams: z.array(z.object({ name: z.string().trim().min(1) })).default([]),
  epics: z
    .array(
      z.object({
        team: z.string(),
        title: z.string().trim().min(1),
        description: z.string().nullable().optional(),
      }),
    )
    .default([]),
  tickets: z
    .array(
      z.object({
        team: z.string(),
        epic: z.string().nullable().optional(),
        type: z.enum(ticketTypes),
        state: z.enum(ticketStates),
        title: z.string().trim().min(1),
        body: z.string(),
        createdBy: z.email(),
      }),
    )
    .default([]),
  comments: z
    .array(
      z.object({
        ticket: z.string(),
        author: z.email(),
        body: z.string().trim().min(1),
      }),
    )
    .default([]),
});

type Dataset = z.infer<typeof datasetSchema>;

function resolveSeedFile(): string {
  return process.env.SEED_FILE ?? resolve(process.cwd(), "seed", "data.json");
}

function loadDataset(): { source: string; data: Dataset } {
  const source = resolveSeedFile();

  let raw: string;
  try {
    raw = readFileSync(source, "utf8");
  } catch {
    throw new Error(
      `Seed data file not found at "${source}". Set SEED_FILE to a JSON dataset path.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Seed data file "${source}" is not valid JSON: ${(error as Error).message}`);
  }

  const result = datasetSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Seed data file "${source}" failed validation: ${result.error.issues
        .map((issue) => `${issue.path.join(".")} ${issue.message}`)
        .join("; ")}`,
    );
  }

  return { source, data: result.data };
}

function requireRef<T>(map: Map<string, T>, key: string, kind: string): T {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Seed references unknown ${kind} "${key}"`);
  }
  return value;
}

async function insertDataset(pool: pg.Pool, data: Dataset): Promise<void> {
  await pool.query(
    `truncate table comments, tickets, epics, teams,
                    password_reset_tokens, email_verification_tokens, users
     restart identity cascade`,
  );

  const userIdByEmail = new Map<string, string>();
  for (const user of data.users) {
    const passwordHash = await hashPassword(user.password);
    const { rows } = await pool.query<{ id: string }>(
      `insert into users (email, password_hash, email_verified)
       values ($1, $2, $3) returning id`,
      [user.email, passwordHash, user.emailVerified ?? true],
    );
    userIdByEmail.set(user.email, rows[0]!.id);
  }

  const teamIdByName = new Map<string, string>();
  for (const team of data.teams) {
    const { rows } = await pool.query<{ id: string }>(
      `insert into teams (name) values ($1) returning id`,
      [team.name],
    );
    teamIdByName.set(team.name, rows[0]!.id);
  }

  const epicIdByTitle = new Map<string, string>();
  for (const epic of data.epics) {
    const teamId = requireRef(teamIdByName, epic.team, "team");
    const { rows } = await pool.query<{ id: string }>(
      `insert into epics (team_id, title, description) values ($1, $2, $3) returning id`,
      [teamId, epic.title, epic.description ?? null],
    );
    epicIdByTitle.set(epic.title, rows[0]!.id);
  }

  const ticketIdByTitle = new Map<string, string>();
  for (const ticket of data.tickets) {
    const teamId = requireRef(teamIdByName, ticket.team, "team");
    const epicId = ticket.epic ? requireRef(epicIdByTitle, ticket.epic, "epic") : null;
    const createdBy = requireRef(userIdByEmail, ticket.createdBy, "user");
    const { rows } = await pool.query<{ id: string }>(
      `insert into tickets (team_id, epic_id, type, state, title, body, created_by)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [teamId, epicId, ticket.type, ticket.state, ticket.title, ticket.body, createdBy],
    );
    ticketIdByTitle.set(ticket.title, rows[0]!.id);
  }

  for (const comment of data.comments) {
    const ticketId = requireRef(ticketIdByTitle, comment.ticket, "ticket");
    const authorId = requireRef(userIdByEmail, comment.author, "user");
    await pool.query(
      `insert into comments (ticket_id, author_id, body) values ($1, $2, $3)`,
      [ticketId, authorId, comment.body],
    );
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed");
  }

  const { source, data } = loadDataset();
  const pool = createPool(databaseUrl);

  try {
    await insertDataset(pool, data);
    console.log(
      `[seed] Imported from "${source}": ${data.users.length} users, ${data.teams.length} teams, ` +
        `${data.epics.length} epics, ${data.tickets.length} tickets, ${data.comments.length} comments.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[seed] Failed to load seed data:", error instanceof Error ? error.message : error);
  process.exit(1);
});
