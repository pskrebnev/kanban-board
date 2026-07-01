# Kanban Ticketing System

A Kanban-style ticket tracker built as a three-tier single-page application: a React SPA, a
TypeScript REST API, and a PostgreSQL database, all run in containers.

---

## A. What This App Is For

Kanban Ticketing helps teams organize work as tickets and move them through a fixed Kanban
workflow. Registered users sign in, group tickets by **team**, optionally organize them under
**epics**, and track each ticket across five workflow states on a draggable board:

```text
new → ready_for_implementation → in_progress → ready_for_acceptance → done
```

The goal is a small, complete, self-hosted ticket tracker that demonstrates a clear separation
between presentation, application/API, and persistence tiers. Scrum, sprints, SSO, and
advanced project-management features are intentionally out of scope.

For the full product specification see [docs/KanbanBoard.pdf](docs/KanbanBoard.pdf), and for
the planned solution see the [High Level Solution](docs/kanban-ticketing-hls.md).

---

## B. Functionality

The project is delivered in phases. The status below reflects what is actually built today.

### Implemented

- Three-tier containerized runtime (React SPA + Nginx, Express API, PostgreSQL 15).
- Single-command start from the repository root via `docker compose up --build`, plus a
  Podman / `podman-compose` path.
- **Database schema & migrations** (`node-pg-migrate`) for the full domain (users, teams,
  epics, tickets, comments, verification tokens), applied automatically on backend startup.
- Backend foundation: typed config loader, shared PostgreSQL pool, central error handler,
  and a layered route structure.
- **Authentication** — email/password sign-up, SMTP email verification (24h single-use
  tokens, resend), login/logout with a JWT session cookie, and `requireAuth` protection of
  business endpoints. Passwords are hashed with Argon2id.
- **Password recovery** — request a reset link by email and set a new password via a 1-hour,
  single-use token; a successful reset also confirms the email.
- **Teams** — create, list, inline-rename, and delete teams ([Phase 3](docs/phase-3.md)). Names
  are trimmed, non-empty, and case-insensitively unique; deletion is blocked while a team is
  referenced by epics or tickets. Endpoints sit behind `requireAuth`, and a `/teams` screen
  provides the full management UI.
- **Epics** — create, list (filterable by team), edit, and delete epics ([Phase 4](docs/phase-4.md)).
  An epic belongs to one team (immutable after creation), titles are trimmed/non-empty with an
  optional description, and deletion is blocked while tickets reference it. A Tailwind-built
  `/epics` screen provides the management UI; endpoints sit behind `requireAuth`.
- **Tickets** — full lifecycle and the fixed five-state workflow ([Phase 5](docs/phase-5.md)).
  A ticket belongs to a team with a `bug|feature|fix` type, an optional same-team epic, a
  trimmed/non-empty title and body, and `created_by` taken from the session. `modified_at`
  advances only on a real change, state changes persist immediately via a dedicated endpoint, and
  deleting a ticket cascades its comments. Tailwind-built `/tickets`, `/tickets/new`, and
  `/tickets/:id` screens provide list (filterable), create, and details/edit UIs behind
  `requireAuth`.
- **Comments** — chronological, immutable comments on tickets ([Phase 6](docs/phase-6.md)).
  Authenticated users add comments through a section on the ticket details screen and read them
  oldest-first; the `body` is trimmed/non-empty, `author_id` comes from the session (never the
  request body), and `created_at` is server-set. Adding a comment does **not** change the ticket's
  `modified_at`, comments are immutable in mandatory scope, and they are removed with their ticket
  (cascade). Nested endpoints (`GET/POST /api/tickets/:ticketId/comments`) sit behind `requireAuth`.
- **Auth screens** — sign-up, login, email-verification result, resend, forgot-password, and
  reset-password, with a protected board and a header log-out menu.
