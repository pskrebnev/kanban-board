# Phase 1 — Persistence Foundation & Migrations

This document is the implementation plan and backlog for **Phase 1** of the Kanban Ticketing
System, as defined in [kanban-ticketing-hls.md](kanban-ticketing-hls.md). It is grounded in
the authoritative spec [KanbanBoard.pdf](KanbanBoard.pdf) (chapters §2, §9, §13).

Phase 1 builds the shared foundation every later phase depends on: a repeatable database
schema, the backend application skeleton (config, data access, error handling), an automated
migrate-on-startup runtime, and a clean single-command start from the repository root.

## Goal

Make the database authoritative and repeatable, and prepare the backend's layered structure
and runtime guarantees, **without** implementing any business features yet (no auth, teams,
epics, tickets, comments behavior).

## Spec Alignment

- **§2 Required Architecture** — clear tier separation; complete solution starts from the
  repository root with a single `docker compose up --build`; no host-installed runtimes.
- **§9 API & Persistence Expectations** — schema creation automated through migrations;
  referential integrity via DB constraints; meaningful HTTP status codes.
- **§13 Definition of Done** — a fresh database contains schema + migration metadata only,
  with no preloaded application data.

## Scope

### In scope

- Migration tooling (`node-pg-migrate`) and an initial schema migration covering the full
  domain (`users`, `email_verification_tokens`, `teams`, `epics`, `tickets`, `comments`).
- Backend foundation: typed config loader, `pg` connection pool + query helper, central
  error handler with HTTP status mapping, and a routes → services → repositories layout.
- Automated migrate-on-startup: the API runs pending migrations before it listens.
- Repository-root, Docker Compose-compatible entrypoint so QA can run
  `docker compose up --build` (and the existing `podman-compose` path keeps working).
- Mailpit added under a `test` compose profile (used by later auth phases).
- Backend test harness (`vitest` + `supertest`) and a migration smoke test.
- Documentation updates (`.env.example`, README, architecture, HLS status).

### Out of scope (later phases)

- Any authentication, authorization, or email-sending logic (Phase 2).
- Any teams/epics/tickets/comments endpoints or UI (Phases 3–7).
- Frontend feature work beyond what already exists.

## Technical Approach

### Database & migrations

- Use `node-pg-migrate` with timestamped migration files under `backend/migrations/`.
- Enable required extensions (`pgcrypto` or `uuid-ossp` for UUIDs; `citext` for
  case-insensitive text).
- Define the full schema now so later phases only add behavior, not tables:
  - `users(id, email citext UNIQUE, password_hash, email_verified, created_at, modified_at)`
  - `email_verification_tokens(id, user_id FK, token_hash, expires_at, consumed_at, created_at)`
  - `teams(id, name, created_at, modified_at)` + unique index on `lower(name)`
  - `epics(id, team_id FK→teams RESTRICT, title, description NULL, created_at, modified_at)`
  - `tickets(id, team_id FK→teams RESTRICT, epic_id FK→epics NULL, type, state, title, body,
    created_by FK→users, created_at, modified_at)` with enum/check constraints for `type`
    and `state`
  - `comments(id, ticket_id FK→tickets ON DELETE CASCADE, author_id FK→users, body, created_at)`
- Foreign-key rules encode spec guards: teams/epics use `RESTRICT` (cannot delete while
  referenced → surfaced as HTTP 409 later); comments cascade with their ticket.

### Backend foundation

- `config.ts`: read and validate environment (`DATABASE_URL`, plus placeholders for future
  `JWT_SECRET`/SMTP). Fail fast on missing required values.
- `db/pool.ts`: a single shared `pg.Pool` and a typed `query` helper.
- `errors.ts` + error-handling middleware: map domain errors to 400/401/403/404/409 and a
  safe 500 fallback; consistent JSON error shape.
- Folder layout: `src/routes/`, `src/services/`, `src/repositories/`, `src/db/`,
  keeping `server.ts` as the composition root. Health/readiness stay public.

### Runtime & compose

- Add a repository-root `compose.yaml` (or `docker-compose.yml`) referencing the existing
  build contexts so `docker compose up --build` works from the root (spec §2). Keep
  `infra/podman/podman-compose.yml` functional.
- Backend container entrypoint runs `node-pg-migrate up` (against `DATABASE_URL`) and only
  then starts the API. Add a DB readiness wait so migrations do not race Postgres startup.
- Add Mailpit as a `test`-profile service for later phases (no effect on default startup).

### Testing & quality gates

- Add `vitest` + `supertest` to the backend with a test script.
- Migration smoke test: apply migrations to a fresh database and assert all expected tables
  exist and contain zero application rows (migration metadata allowed) — proves §13.
- Keep the existing Playwright smoke test green.

---

## Backlog (JIRA-style Epics & Tasks)

Story points are rough relative estimates. IDs are local references (e.g. `P1-1`).

### EPIC P1-E1 — Database Migrations & Schema

