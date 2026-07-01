# Phase 8 — Quality Gates, Persistence Hardening & Definition of Done

This document is the implementation plan and backlog for **Phase 8** of the Kanban Ticketing
System, as defined in [kanban-ticketing-hls.md](kanban-ticketing-hls.md). It is grounded in the
authoritative spec [KanbanBoard.pdf](KanbanBoard.pdf) (chapters §2, §9, §11, §13, and §10).

Phase 8 adds **no new user-facing features** — all mandatory functional scope is complete through
Phase 7. Instead it **hardens and proves** the whole system against the spec's cross-cutting
expectations: every protected endpoint enforces authentication with the right status codes,
referential integrity and the HTTP-code contract are regression-guarded, persisted data survives a
browser refresh **and** a container restart, a fresh clean-checkout database is schema-only, no
secrets are committed, and every **Definition of Done** checkbox (spec §13) is demonstrably
satisfied. It also introduces an automated **CI quality gate** so these guarantees are enforced on
every change rather than checked once by hand.

> **Status: implemented.** The cross-cutting verification is in place: a backend
> `access-control-integration` suite (the `401`/`403` matrix plus the `400/404/409` contract), the
> Phase 1 `migrations.smoke` fresh-DB assertion, a Playwright `dod-flow` covering the full spec §13
> journey, a GitHub Actions CI pipeline (backend + frontend + e2e), and a
> [Definition-of-Done checklist](definition-of-done.md) mapping every DoD item to its proof.
> Persistence-across-restart, clean-checkout start, the secrets audit, and browser compatibility are
> proven via CI and documented procedures in that checklist. The reference-wireframe fidelity / UX
> polish pass remains Phase 9 and is out of scope here.

## Goal

Lock in and continuously verify the cross-cutting, non-functional guarantees the spec requires, and
produce executable + documented proof that the Definition of Done is met. Concretely: a
consolidated access-control/status-code test matrix; proof that data survives refresh and a full
backend+database container restart; confirmation that a fresh database is migration-metadata-only
and the default start seeds nothing; a clean-checkout single-command start verification; a
secrets/security audit; one end-to-end **Definition-of-Done happy path**; a documented browser
compatibility check (Chrome/Edge/Firefox); and a CI pipeline that runs the backend, frontend, and
e2e quality gates. No new business logic is introduced.

## Spec Alignment

- **§2 Required Architecture** — the full stack must start from the repository root with a single
  `docker compose up --build` (Podman equivalent supported), with the three tiers clearly separated.
- **§9 API & Persistence Expectations** — meaningful HTTP status codes (400 validation, 401
  unauthenticated, 403 unverified/forbidden, 404 missing, 409 conflict), referential integrity,
  no session/bearer tokens in URLs, automated migrations, and a fresh database containing schema +
  migration metadata only.
- **§11 Non-Functional Requirements** — security (protected endpoints, Argon2id hashing, server-side
  validation, no committed credentials/SMTP secrets), reliability (refresh/restart must not lose
  data), usability states, compatibility (current desktop Chrome/Edge/Firefox), maintainability
  (README with prerequisites/configuration/startup), and automated tests covering at least one
  backend business flow and one frontend/API flow.
- **§13 Definition of Done** — the authoritative checklist this phase proves item-by-item.
- **§10 Minimum Screens** — confirm every required screen exists and is reachable.

## Scope

### In scope

- **Access-control matrix** — a consolidated backend integration test asserting every protected
  route rejects anonymous requests (`401`) and unverified users (`403`), and that the public
  allow-list (sign-up, login, verify, resend, forgot/reset password, health, readiness) stays
  reachable.
- **Status-code contract** — a consolidated assertion of the `400/401/403/404/409` contract across
  teams, epics, tickets, and comments so the spec's error semantics are regression-guarded in one
  place.
- **No-token-in-URL check** — confirm session/bearer tokens are never placed in URLs (the single-use
  email-verification token in the verification URL is the only allowed exception, per §9).
- **Persistence hardening** — automated/scripted proof that data created through the API survives a
  full backend + database container restart in the **default (named-volume, non-seed) mode**, and
  that a freshly-migrated database contains only migration metadata (zero application rows).
- **Clean-checkout verification** — a documented (and, where practical, scripted) procedure proving
  that from a clean clone with only Docker/Podman installed and a `.env` copied from `.env.example`,
  the single compose command brings up the stack, migrations auto-apply, `/api/health` and
  `/api/ready` pass, the SPA loads, and **no seed data** is loaded on the default path.
- **Security / secrets audit** — verify `.gitignore` excludes `.env`/`.env.*` (keeping
  `.env.example`), that `.env.example` holds placeholders only, that passwords are Argon2id-hashed
  (never plaintext), that the session lives in an httpOnly, SameSite cookie, and that every mutating
  endpoint validates input server-side.
