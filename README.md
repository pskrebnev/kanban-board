# Kanban Ticketing System

Kanban Ticketing is a starter TypeScript-first 3-tier application with a React SPA, REST API, PostgreSQL database, and Podman-based local runtime.

Current phase: Phase 1, foundation and runtime scaffold. The project currently has the TypeScript app skeleton, Podman runtime, PostgreSQL service, and Playwright smoke-test container in place.

## Architecture

```mermaid
flowchart LR
    user[User] --> frontend[React SPA]
    frontend -->|"REST API calls"| backend[Backend API]
    backend -->|"SQL queries"| db[(PostgreSQL)]
    testRunner[Playwright Test Runner] -->|"launches browser"| chrome[Chromium Browser]
```

See [docs/architecture.md](docs/architecture.md) for the high-level architecture plan.

## Project Structure

```text
backend/             TypeScript REST API service
docs/                Architecture documentation
frontend/            TypeScript React Vite SPA
infra/podman/        Podman compose runtime
tests/e2e/           Browser smoke tests using Playwright in Podman
```

## Prerequisites

- Podman
- `podman-compose`

The stack is intended to run with rootless Podman.

## Run The Stack

Start frontend, backend, and PostgreSQL:

```shell
podman-compose -f infra/podman/podman-compose.yml up --build
```

Then open:

- Frontend: http://localhost:3000
- Backend health: http://localhost:8080/api/health
- Backend database readiness: http://localhost:8080/api/ready

Stop the stack:

```shell
podman-compose -f infra/podman/podman-compose.yml down
```

Remove the PostgreSQL development volume:

```shell
podman-compose -f infra/podman/podman-compose.yml down -v
```

## Run Browser Tests

The e2e profile builds a Playwright test-runner container and launches Chromium inside Podman:

```shell
podman-compose -f infra/podman/podman-compose.yml --profile test up --build --abort-on-container-exit e2e
```

See [docs/testing-approach.md](docs/testing-approach.md) for the grouped e2e scenario plan.

## Local Service Details

- `frontend` serves the built React app with Nginx and proxies `/api` to `backend`.
- `backend` exposes `/api/health`, `/api/ready`, and an initial API resource index.
- `db` runs PostgreSQL 15 with database `ticketing`, user `user`, and password `password`.
- `e2e` runs Playwright with Chromium for browser automation.