> As the system, I need an automated, repeatable schema so a fresh database is ready without
> manual setup and contains no seed data.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P1-1 | Add migration tooling | Install `node-pg-migrate`; add `migrate` npm scripts (`up`/`down`); configure migrations dir + `DATABASE_URL`. | `npm run migrate up` applies against the dev DB; migrations dir is under version control. | 2 |
| P1-2 | Initial extensions & users/tokens | Migration enabling `pgcrypto`/`citext`; create `users` and `email_verification_tokens` with constraints. | Tables exist with correct columns, types, unique email (case-insensitive), and FK from tokens→users. | 3 |
| P1-3 | Teams & epics tables | Create `teams` (unique `lower(name)`) and `epics` (FK→teams `RESTRICT`). | Tables exist; duplicate case-insensitive team name violates the unique index; epic requires a valid team. | 2 |
| P1-4 | Tickets & comments tables | Create `tickets` (type/state checks, FK→teams `RESTRICT`, FK→epics NULL, FK→users) and `comments` (FK→tickets `CASCADE`, FK→users). | Tables exist; invalid `type`/`state` rejected by check constraints; deleting a ticket removes its comments. | 3 |
| P1-5 | Down migrations | Provide reversible `down` for each migration. | `migrate down` cleanly drops objects in reverse order on a dev DB. | 1 |

### EPIC P1-E2 — Backend Application Foundation

> As a developer, I need a typed config, a shared DB pool, consistent error handling, and a
> clear layered structure so feature phases can be built quickly and safely.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P1-6 | Typed config loader | `config.ts` reads/validates env; fails fast on missing required values. | Missing `DATABASE_URL` aborts startup with a clear message; values are strongly typed. | 2 |
| P1-7 | DB pool & query helper | `db/pool.ts` exposes a shared `pg.Pool` and typed `query`. | Readiness endpoint uses the shared pool; no per-request pool creation. | 1 |
| P1-8 | Central error handler | Error types + Express error middleware mapping to 400/401/403/404/409/500 with consistent JSON. | A thrown domain error returns the mapped status and JSON shape; unexpected errors return safe 500. | 2 |
| P1-9 | Layered structure | Introduce `routes/`, `services/`, `repositories/`; keep `server.ts` as composition root; health/ready remain public. | Existing endpoints still work; structure documented; lint/tsc pass. | 2 |

### EPIC P1-E3 — Runtime & Compose

> As QA, I need to start the whole stack from the repository root with one command on a clean
> machine, with the database schema applied automatically.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P1-10 | Root compose entrypoint | Add repo-root `compose.yaml` referencing existing build contexts. | `docker compose up --build` from the repo root brings up frontend, backend, db. | 3 |
| P1-11 | Migrate-on-startup | Backend container runs migrations before listening, with a Postgres readiness wait. | On a fresh volume, the API only serves traffic after migrations succeed; logs show migration run. | 3 |
| P1-12 | Mailpit test profile | Add Mailpit under a `test` profile (for later phases). | `test` profile starts Mailpit; default startup is unaffected. | 1 |
| P1-13 | Podman parity | Ensure `infra/podman/podman-compose.yml` still works with the new startup flow. | `podman-compose ... up --build` performs the same migrate-then-serve flow. | 2 |

### EPIC P1-E4 — Testing & Quality Gates

> As a maintainer, I need automated proof that a fresh database is schema-only and that the
> stack stays healthy.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P1-14 | Backend test harness | Add `vitest` + `supertest`; `npm test` script. | `npm test` runs in the backend; sample test passes. | 2 |
| P1-15 | Migration smoke test | Apply migrations to a fresh DB; assert tables exist and have zero application rows. | Test fails if any seed/application data is present; passes on a clean migrated DB. | 2 |
| P1-16 | Keep e2e green | Verify the existing Playwright smoke test still passes with the new runtime. | `e2e` profile run succeeds end-to-end. | 1 |

### EPIC P1-E5 — Documentation

> As a reader, I need docs that reflect the new persistence foundation and startup flow.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P1-17 | Update `.env.example` | Add placeholders for new/expected vars; no secrets. | New vars present with safe placeholders; `.env` remains git-ignored. | 1 |
| P1-18 | README + architecture | Document migrations, `docker compose up --build`, and the migrate-on-startup flow; advance phase status. | README deploy section and architecture phase status updated. | 2 |
| P1-19 | HLS status update | Mark Phase 1 progress in the HLS phase table. | HLS reflects Phase 1 as in progress/complete. | 1 |

## Phase 1 Definition of Done

- [ ] `node-pg-migrate` applies the full initial schema on a fresh database.
- [ ] A freshly migrated database contains schema + migration metadata only (no application
      rows).
- [ ] The backend runs migrations automatically on startup, before serving traffic.
- [ ] `docker compose up --build` from the repository root starts the full stack on a clean
      machine; the Podman path remains functional.
- [ ] Backend has a typed config, shared DB pool, and a central error handler with correct
      status-code mapping.
- [ ] `vitest`/`supertest` harness exists; the migration smoke test passes; the Playwright
      smoke test still passes.
- [ ] No secrets are committed; `.env.example` documents required variables.
- [ ] README, architecture, and HLS docs reflect the new foundation.

## Dependencies & Risks

- **Migration/Postgres race:** the backend must wait for Postgres readiness before migrating;
  mitigate with a readiness wait/retry in the entrypoint (P1-11).
- **Compose tool parity:** Docker Compose and `podman-compose` differ subtly; validate both
  startup paths (P1-10, P1-13).
- **Schema-now vs behavior-later:** tables are created in Phase 1 but exercised in later
  phases; check constraints and FK rules must match the spec to avoid rework.
- **Cross-platform start:** spec §2 requires a clean start on Windows/macOS/Linux; verify the
  entrypoint script is cross-platform.