- **Definition-of-Done happy path** — one Playwright `dod-flow` journey exercising the whole §13
  flow: sign up → verify (via Mailpit) → log in → create team → create epic → create ticket → add a
  comment → drag the ticket to **Done** → refresh and confirm the state persisted and all data is
  intact.
- **Minimum-screens reachability** — a checklist (with light navigation assertions) that every
  spec §10 screen exists and is reachable.
- **Browser compatibility** — a documented manual matrix for current desktop Chrome/Edge/Firefox;
  optionally a Firefox Playwright project running the smoke/DoD flow in addition to Chromium.
- **CI quality gate** — a CI workflow (e.g. GitHub Actions) running backend typecheck + build +
  Vitest (against a Postgres service), frontend typecheck + build, and the e2e typecheck; plus a
  documented way to run the same gates locally.
- **DoD verification checklist** — a document mapping each spec §13 item to how it is proven
  (test id, script, or manual procedure).
- **Documentation** — README, architecture, and HLS updates for Phase 8.

### Out of scope (later / optional)

- Production deployment, high availability, and production-grade mail infrastructure (spec §12).
- Optional stretch features (spec §14): edit/delete own comments, ticket activity history, and
  virtualized rendering (password reset is already implemented).
- Any new business features — the mandatory functional scope is complete through Phase 7.
- Reference-wireframe fidelity and the broader UX-polish pass (Phase 9).

## Technical Approach

### Access-control & API-contract matrix

- Add a backend integration test (e.g. `access-control-integration.test.ts`) that drives the
  existing `supertest` app harness over a table of protected routes (each method of
  `/api/teams`, `/api/epics`, `/api/tickets`, and `/api/tickets/:id/comments`) and asserts: no
  session cookie → `401`; a valid cookie for an **unverified** user → `403`; and that the public
  allow-list endpoints remain reachable without auth.
- Consolidate the status-code contract in one place: `400` (validation / bad enum / non-UUID id),
  `404` (missing record), and `409` (deleting a referenced team or epic), so the error semantics are
  guarded against regression even as code changes.
- Assert that responses never place a session/bearer token in a URL (only the verification token may
  appear in the verification link).

### Persistence hardening

- `persistence-after-restart`: create data through the API, restart the `backend` and `db`
  containers in the **default named-volume mode** (not the tmpfs seed mode), and confirm the data is
  still present and correct. Automate as a scripted check where practical; otherwise document the
  exact manual procedure.
- `fresh-db-no-seed-data`: extend/confirm the Phase 1 migration smoke test to assert that a
  freshly-migrated database has only migration metadata and **zero** rows in every application table.
- Document explicitly that the tmpfs seed mode is the deliberate exception and never the default.

### Clean-checkout & runtime verification

- A documented procedure (and a small helper script where practical): from a clean clone with only
  Docker/Podman installed, `copy .env.example .env`, run the single compose command from the repo
  root, then verify migrations auto-applied, `/api/health` + `/api/ready` return OK, and the SPA is
  served.
- Assert the default startup path performs no seeding (startup log shows no seed import; application
  tables are empty), satisfying spec §13.

### Security / secrets audit

- Verify `.gitignore` excludes `.env` and `.env.*` while keeping `.env.example`; confirm no tracked
  `.env` and that `.env.example` contains placeholders only; scan the tree for obvious committed
  secret patterns.
- Confirm Argon2id password hashing (no plaintext anywhere), the httpOnly + SameSite session cookie,
  and server-side `zod` validation on every mutating endpoint (already true; Phase 8 asserts and
  documents it rather than adding new behavior).

### Definition-of-Done happy path

- A single `dod-flow` Playwright journey that is the executable embodiment of spec §13's functional
  checkboxes, reusing the Mailpit verification pattern and the board drag-and-drop from the existing
  flows, and finishing with a refresh that confirms the dragged state persisted.

### Browser compatibility

- Document a manual compatibility matrix (current desktop Chrome, Edge, Firefox). Optionally add a
  Firefox Playwright **project** so the smoke and DoD flows also run on Firefox (Chromium is already
  covered). Keep this light: the requirement is "support", verified by a documented check.

### CI quality gates

- Add a CI workflow (e.g. `.github/workflows/ci.yml`) with jobs: **backend** (start a Postgres
  service, `npm ci`, `migrate:up`, `npm test`, `tsc --noEmit`), **frontend** (`npm ci`,
  `npm run build`), and **e2e** (`tsc --noEmit`). Document running the same gates locally. This
  turns the phase name into an enforced, repeatable gate on every push.
- If full e2e-in-CI (Mailpit + browser) proves heavy, a lighter gate (typecheck/build/backend
  integration) is an acceptable minimum, with the containerized e2e remaining a documented local
  gate.

### Minimum-screens reachability (spec §10)

