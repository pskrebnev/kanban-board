# Definition of Done — Verification Checklist

This document maps every **Definition of Done** item from the authoritative spec
([KanbanBoard.pdf](KanbanBoard.pdf) §13), plus the key non-functional requirements (§11), to the
concrete proof that satisfies it — an automated test, a CI job, or a reproducible manual/scripted
procedure. It is the deliverable of **Phase 8** ([phase-8.md](phase-8.md)).

Legend for **How it's proven**: 🤖 automated test · ⚙️ CI job · 📋 documented procedure.

## Spec §13 — Definition of Done

| # | Definition of Done item | How it's proven | Where |
|---|---|---|---|
| 1 | A user can sign up, receive a verification email via SMTP, verify, and log in | 🤖 | Playwright `auth-flow` and `dod-flow` (sign up → Mailpit → verify → log in) |
| 2 | Teams and epics are managed through the UI and persist in the DB | 🤖 | `teams-flow`, `epics-flow`, `dod-flow`; backend `teams-integration`, `epics-integration` |
| 3 | A verified user can create, view, edit, and delete tickets | 🤖 | `tickets-flow`; backend `tickets-integration` |
| 4 | A user can add comments and see author + timestamp | 🤖 | `comments-flow`, `dod-flow`; backend `comments-integration` |
| 5 | The board shows tickets in the correct state columns per team | 🤖 | `board-flow`, `dod-flow` (five fixed columns, per-team) |
| 6 | Dragging a ticket to another column updates the server and survives refresh | 🤖 | `board-flow` (drag + reload), `dod-flow` (drag New→Done + reload) |
| 7 | The app starts from a clean checkout with one compose command from the repo root | ⚙️📋 | CI `e2e` job (`cp .env.example .env` → `docker compose --profile test up --build`); [README](../README.md#quick-commands) `make up` |
| 8 | No hard-coded user password or committed secret | 🤖⚙️📋 | Passwords hashed (Argon2id) — backend `auth-unit`; `.env` git-ignored (see [audit](#secrets--security-audit)); CI runs on the tree |
| 9 | A fresh database starts with schema + migration metadata only | 🤖 | backend `migrations.smoke` — asserts every application table has 0 rows |
| 10 | QA can create all data through the UI/API without manual DB edits | 🤖📋 | `dod-flow` creates team→epic→ticket→comment entirely through the UI |

## Spec §11 — Non-Functional Requirements

| Requirement | How it's proven | Where |
|---|---|---|
| Protect authenticated endpoints | 🤖 | backend `access-control-integration` — every protected route → `401` anon, `403` unverified; public allow-list reachable |
| Meaningful HTTP status codes | 🤖 | `access-control-integration` — `400`/`404`/`409` contract across resources |
| Hash passwords (Argon2id) | 🤖 | backend `auth-unit` (hash/verify round-trip); no plaintext persisted |
| Validate input server-side | 🤖 | `zod` on every mutating endpoint; exercised across the backend integration suites |
| Reliability: survive refresh | 🤖 | `board-flow`/`dod-flow` reload assertions |
| Reliability: survive restart | 📋 | [Restart procedure](#persistence-across-restart) below |
| Usability: loading/empty/success/error states | 🤖📋 | present on every screen (Phases 3–7); spot-checked in flows |
| Compatibility: current Chrome/Edge/Firefox | 📋 | [Browser compatibility](#browser-compatibility) below |
| Maintainability: README with setup/config/startup | 📋 | [README](../README.md) |
| Testing: ≥1 backend + ≥1 frontend/API flow | 🤖⚙️ | 6 backend integration suites + 8 Playwright flows, all in CI |

## Automated coverage summary

- **Backend (Vitest/Supertest, against a real Postgres):** `auth-unit`, `auth-integration`,
  `teams-integration`, `epics-integration`, `tickets-integration`, `comments-integration`,
  `access-control-integration`, `migrations.smoke`, `config`, `app`.
- **End-to-end (Playwright/Chromium):** `smoke`, `auth-flow`, `teams-flow`, `epics-flow`,
  `tickets-flow`, `comments-flow`, `board-flow`, `dod-flow`.
- **CI:** [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs the backend suite (with a
  Postgres service), the frontend build, and the full e2e suite on every push and PR.

## Procedures

### Persistence across restart

1. Start the stack with a persistent (named-volume) DB: `make up` (or `docker compose up --build`).
2. Sign up/verify/log in and create a team, epic, and ticket through the UI.
3. Stop **without** removing volumes: `docker compose down` (no `-v`).
4. Start again: `docker compose up`. Log back in — the team, epic, and ticket are still present.
5. To confirm a clean reset instead, `docker compose down -v` wipes the volume and the next start
   comes up schema-only (see item §13.9).

> Note: the ephemeral **seed** mode (`compose.seed.yaml`) deliberately uses a tmpfs DB and is the
> exception — it is flushed on stop by design and is never the default path.

### Clean-checkout start

1. From a fresh clone with only Docker (or Podman) installed: `cp .env.example .env`.
2. `docker compose up --build` from the repository root.
3. Migrations apply automatically before the API serves; `GET /api/health` and `GET /api/ready`
   return OK and the SPA loads. No manual database setup and no seed data on the default path.

This is exercised on every push by the CI `e2e` job, which runs exactly this clean-checkout path.

### Secrets & security audit

- `.gitignore` excludes `.env` and `.env.*` while keeping `.env.example`; no `.env` is tracked
  (`git ls-files | grep .env` returns only `.env.example`).
- `.env.example` contains placeholders only (e.g. `JWT_SECRET=change_this_local_jwt_secret`).
- Passwords are stored as Argon2id hashes; the session is a JWT in an httpOnly, SameSite cookie,
  never placed in a URL (only the single-use email-verification token appears in the verify link,
  which spec §9 explicitly allows).

### Browser compatibility

The automated e2e suite runs on Chromium (covering Chrome/Edge, which share the engine). Firefox is
verified manually against the current desktop release by walking the `dod-flow` steps through the
UI. A dedicated Firefox Playwright project is a low-value optional follow-up (spec §14) and is
deferred; the requirement is "support", verified by this check.

| Browser | Engine | Status |
|---|---|---|
| Chrome (current desktop) | Chromium | ✅ automated (Playwright) |
| Edge (current desktop) | Chromium | ✅ automated (shared engine) |
| Firefox (current desktop) | Gecko | 📋 manual `dod-flow` walkthrough |
