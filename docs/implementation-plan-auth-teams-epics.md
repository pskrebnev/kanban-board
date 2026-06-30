# Implementation Plan: Authentication, Teams, and Epics (Spec Chapters 3–5)

This document captures the agreed implementation and testing plan for the next stages of
the Kanban Ticketing System: **Chapter 3 (User Accounts & Authentication)**,
**Chapter 4 (Teams)**, and **Chapter 5 (Epics)** from `docs/KanbanBoard.pdf`.

It is a planning artifact for future reference. Chapters 6 (Tickets), 7 (Comments), and
8 (Kanban Board) are out of scope for this plan and are referenced only where they affect
schema or validation design.

## Starting Point

The repository is a Phase-1 scaffold:

- Backend exposes only `/api/health`, `/api/ready`, and a static `/api` resource index.
- No database migrations, no domain tables, no authentication.
- Frontend renders a mock board with local state only.

Chapters 3–5 therefore require a shared foundation (migrations, config, auth middleware,
error handling) before the chapter-specific features are built on top.

## Key Technical Decisions

| Concern | Decision | Rationale |
|---|---|---|
| Migrations | `node-pg-migrate` | Repeatable; fresh DB contains schema + migration metadata only (spec §9), no seed data |
| Password hashing | `argon2` (Argon2id) | Spec §3 explicitly names Argon2id |
| Auth transport | JWT in an **httpOnly, SameSite cookie** | Spec §9 allows cookie or bearer; tokens must not be in URLs. httpOnly cookie avoids XSS token theft and is simplest for the SPA |
| Email | `nodemailer` with SMTP from env (must support `relay1.dataart.com`) | Spec §3 requires configurable SMTP |
| Local email testing | Mailpit as a `test`-profile compose service | Capture verification emails locally; production points at `relay1.dataart.com` via env |
| Validation | `zod` | Server-side enforcement of all inputs (spec §9) |
| Backend tests | `vitest` + `supertest` against a real Postgres | Spec §11 requires an automated backend flow test |
| Frontend/E2E tests | Playwright (already present) | Spec §11 requires a frontend/API flow test |

## 1. Cross-Cutting Foundation (do first)

Implementation steps:

1. Add `node-pg-migrate` and a `migrate` npm script in `backend/`. Add an entrypoint that
   runs migrations on container start **before** the API begins listening.
2. Create migration `001_init` with required extensions plus the tables for these chapters:
   - `users` (id UUID, email `citext` UNIQUE, password_hash, email_verified bool,
     created_at, modified_at)
   - `email_verification_tokens` (id, user_id FK, token_hash, expires_at, consumed_at,
     created_at)
   - `teams` (id, name, created_at, modified_at) with a case-insensitive unique index on
     `lower(name)`
   - `epics` (id, team_id FK → teams, title, description nullable, created_at, modified_at)
   - Use the `citext` extension (or `lower()` unique indexes) for case-insensitive
     uniqueness.
3. Add a DB access layer (`backend/src/db/pool.ts`) and a thin query helper.
4. Add a central Express error handler mapping errors to HTTP status codes:
   400 validation, 401 auth, 403 unverified, 404 missing, 409 conflict.
5. Add config loading/validation (`backend/src/config.ts`) for `DATABASE_URL`,
   `JWT_SECRET`, SMTP variables, `APP_BASE_URL`, and token TTL.
6. Update `.env.example` with the new variables (JWT secret, SMTP host/port/user/pass/from,
   app base URL). No real secrets committed.

Test: migrations run cleanly on a fresh DB and produce schema + migration metadata only
(no application rows), satisfying Definition of Done §13.

## 2. Chapter 3 — User Accounts & Authentication

Backend steps:

1. `POST /api/auth/signup` — validate email (trim, lowercase) and password (≥8 chars);
   hash with Argon2id; insert user with `email_verified=false`; generate a single-use token
   (store only its hash) with 24h expiry; send verification email via SMTP. Return 201.
   Duplicate email → 409.
2. `GET /api/auth/verify?token=...` — validate token, check expiry/consumed, mark user
   verified and consume token. (Token in URL is the one allowed exception per §9.) On
   success the frontend routes the user to login.
3. `POST /api/auth/resend` — for an unverified email, invalidate prior unused tokens, issue
   a new one, and resend.
4. `POST /api/auth/login` — verify credentials with Argon2; reject unverified users (403);
   issue JWT in an httpOnly cookie. Bad credentials → 401.
5. `POST /api/auth/logout` — clear the cookie.
6. `GET /api/auth/me` — return the current user for SPA session bootstrap.
7. `requireAuth` middleware applied to all business routes (teams, epics, and future
   tickets/comments). Public: signup, login, verify, resend, `/api/health`, `/api/ready`,
   and static assets.