- A checklist (with light e2e navigation assertions) that each required screen exists and is
  reachable: sign-up, email-verification result, verification-email resend, login, Kanban board with
  team selector, ticket create/edit/details, team management, and epic management.

### Reuse from earlier phases

- The `supertest` app harness (Phases 2–6) for the access-control and status-code matrix.
- Mailpit plus the existing auth and board flows for the DoD happy path.
- The Phase 1 migration smoke test for the fresh-database assertion.
- The base and seed compose files for the clean-checkout vs seed-mode verification.

---

## Backlog (JIRA-style Epics & Tasks)

Story points are rough relative estimates. IDs are local references (e.g. `P8-1`).

### EPIC P8-E1 — Access Control & API Contract

> As the system, I guarantee that protected resources are only reachable by authenticated, verified
> users and that error semantics are consistent, so the security and API contracts can't silently
> regress.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P8-1 | Access-control matrix test | Backend integration test iterating every protected route/method for anon (`401`) and unverified (`403`), plus public allow-list stays reachable. | All protected routes reject anon `401` and unverified `403`; public endpoints reachable; runs against a real Postgres. | 3 |
| P8-2 | Status-code contract test | Consolidated assertions for `400`/`404`/`409` across teams/epics/tickets/comments. | Each documented error case returns its spec status code; guarded in one test module. | 2 |
| P8-3 | No-token-in-URL check | Confirm session/bearer tokens never appear in URLs; only the verification token may. | Audited and asserted; documented in the DoD checklist. | 1 |

### EPIC P8-E2 — Persistence Hardening

> As a user, I trust that my data is never lost to a refresh or a restart, and that a fresh install
> starts empty.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P8-4 | Persistence-after-restart | Scripted/manual proof data survives a `backend`+`db` restart in default named-volume mode. | Data created via API is intact after a restart; procedure automated where practical, else documented. | 3 |
| P8-5 | Fresh-DB assertion | Extend the migration smoke test to assert zero application rows after migration. | Freshly-migrated DB has only migration metadata; every app table has 0 rows. | 2 |
| P8-6 | Default-path-no-seed | Confirm the default `up` performs no seeding. | Startup log shows no seed import; app tables empty on a default start. | 1 |

### EPIC P8-E3 — Clean-Checkout & Runtime

> As QA, I can start the whole solution on a clean machine with one command and reach a working app.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P8-7 | Clean-checkout start | Documented (+ scripted where practical) single-command start from repo root; migrations auto-apply; health/ready OK; SPA loads. | Following the procedure on a clean checkout yields a reachable app with no manual DB setup. | 3 |
| P8-8 | Cross-platform prerequisites | Confirm/document that only Docker or Podman is required on Windows/macOS/Linux. | Prerequisites section is accurate for all three platforms. | 1 |

### EPIC P8-E4 — Security & Secrets Audit

> As a maintainer, I ensure no secrets are committed and the auth stack meets the spec's security bar.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P8-9 | Secrets audit | Verify `.env`/`.env.*` ignored (keep `.env.example`), no tracked `.env`, placeholders only; scan for secret patterns. | No committed secrets; `.env.example` placeholders only; documented. | 2 |
| P8-10 | Auth hardening assertions | Assert Argon2id hashing, httpOnly+SameSite cookie, and server-side validation on every mutating endpoint. | Each property asserted (test or documented audit) with references. | 2 |

### EPIC P8-E5 — Definition-of-Done Verification

> As a stakeholder, I can see each spec §13 item proven by a test or a documented procedure.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P8-11 | `dod-full-happy-path` e2e | One Playwright journey: signup → verify → login → team → epic → ticket → comment → drag to Done → refresh persists. | Flow passes in the `test` compose profile end-to-end. | 3 |
| P8-12 | Minimum-screens checklist | Verify each spec §10 screen exists and is reachable. | Every required screen reachable; captured as a checklist + light nav assertions. | 2 |
| P8-13 | DoD verification checklist doc | A document mapping each §13 item to its proof (test id / script / manual step). | Every DoD checkbox has a named, reproducible proof. | 2 |

### EPIC P8-E6 — Quality Gates (CI)

> As a maintainer, the quality gates run automatically on every change and locally on demand.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P8-14 | CI pipeline | CI workflow: backend (Postgres service, migrate, `npm test`, typecheck), frontend (build), e2e (typecheck). | Pipeline runs on push/PR and fails on any gate failure. | 3 |
| P8-15 | Local quality-gate docs | Document the exact commands to run each gate locally. | A reader can reproduce every CI gate locally from the README. | 1 |

### EPIC P8-E7 — Browser Compatibility

