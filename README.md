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
- **Auth screens** — sign-up, login, email-verification result, and resend, with a protected
  board and a header log-out menu.
- Backend health and readiness endpoints (`/api/health`, `/api/ready`) and a static API
  resource index (`/api`).
- A scaffold Kanban board UI (static placeholder columns, not yet backed by the API).
- Automated tests: a Vitest/Supertest backend suite (migration smoke test + auth unit and
  integration tests) and Playwright browser smoke and auth-flow tests.

### Not Yet Implemented

- **Teams** — create, rename, delete, with deletion guards (planned: Phase 3).
- **Epics** — CRUD scoped to a team (planned: Phase 4).
- **Tickets** — full lifecycle, fields, and the five-state workflow (planned: Phase 5).
- **Comments** — chronological, immutable comments on tickets (planned: Phase 6).
- **Kanban board** — real drag-and-drop persistence, filtering, and search (planned: Phase 7).
- **Persistence-backed data** — the current board uses in-memory placeholder data only.

See the [phase-by-phase plan](docs/kanban-ticketing-hls.md) for the full roadmap, the
[Phase 1 plan](docs/phase-1.md) (persistence foundation, complete), and the
[Phase 2 plan](docs/phase-2.md) (authentication, complete).

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

### Authentication & Email

Authentication uses local email/password accounts. After sign-up, the backend sends a
verification email through SMTP; an account cannot log in until it is verified.

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
login, verify, resend, `/api/health`, and `/api/ready`. All other business endpoints require
authentication.

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
backend/             TypeScript REST API service
backend/migrations/  SQL database migrations (node-pg-migrate)
docs/                Specification, architecture, and phase plans
frontend/            TypeScript React Vite SPA
infra/podman/        Podman compose runtime
tests/e2e/           Browser smoke tests using Playwright in Podman
```

### Local Service Details

- `frontend` serves the built React app with Nginx and proxies `/api` to `backend`.
- `backend` exposes auth endpoints (`/api/auth/signup`, `/verify`, `/resend`, `/login`,
  `/logout`, `/me`), health/readiness (`/api/health`, `/api/ready`), and an API resource index.
- `db` runs PostgreSQL 15 using database settings from `.env`.
- `mailpit` captures outgoing verification emails locally (UI on `MAILPIT_UI_PORT`).
- `e2e` runs Playwright with Chromium for browser automation (smoke + auth-flow tests).

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

### Documentation

- [Product specification](docs/KanbanBoard.pdf) — the authoritative requirements (main doc).
- [High Level Solution](docs/kanban-ticketing-hls.md) — phase-by-phase implementation plan with tech solutions.
- [Phase 1 plan](docs/phase-1.md) — persistence foundation & migrations plan with a JIRA-style backlog.
- [Phase 2 plan](docs/phase-2.md) — authentication plan with a JIRA-style backlog.
- [Architecture](docs/architecture.md) — high-level architecture and delivery phases.
- [Testing approach](docs/testing-approach.md) — grouped end-to-end scenario catalogue.