- **Kanban board** — the primary screen ([Phase 7](docs/phase-7.md)): a team selector and five
  fixed workflow columns of the selected team's tickets, with drag-and-drop that persists state
  changes through the ticket API (optimistic move, rolled back with a visible error on failure),
  cards showing type/title/epic ordered most-recently-modified first, type/epic filters plus a
  case-insensitive title search combined with AND logic (and a Clear action), and create/open
  actions. Built on the existing ticket endpoints — no backend changes.
- Backend health and readiness endpoints (`/api/health`, `/api/ready`) and a static API
  resource index (`/api`).
- Automated tests: a Vitest/Supertest backend suite (migration smoke test + auth, teams, epics,
  tickets, and comments unit and integration tests) and Playwright browser smoke, auth-flow,
  teams-flow, epics-flow, tickets-flow, comments-flow, board-flow, and dod-flow tests, plus a
  backend access-control matrix test.
- **Tailwind CSS v4** is the frontend styling foundation (via `@tailwindcss/vite`, Preflight + a
  brand `@theme` with type/state colour tokens) — see [Frontend Styling](#frontend-styling-tailwind-css).
- **UI polish** ([Phase 9](docs/phase-9.md)): ticket types (Bug/Feature/Fix) and the five workflow
  states are colour-coded from a single token source (with text labels always shown), and the app
  has a smoother feel (hover-lift cards, coloured column accents, focus rings, a refined sticky
  header/background, and reduced-motion support).

### Status

All nine phases are implemented and complete — the full mandatory scope, the
[Phase 8](docs/phase-8.md) quality gates / [Definition-of-Done checklist](docs/definition-of-done.md),
and the [Phase 9](docs/phase-9.md) UX polish (type/state colour-coding, smoother styling, and the
finished Tailwind migration).

See the [phase-by-phase plan](docs/kanban-ticketing-hls.md) for the full roadmap, the
[Phase 1 plan](docs/phase-1.md) (persistence foundation, complete), the
[Phase 2 plan](docs/phase-2.md) (authentication, complete), the
[Phase 3 plan](docs/phase-3.md) (teams, complete), the
[Phase 4 plan](docs/phase-4.md) (epics, complete), the
[Phase 5 plan](docs/phase-5.md) (tickets, complete), the
[Phase 6 plan](docs/phase-6.md) (comments, complete), the
[Phase 7 plan](docs/phase-7.md) (Kanban board, filtering & search, complete), the
[Phase 8 plan](docs/phase-8.md) (quality gates & Definition-of-Done hardening, complete), and the
[Phase 9 plan](docs/phase-9.md) (reference-wireframe fidelity & UX polish, complete).

---

## C. How To Deploy

The stack runs in containers. On Windows it uses Podman with a WSL2-backed virtual machine.

### Prerequisites

- Podman
- `podman-compose`

The stack is intended to run with rootless Podman.

### Windows Setup (Podman + WSL2)

On Windows, Podman runs containers inside a WSL2-backed virtual machine. Set this up once.

1. Install Podman and `podman-compose`:

```powershell
winget install --id RedHat.Podman --exact
pip install podman-compose
```

2. Ensure Podman uses the WSL provider. Create or edit `%APPDATA%\containers\containers.conf`:

```toml
[machine]
provider = "wsl"
```

3. Install the WSL2 platform (requires administrator rights). Podman creates its own WSL distro, so no default distribution is needed:

```powershell
wsl --install --no-distribution
```

4. Reboot Windows. The Virtual Machine Platform feature only becomes active after a restart.

5. After reboot, verify the tools resolve in a new terminal:

```powershell
podman --version
podman-compose --version
```

#### Troubleshooting: `podman-compose` not found

`pip install podman-compose` performs a *user* installation, which places `podman-compose.exe` in your per-user Python scripts directory (for example `%APPDATA%\Python\Python314\Scripts`). If that directory is not on your PATH, both `podman-compose` and the built-in `podman compose` wrapper fail to find a provider:

```text
Error: looking up compose provider failed
        * exec: "docker-compose": executable file not found in %PATH%
        * exec: "podman-compose": executable file not found in %PATH%
```

First, confirm the executable exists and find its location:

```powershell
python -c "import sysconfig; print(sysconfig.get_path('scripts', 'nt_user'))"
```

Then add that directory to your user PATH permanently (adjust the Python version in the path if needed):

```powershell
$scripts = "$env:APPDATA\Python\Python314\Scripts"
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($userPath -notlike "*$scripts*") {
    [Environment]::SetEnvironmentVariable("Path", "$userPath;$scripts", "User")
}
```

Open a new terminal (the permanent PATH change does not apply to already-open sessions) and verify:

```powershell
podman-compose --version
```

### Initialize The Podman Machine

With the WSL provider, these commands do not require administrator rights. Run them once after installation (and after a reboot on Windows):

```powershell
podman machine init
podman machine start
```

Confirm the machine is running:

```powershell
podman machine list
```

### Configure Environment

Runtime ports, database credentials, and test URLs are read from a local `.env` file at the repository root. Create it from the committed template before running the project:

```powershell
copy .env.example .env
```

On macOS or Linux:

```shell
cp .env.example .env
```

Update `.env` for your local machine. Do not commit `.env`; it is ignored by Git.

### Quick Commands

Three short commands cover the common cases. They are thin wrappers around Compose, so no host
runtime beyond a container engine is required. With **GNU Make** installed:

| Command | What it does |
|---|---|
| `make up` | Build and start the whole stack with **no** application data (clean, schema-only DB). |
| `make seed` | Build and start the whole stack with the **generated** demo dataset (ephemeral, in-RAM DB — see [Generated dataset](#generated-dataset-orionmobilewolfjuniper)). |
| `make verify` | Build and start with the **generated** dataset, run the **full end-to-end suite**, and exit with its pass/fail result. |
| `make dev` | Start the **hot-reload development stack** — see [Development (hot reload)](#development-hot-reload). No image rebuilds for code changes. |

Add `COMPOSE="podman-compose"` to use Podman instead of Docker (e.g. `make up COMPOSE="podman-compose"`).

Without Make, run the equivalent commands directly (Docker shown; for Podman replace
`docker compose` with `podman-compose`):

```shell
# 1) No data (clean start)
docker compose up --build

# 2) Generated data (ephemeral)
SEED_FILE_HOST=./backend/seed/generated-data.json \
  docker compose -f compose.yaml -f compose.seed.yaml up --build

# 3) Generated data + run all end-to-end tests (exits with the suite's result)
SEED_FILE_HOST=./backend/seed/generated-data.json \
  docker compose -f compose.yaml -f compose.seed.yaml --profile test up --build \
  --abort-on-container-exit --exit-code-from e2e e2e
```

On Windows PowerShell, set the variable first (`$env:SEED_FILE_HOST = "./backend/seed/generated-data.json"`)
and then run the compose command.

### Development (hot reload)

For iterative work, use the development stack instead of rebuilding images on every change:

```shell
make dev
# or, without Make:
docker compose -f compose.dev.yaml up      # podman-compose -f compose.dev.yaml up
```

It runs the **Vite dev server** (frontend) and **`tsx watch`** (backend) with the source
bind-mounted, so edits under `frontend/src` or `backend/src` are picked up in ~1s with **no image
rebuild**. `node_modules` live in named volumes (installed inside the container, so they are fast on
WSL2 and not shadowed by the host). The app is served on the same `FRONTEND_HOST_PORT` and proxies
`/api` to the backend, just like production. This is a standalone stack — use it *instead of* the
production stack (`make up`), not alongside it (same host ports).

> The production images (`make up` / `docker compose up --build`) are unaffected — they still build
> the optimized Vite bundle served by Nginx. Use the dev stack for coding, the production stack for
> a true-to-prod run.

### Start The Application

From a clean checkout, start the whole stack from the repository root:

```shell
docker compose up --build
```

The backend container automatically applies database migrations before it starts serving, so
no manual database setup is required. A fresh database starts with schema and migration
metadata only — no sample or seed data.

If you are using Podman instead of Docker, the equivalent command is:

```shell
podman-compose -f infra/podman/podman-compose.yml up --build
```

Then open the application in a browser:

- Frontend: `http://localhost:${FRONTEND_HOST_PORT}`
- Backend health: `http://localhost:${BACKEND_HOST_PORT}/api/health`
- Backend database readiness: `http://localhost:${BACKEND_HOST_PORT}/api/ready`
- Mailpit (captured verification emails): `http://localhost:${MAILPIT_UI_PORT}`

Stop the stack (Docker / Podman):

```shell
docker compose down
podman-compose -f infra/podman/podman-compose.yml down
```

Remove the PostgreSQL development volume (wipes local data):

```shell
docker compose down -v
podman-compose -f infra/podman/podman-compose.yml down -v
```

### Database Migrations

Migrations live in `backend/migrations/` and run automatically on backend startup. To run
them manually against a database (for example, during backend development outside containers):

```shell
cd backend
npm install
DATABASE_URL=postgresql://kanban_user:change_this_local_password@localhost:5432/ticketing npm run migrate:up
```

Roll back the most recent migration with `npm run migrate:down`.

### Seed / Test Data (ephemeral)

For local development and QA there is an optional **seed mode** that loads a fixed sample
dataset (demo users, teams, epics, tickets, comments) on every start and keeps the database
entirely in memory so it is **flushed when the stack stops**. This is opt-in and deliberately
separate from the normal flow, because a clean-checkout start must leave a fresh database
schema-only (spec §13).

Start the seeded, ephemeral stack by adding the seed compose file:

```shell
# Docker
docker compose -f compose.yaml -f compose.seed.yaml up --build

# Podman
podman-compose -f infra/podman/podman-compose.yml -f infra/podman/podman-compose.seed.yml up --build
```

How it works:

- The database runs with `PGDATA` on a tmpfs mount (RAM), so **all data is flushed the moment
  the db container stops**. Migrations re-run from scratch on the next start.
- The backend runs the seed script on startup (`SEED_ON_START=true`), which truncates and
  reloads the dataset, so every start yields the same known state.
- Demo login: `demo@mailpit.pit` / `password123` (the demo accounts are pre-verified).

#### Importing your own data

The dataset is just a JSON file, `backend/seed/data.json`, that references entities by natural
keys (user email, team name, epic/ticket title) so it is easy to hand-edit or export from
elsewhere:

```json
{
  "users": [{ "email": "demo@mailpit.pit", "password": "password123", "emailVerified": true }],
  "teams": [{ "name": "Platform" }],
  "epics": [{ "team": "Platform", "title": "Checkout revamp", "description": "..." }],
  "tickets": [{ "team": "Platform", "epic": "Checkout revamp", "type": "feature", "state": "new", "title": "Add Apple Pay support", "body": "...", "createdBy": "demo@mailpit.pit" }],
  "comments": [{ "ticket": "Add Apple Pay support", "author": "demo@mailpit.pit", "body": "..." }]
}
```

There are two ways to import a dataset of your choice:

- **Edit the bundled file** `backend/seed/data.json`, then rebuild (`up --build`). It is copied
  into the image and imported on start.
- **Point at an external file** with the `SEED_FILE_HOST` flag when bringing the stack up — it
  is mounted over the bundled dataset, so no rebuild of the file is needed:

```shell
# Docker
SEED_FILE_HOST=./my-export.json docker compose -f compose.yaml -f compose.seed.yaml up --build

# Podman (path is relative to infra/podman/)
SEED_FILE_HOST=../../my-export.json podman-compose -f infra/podman/podman-compose.yml -f infra/podman/podman-compose.seed.yml up --build
```

#### Generated dataset (Orion/MobileWolf/Juniper)

A larger, ready-made dataset lives at [`backend/seed/generated-data.json`](backend/seed/generated-data.json)
and is what `make seed` / `make verify` load. It is produced by the deterministic generator
[`backend/seed/generate.mjs`](backend/seed/generate.mjs) and contains:

- **3 teams** — `Orion`, `MobileWolf`, `Juniper`.
- **5 projects** — `Banking App` and `MigrationToKafka` (Orion), `DocuUp` (MobileWolf), `MediaShop`
  and `ArtistsInWeb` (Juniper).
- **25 epics** — 5 per project.
- **~160 tickets** — 5–8 tasks per epic (investigate / design / develop / test / fix / document /
  refactor), spread across all five workflow states and all three types. Each task carries a
  concise 5–9 word detail as its body (e.g. `"Implement Account Onboarding services and APIs"`).

Because the app's model is **Team → Epic → Ticket** (there is no separate "project" entity), each
project is represented as a group of epics under its team, with epic titles namespaced as
`"<Project> — <Epic>"` (e.g. `"Banking App — Payments & Transfers"`). This also makes the board a
realistic test of the ≥100-ticket usability requirement (spec §8).

Load it with `make seed` (or the raw command in [Quick Commands](#quick-commands)). To change the
data, edit `generate.mjs` and regenerate:

```shell
node backend/seed/generate.mjs
```

The dataset is validated on load (emails well-formed, ticket `type`/`state` from the allowed
sets, references resolvable); a clear error is printed and the backend exits non-zero if it is
malformed.

You can also run the seed manually against any database (for example during backend
development). Set `SEED_FILE` to import a specific file, otherwise `backend/seed/data.json` is used:

```shell
cd backend
npm run build
DATABASE_URL=postgresql://kanban_user:change_this_local_password@localhost:5432/ticketing npm run seed
# import a custom dataset:
SEED_FILE=./my-export.json DATABASE_URL=... npm run seed
```

The default `docker compose up` / `podman-compose up` (without the seed file) never seeds data.

### Authentication & Email

Authentication uses local email/password accounts. After sign-up, the backend sends a
verification email through SMTP; an account cannot log in until it is verified. Forgotten
passwords are recovered the same way: the backend emails a reset link (valid for 1 hour,
single-use) that lets the user set a new password. Resetting also confirms the email address,
since clicking the emailed link proves control of the inbox.

- **Local development:** the stack includes [Mailpit](https://github.com/axllent/mailpit), a
  mail catcher. Sign-up emails are captured there instead of being delivered. Open the Mailpit
  UI at `http://localhost:${MAILPIT_UI_PORT}` and click the verification link (or copy its
  token). SMTP is configured via `SMTP_HOST`/`SMTP_PORT` (defaults point at Mailpit).
- **Any email domain works locally.** A real, deliverable address (e.g. `@gmail.com`) is *not*
  required — sign-up only checks that the address is well-formed. Use a local-only domain such
  as `tester@mailpit.pit` for testing; Mailpit captures every message regardless of domain, so
  nothing is ever delivered to a real provider and there is no spam risk.
- **Production:** set `SMTP_HOST=relay1.dataart.com` (and credentials if required) in `.env`,
  set `COOKIE_SECURE=true` when serving over HTTPS, and provide a strong `JWT_SECRET`.

Sessions are carried in an httpOnly cookie. The following endpoints are public: sign-up,
login, verify, resend, forgot-password, reset-password, `/api/health`, and `/api/ready`. All
other business endpoints require authentication.

### Try The Sign-Up & Login Flow Locally

With the stack running (`docker compose up --build`, or the Podman equivalent), test the full
authentication journey through the browser — no real email account required:

1. Open the app at `http://localhost:${FRONTEND_HOST_PORT}`. You are redirected to **Log in**
   because you are not authenticated yet.
2. Click **Create an account**, enter a local-only email such as `tester@mailpit.pit` and a
   password of at least 8 characters, then submit. You see a "Check your email" confirmation.
3. Open the Mailpit inbox at `http://localhost:${MAILPIT_UI_PORT}`. Open the
   "Verify your Kanban Ticketing account" message and click the verification link (it opens the
   app's verification page and confirms "Email verified").
4. Back on the **Log in** page, sign in with the same email and password. You land on the
   protected board.
5. Use the account menu in the top-right and click **Log out**. You are returned to the login
   page, and the board is no longer accessible until you log in again.

Things to try for the negative paths:

- **Unverified login is blocked:** sign up, then try to log in *before* clicking the Mailpit
  link — login is refused with a "verify your email" message and a resend option appears.
- **Resend:** request a new link from the login or verification page; the previous link stops
  working and the newest one in Mailpit verifies the account.
- **Single-use / expiry:** a verification link works only once and expires after 24 hours.

To test **password recovery**:

1. On the **Log in** page, click **Forgot your password?** and submit your email.
2. Open Mailpit (`http://localhost:${MAILPIT_UI_PORT}`), open the "Reset your Kanban Ticketing
   password" message, and click its link (valid for 1 hour, single-use).
3. Enter a new password (≥ 8 characters) and submit; you see a success message.
4. Log in with the **new** password — the old one no longer works.

You can also exercise the same flow over HTTP without a browser. See
[Running The Browser Tests](#running-the-browser-tests) for the automated Playwright auth-flow
test that performs these steps end-to-end (including reading the email from Mailpit).

---

## D. Other Useful Info

### Architecture

```mermaid
flowchart LR
    user[User] --> frontend[React SPA]
    frontend -->|"REST API calls"| backend[Backend API]
    backend -->|"SQL queries"| db[(PostgreSQL)]
    testRunner[Playwright Test Runner] -->|"launches browser"| chrome[Chromium Browser]
```

### Project Structure

```text
compose.yaml         Repository-root Docker Compose entrypoint
compose.seed.yaml    Ephemeral seed override (in-RAM DB + generated data)
Makefile             Short commands: make up / make seed / make verify
.github/workflows/   GitHub Actions CI (backend, frontend, e2e)
backend/             TypeScript REST API service
backend/migrations/  SQL database migrations (node-pg-migrate)
backend/seed/        Seed datasets (data.json, generated-data.json) + generator
docs/                Specification, architecture, and phase plans
frontend/            TypeScript React Vite SPA
infra/podman/        Podman compose runtime
tests/e2e/           Browser smoke tests using Playwright in Podman
```

### Continuous Integration (GitHub Actions)

Every push and pull request runs the quality gates defined in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml):

- **backend** — `npm ci`, TypeScript typecheck, apply migrations against a Postgres service
  container, then the Vitest/Supertest suite (`npm test`).
- **frontend** — `npm ci`, then the typechecked production build (`npm run build`).
- **e2e** — builds the whole stack with Docker Compose and runs the Playwright suite
  (`docker compose --profile test up --build --abort-on-container-exit --exit-code-from e2e e2e`),
  failing the pipeline on any browser-flow failure.

The same gates run locally: `cd backend && npm test`, `cd frontend && npm run build`, and
`make verify` (full e2e). Production deployment/CD is intentionally out of scope (spec §12).

### Local Service Details

- `frontend` serves the built React app with Nginx and proxies `/api` to `backend`.
- `backend` exposes auth endpoints (`/api/auth/signup`, `/verify`, `/resend`,
  `/forgot-password`, `/reset-password`, `/login`, `/logout`, `/me`), team endpoints behind
  authentication (`GET/POST /api/teams`, `PATCH/DELETE /api/teams/:id`), epic endpoints behind
  authentication (`GET/POST /api/epics`, `PATCH/DELETE /api/epics/:id`, with an optional
  `?teamId=` filter on list), ticket endpoints behind authentication (`GET/POST /api/tickets`,
  `GET/PATCH/DELETE /api/tickets/:id`, `PATCH /api/tickets/:id/state`, with optional
  `?teamId=`/`?state=`/`?type=`/`?epicId=` filters on list), comment endpoints behind
  authentication nested under a ticket (`GET/POST /api/tickets/:ticketId/comments`),
  health/readiness (`/api/health`, `/api/ready`), and an API resource index.
- `db` runs PostgreSQL 15 using database settings from `.env`.
- `mailpit` captures outgoing verification emails locally (UI on `MAILPIT_UI_PORT`).
- `e2e` runs Playwright with Chromium for browser automation (smoke + auth-flow + teams-flow +
  epics-flow + tickets-flow + comments-flow + board-flow + dod-flow tests).

### Running The Backend Tests

The backend has a Vitest test suite (auth unit tests plus DB-backed integration and migration
smoke tests):

```shell
cd backend
npm install
npm test
```

The migration smoke test and auth integration tests are skipped unless `TEST_DATABASE_URL`
(or `DATABASE_URL`) points at a freshly migrated database. To run them, start a Postgres, run
`npm run migrate:up`, then run `npm test` with that variable set.

### Running The Browser Tests

Run the headless Playwright smoke test from the repository root:

```shell
podman-compose -f infra/podman/podman-compose.yml --profile test up --build --abort-on-container-exit e2e
```

This starts the required application services and runs the `e2e` container. Playwright launches Chromium headlessly inside the Podman container. Clean up the test stack:

```shell
podman-compose -f infra/podman/podman-compose.yml --profile test down
```

### Frontend Styling (Tailwind CSS)

The frontend uses [Tailwind CSS v4](https://tailwindcss.com/) as its styling foundation, wired in
via the first-party `@tailwindcss/vite` plugin — no `tailwind.config.js`, PostCSS config, or extra
build step required.

How it is set up:

- `@tailwindcss/vite` is registered in `frontend/vite.config.ts`.
- `frontend/src/styles.css` enables the full framework with a single `@import "tailwindcss";`
  (theme + Preflight + utilities). Brand design tokens are declared in an `@theme` block, so
  utilities like `bg-brand`, `text-muted`, and `border-line` are available.
- The existing hand-written component classes live in `@layer components`, so **utility classes
  win over them** — new screens can be authored utility-first while older classes keep the current
  look. A few base rules restore the heading/link styling that Preflight resets.

Adoption is incremental: new screens (e.g. the Phase 4 epics page) are built primarily with Tailwind
utilities, and the remaining component classes are migrated to utilities over time. To use it,
just add utility classes in JSX (e.g. `className="flex items-center gap-4 rounded-lg p-4"`); they
compile automatically.

### Documentation

- [Product specification](docs/KanbanBoard.pdf) — the authoritative requirements (main doc).
- [High Level Solution](docs/kanban-ticketing-hls.md) — phase-by-phase implementation plan with tech solutions.
- [Phase 1 plan](docs/phase-1.md) — persistence foundation & migrations plan with a JIRA-style backlog.
- [Phase 2 plan](docs/phase-2.md) — authentication plan with a JIRA-style backlog.
- [Phase 3 plan](docs/phase-3.md) — teams management plan with a JIRA-style backlog.
- [Phase 4 plan](docs/phase-4.md) — epics management plan with a JIRA-style backlog.
- [Phase 5 plan](docs/phase-5.md) — tickets management plan with a JIRA-style backlog.
- [Phase 6 plan](docs/phase-6.md) — comments management plan with a JIRA-style backlog.
- [Phase 7 plan](docs/phase-7.md) — Kanban board, filtering & search plan with a JIRA-style backlog (complete).
- [Phase 8 plan](docs/phase-8.md) — quality gates, persistence hardening & Definition-of-Done plan with a JIRA-style backlog (complete).
- [Phase 9 plan](docs/phase-9.md) — reference-wireframe fidelity & UX polish (type/state colour-coding + style + finished Tailwind migration) with a JIRA-style backlog (complete).
- [Definition-of-Done checklist](docs/definition-of-done.md) — maps every spec §13 item to its automated test, CI job, or documented proof.
- [Architecture](docs/architecture.md) — high-level architecture and delivery phases.
- [Testing approach](docs/testing-approach.md) — grouped end-to-end scenario catalogue.