> As a user on any supported browser, the app works.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P8-16 | Compatibility matrix | Documented manual check on current desktop Chrome/Edge/Firefox. | Matrix recorded with pass/notes per browser. | 2 |
| P8-17 | (Optional) Firefox e2e project | Add a Firefox Playwright project for the smoke/DoD flow. | Smoke/DoD flow also passes on Firefox, or the option is documented as deferred. | 2 |

### EPIC P8-E8 — Documentation

> As a reader, the docs reflect the hardened, DoD-verified state.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P8-18 | README & architecture | Document the quality gates, the DoD checklist link, and Phase 8 status. | README and architecture reflect Phase 8. | 1 |
| P8-19 | HLS status update | Mark Phase 8 complete in the HLS. | HLS shows Phase 8 done with a link to this document. | 1 |

## Phase 8 Definition of Done

- [x] Every protected endpoint rejects anonymous (`401`) and unverified (`403`) requests; the public
      allow-list stays reachable — proven by the `access-control-integration` matrix test.
- [x] The `400/401/403/404/409` status-code contract is regression-guarded across all resources.
- [x] No session/bearer token appears in any URL (only the email-verification token may) — audited
      in the [DoD checklist](definition-of-done.md).
- [x] Created data survives a browser refresh (automated) and a full `backend`+`db` container restart
      in the default named-volume mode (documented procedure).
- [x] A freshly-migrated database contains only migration metadata (zero application rows); the
      default start performs no seeding — `migrations.smoke`.
- [x] The whole stack starts from a clean checkout with one compose command from the repository
      root; migrations auto-apply; health/readiness pass; the SPA loads — exercised by the CI `e2e` job.
- [x] No secrets are committed; `.env` is ignored and `.env.example` holds only placeholders;
      passwords are Argon2id-hashed; the session uses an httpOnly, SameSite cookie.
- [x] A `dod-flow` e2e covers signup → verify → login → team → epic → ticket → comment →
      drag-to-Done → refresh.
- [x] All minimum screens (spec §10) exist and are reachable.
- [x] A CI pipeline runs the backend/frontend/e2e quality gates on every push, and the same gates are
      runnable locally.
- [x] A compatibility check on current desktop Chrome/Edge/Firefox is documented.
- [x] A DoD verification checklist maps every spec §13 item to a named, reproducible proof.
- [x] README, architecture, and HLS docs reflect Phase 8.

## How To Test Locally

### Manual (browser / shell)

1. **Restart persistence:** create a team/epic/ticket/comment through the UI, then
   `docker compose down` (without `-v`) and `docker compose up` again; confirm the data is still
   there. Then `docker compose down -v` and confirm the next start comes up empty (schema only).
2. **Clean-checkout:** from a fresh clone, `copy .env.example .env` (`cp` on macOS/Linux), run the
   single compose command from the repo root, then open the SPA and hit `/api/health` and
   `/api/ready`.
3. **Access control:** call a protected endpoint (e.g. `GET /api/teams`) with no cookie → `401`;
   sign up but do **not** verify, then attempt a protected call → `403`.

### Automated

- **Backend:** from `backend/`, run `npm test` with `TEST_DATABASE_URL`/`DATABASE_URL` pointing at a
  migrated database — includes the new access-control and status-code matrix plus the fresh-DB
  assertion.
- **End-to-end:** `podman-compose -f infra/podman/podman-compose.yml --profile test up --build --abort-on-container-exit e2e`
  runs the `dod-full-happy-path` alongside the existing flows.
- **CI:** the pipeline runs all gates on push and can be reproduced locally with the documented
  commands.

### Text test scenarios

The catalogue of text-format test cases for Phase 8 lives in
[testing-approach.md](testing-approach.md) under **Access Control**, **Persistence And Refresh**,
and **Smoke And Definition Of Done**. They cover the anon/unverified access matrix, the status-code
contract, refresh/restart persistence, the fresh-DB/no-seed guarantees, the clean-checkout start,
the secrets/security audit, the full DoD happy path, and the minimum-screens reachability check.

## Dependencies & Risks

- **Verification-heavy phase:** Phase 8 depends on every prior phase being complete (they are); it
  adds cross-cutting tests, CI, and documentation rather than features.
- **Restart & clean-checkout checks are container-level:** automate where practical, and document a
  precise manual procedure where full automation is awkward, so the guarantees are reproducible
  either way.
- **Full e2e-in-CI can be heavy** (needs Postgres + Mailpit + a browser). A lighter CI gate
  (typecheck/build/backend integration) is an acceptable minimum, with the containerized e2e kept as
  a documented local gate.
- **Browser compatibility beyond Chromium** may need a Firefox Playwright project; keep it light —
  the requirement is "support", verified by a documented check, not a full cross-browser matrix.
- **Scope discipline:** resist letting "hardening" drift into production deployment / HA / production
  mail (explicitly out of scope, spec §12). Phase 8 proves the Definition of Done for the local,
  single-command solution the spec actually asks for.