Frontend steps (React Router):

1. Screens: Sign-up, Login, Email-verification-result (reads token result),
   Resend-verification action.
2. Auth store (Zustand) calling `/api/auth/me`; a `<ProtectedRoute>` wrapper that redirects
   unauthenticated users to login.
3. Loading, empty, success, and error states on every form (spec §11).

Tests:

- Backend integration (`vitest` + `supertest`): signup → unverified login blocked (403) →
  verify with token → login succeeds (cookie set). Duplicate email → 409. Password < 8 →
  400. Expired/reused token → rejected. Resend invalidates the old token.
- Unit: password hashing/verify; token hashing and expiry logic.
- E2E (Playwright): sign-up form submits and shows a "check your email" state; login screen
  rejects bad credentials with a visible error. Email capture via the Mailpit catcher.

## 3. Chapter 4 — Teams

Backend steps (all behind `requireAuth`):

1. `GET /api/teams` — list teams (id, name, created_at, modified_at; ISO-8601 UTC).
2. `POST /api/teams` — name trimmed, non-empty, unique case-insensitive (409 on conflict,
   400 on empty).
3. `PATCH /api/teams/:id` — rename with the same validation; bump `modified_at`. 404 if
   missing.
4. `DELETE /api/teams/:id` — block if the team has any epics or tickets → 409 with a clear
   message; no cascade. Enforced via FK `RESTRICT` plus a pre-check count for a friendly
   message.

Frontend steps:

1. Team management screen: list, create, inline rename, delete-with-confirmation.
2. Disable/explain delete when the team is referenced (matches wireframe behavior); surface
   the 409 message.

Tests:

- Backend: create/list/rename; duplicate name (case-insensitive) → 409; empty name → 400;
  delete empty team OK; delete team with an epic → 409.
- E2E: create a team and see it appear; an invalid (empty) name shows a validation error.

## 4. Chapter 5 — Epics

Backend steps (behind `requireAuth`):

1. `GET /api/epics?teamId=...` — list epics, optionally filtered by team.
2. `POST /api/epics` — requires `teamId` (must exist) and a non-empty trimmed title;
   optional description. Team is fixed at creation.
3. `PATCH /api/epics/:id` — edit title/description; reject team changes (out of scope per
   §5); bump `modified_at`.
4. `DELETE /api/epics/:id` — block if any ticket references the epic → 409 with a clear
   message. The tickets table does not exist until Chapter 6; design the FK now so the guard
   becomes automatic later. Until then the guard is effectively a no-op but the endpoint and
   409 path are built.
5. Prepare the same-team epic↔ticket rule as a reusable validator for Chapter 6.

Frontend steps:

1. Epic management screen: create (with team selector), list (grouped/filterable by team),
   edit, delete-with-confirmation.
2. Disable/explain delete when referenced; surface the 409.

Tests:

- Backend: create epic under a team; empty title → 400; non-existent team → 400/404; edit
  title; attempt to change team → rejected; delete unreferenced epic OK.
- E2E: create an epic for a team and see it listed.

## 5. README & Docs Updates (done alongside implementation)

- `README.md`: new env vars (JWT secret, SMTP, app base URL); migration command and
  auto-run-on-startup note; a "Database migrations" section; an "Authentication & email
  verification" section (including SMTP / `relay1.dataart.com` config and the local Mailpit
  catcher for testing); and an updated API endpoint list.
- `.env.example`: new variables with safe placeholder values.
- `docs/architecture.md`: advance the phase status; document the auth flow, migrations, and
  the teams/epics data model; update the change log.

## 6. Testing Strategy (overall)

1. Backend integration tests (`vitest` + `supertest`) run against a real Postgres — either a
   `test` profile in compose or an ephemeral DB — with migrations applied and truncation
   between tests. Covers the auth, teams, and epics flows above. Satisfies "at least one
   backend business flow" (§11).
2. Email testing: add Mailpit as a `test`-profile compose service so verification emails can
   be captured without real delivery; production stays pointed at `relay1.dataart.com` via
   env.
3. Frontend/API E2E (Playwright): the auth and team/epic happy paths above (§11 frontend
   flow).
4. Quality gates: `tsc` typecheck (backend and frontend), frontend build, and the test
   suites — runnable locally and wired for CI later.

## 7. Suggested Execution Order

1. Foundation (migrations, config, error handler, auth middleware skeleton).
2. Chapter 3 backend → Chapter 3 frontend → tests.
3. Chapter 4 backend → frontend → tests.
4. Chapter 5 backend → frontend → tests.
5. README/docs updates throughout, with a final pass at the end.
