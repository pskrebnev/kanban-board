# Repository Improvement Review

**Date:** 2026-07-01
**Scope:** Full repository — backend, frontend, e2e tests, containers, CI/CD, documentation, and repo hygiene.
**Method:** Three parallel code audits (backend, frontend, infra/CI/docs), consolidated and de-duplicated.
**Constraint:** This is a review document only. No code was changed as part of producing it.

The repository is in good shape overall — well-layered backend, clean frontend architecture,
real-database integration tests, three-tier CI, and unusually thorough documentation. The findings
below are opportunities to harden it for production, improve developer experience, and close
quality gaps. Nothing here is a blocking defect.

---

## Priority overview

### Quick wins (low effort, high value)

| # | Improvement | Area |
|---|-------------|------|
| 1 | Pin dependency versions (replace `"latest"`) + add Dependabot/Renovate | Hygiene |
| 2 | Configure CORS with an origin allow-list | Security |
| 3 | Add request body size limits (`express.json({ limit })`) | Security |
| 4 | Centralize repeated Tailwind class constants (extend the `authUi.ts` pattern) | Frontend |
| 5 | Add a React error boundary | Frontend |
| 6 | Enable dnd-kit `KeyboardSensor` for keyboard drag-and-drop | Accessibility |
| 7 | Run containers as a non-root user; pin `mailpit:latest` and base images | Containers |
| 8 | Update README — it still says the Tailwind migration is "deferred" (it is done) | Docs |
| 9 | Add `npm audit` to CI | Security/CI |
| 10 | Copy the Postgres healthcheck from `compose.yaml` into `compose.dev.yaml` | Infra |

### Bigger investments (medium/high effort, high value)

| # | Improvement | Area |
|---|-------------|------|
| 1 | Rate limiting on auth endpoints | Security |
| 2 | ESLint + Prettier + pre-commit hooks (currently no linting at all) | Quality |
| 3 | Migrate e2e suite to `@playwright/test` (retries, traces, screenshots on failure) | Testing |
| 4 | Structured logging with request correlation IDs | Observability |
| 5 | Toast/notification system for user feedback | Frontend UX |
| 6 | Shared API types between backend and frontend (OpenAPI codegen or shared package) | Type safety |
| 7 | Pagination on list endpoints | API/Performance |
| 8 | Mobile responsiveness (the app is desktop-only today) | Frontend UX |
| 9 | Frontend unit tests (Vitest + Testing Library — currently zero) | Testing |

---

## 1. Security & hardening (backend)

### 1.1 CORS is unrestricted
`backend/src/app.ts` uses `app.use(cors())` with no options, allowing any origin.

- **Why it matters:** opens the API to cross-origin requests from arbitrary sites.
- **Suggestion:** drive an allow-list from an `ALLOWED_ORIGINS` env var (defaulting to the local
  frontend origin) and set `credentials: true` explicitly, since auth uses cookies.

### 1.2 No rate limiting on auth endpoints
`backend/src/routes/auth.ts` — signup, login, forgot-password, resend, and verify have no
throttling.

- **Why it matters:** enables password brute-forcing, account enumeration, and email-sending abuse.
  `/api/auth/verify` is public and accepts token guesses at full HTTP speed (the tokens are
  high-entropy, so risk is low but nonzero).
- **Suggestion:** add `express-rate-limit` with tight limits on auth routes (e.g. login 5/15 min,
  signup and forgot-password 3/hour per IP) and log rejected attempts.

### 1.3 No request body size limit
`app.use(express.json())` has no `limit` option; the spec caps ticket/comment bodies at 20k chars
but the middleware accepts arbitrarily large payloads.

- **Suggestion:** `express.json({ limit: "1mb" })` (zod still enforces the field-level caps).

### 1.4 Argon2 parameters are implicit
`backend/src/auth/password.ts` relies on `@node-rs/argon2` defaults.

- **Why it matters:** defaults are reasonable, but the cost parameters are undocumented and not
  pinned against library changes.
- **Suggestion:** set `memoryCost` / `timeCost` / `parallelism` / `algorithm: Argon2id` explicitly
  per current OWASP guidance, and document the choice.

### 1.5 JWT secret accepted even if empty
`server.ts` throws when `JWT_SECRET` is missing, but an empty string passes.

- **Suggestion:** validate non-empty (and ideally minimum length) in `config.ts` at startup.

### 1.6 No stored-XSS defense-in-depth
Zod validates shape/length but does not sanitize; ticket/comment bodies can contain HTML. React
escapes by default, so this is currently safe — it becomes a live risk the day any field is
rendered with `dangerouslySetInnerHTML` or exported elsewhere.

- **Suggestion:** either document "React escaping is the XSS boundary" as an explicit invariant, or
  strip tags server-side (`sanitize-html`) on write.

### 1.7 `SameSite=Strict` session cookie
Strict blocks the cookie on top-level navigations from external links (e.g. from an email), which
can force a surprise re-login. `SameSite=Lax` keeps CSRF protection for cross-site POSTs while
allowing link navigation. Trade-off — worth a deliberate decision either way.

---

## 2. Reliability & observability

### 2.1 Minimal, unstructured logging
The only logging is `console.error` in the error handler and `console.log` in the mailer. No
request logs, no correlation IDs, no timestamps.

- **Suggestion:** add `pino` (or similar): per-request log line (method, path, status, duration,
  user id when authenticated), a request-ID middleware, and structured error logs. This is the
  single biggest step toward debuggability in production.

### 2.2 Connection pool uses defaults
`backend/src/db/pool.ts` — `new Pool({ connectionString })` with no `max`, `idleTimeoutMillis`, or
`connectionTimeoutMillis`.

- **Suggestion:** configure explicitly (e.g. `max: 20`, `connectionTimeoutMillis: 2000`) so failure
  modes under load are predictable.

### 2.3 Check-then-act races in delete flows
Services pre-check references (e.g. "is this epic referenced?") then delete; a concurrent request
can create a reference in between. FK constraints backstop this, but the resulting error path is
not the friendly one.

- **Suggestion:** wrap in a transaction, or lean on FK constraints intentionally and map SQLSTATE
  23503 to the same friendly error as the pre-check.

### 2.4 SMTP transport not pooled
`email/mailer.ts` — fine at current scale; enable `pool: true` on the Nodemailer transport when
volume grows.

---

## 3. API design & data layer

### 3.1 No pagination on list endpoints
`listTickets`, `listEpics`, `listTeams` (in `backend/src/repositories/`) return every matching row.
The seed dataset alone is ~160 tickets.

- **Suggestion:** add `limit`/`offset` (or cursor) query params with zod validation and sane
  defaults (e.g. limit 50, max 100). The frontend stores would need matching support — a
  cross-cutting change, best done as its own phase.

### 3.2 No shared types between backend and frontend
The frontend re-declares `Ticket`, `Epic`, `Team`, `User` in `frontend/src/store/*.ts`; the backend
has its own definitions. Nothing guarantees they stay in sync.

- **Suggestion (in order of ambition):**
  1. a shared types package/directory consumed by both sides;
  2. serve an OpenAPI document and generate the frontend client types (`openapi-typescript`);
  3. runtime response validation with zod on the frontend for critical payloads.

### 3.3 Zod error messages are developer-facing
Parse failures surface raw zod text ("String must contain at least 1 character").

- **Suggestion:** map common zod issues to human-friendly messages at the router boundary.

### 3.4 Index rationale undocumented
Migrations create the right indexes, but nothing records which query each serves.

- **Suggestion:** one-line comments in the migrations ("supports board filter by state").

---

## 4. Frontend architecture & UX

### 4.1 Repeated Tailwind class constants (top frontend refactor)
`primaryBtn` / `secondaryBtn` / `dangerBtn` / `fieldClass` / `labelClass` are re-declared per page:
`Board.tsx:31-33`, `Tickets.tsx:19-20`, `Epics.tsx:9-13`, `TicketDetail.tsx:22-27`,
`TicketCreate.tsx:10-14` — with drifting variants (some include disabled styles, some don't).
`frontend/src/authUi.ts` already models the fix for the auth screens.

- **Suggestion:** promote to a single `frontend/src/ui.ts` (superset of `authUi.ts`) and import
  everywhere. Low risk, immediately removes ~5-way duplication.

### 4.2 No error boundary
An uncaught render error white-screens the whole SPA (`main.tsx` has no boundary).

- **Suggestion:** a top-level `ErrorBoundary` with a "something went wrong / reload" fallback.

### 4.3 No toast/feedback system
Mutations succeed silently (create team/epic, post comment); the board's move error is the only
`role="alert"` and needs a manual dismiss.

- **Suggestion:** a small toast store (Zustand) or a library like `sonner`; auto-dismiss transient
  messages; keep persistent errors inline.

### 4.4 Thin API layer
`frontend/src/api.ts` has no interceptors: a 401 mid-session is handled ad hoc per store rather
than globally redirecting to login; no retry for transient network failures.

- **Suggestion:** response interceptor for 401 → `authStore.logout()` + redirect; optional
  bounded retry for idempotent GETs.

### 4.5 Desktop-only layout
Almost no responsive breakpoints; board columns are fixed-width (`w-72`) behind `overflow-x-auto`;
the header does not collapse.

- **Suggestion:** define a mobile strategy (stacked columns or per-column drawer under `sm:`,
  collapsible filters) — a design task before a coding task.

### 4.6 Optimistic updates only on the board
The board move is optimistic with rollback (nice); other stores refetch after every mutation, so
create/rename feel slower than they need to.

- **Suggestion:** adopt the board's optimistic pattern for team/epic/ticket mutations, or accept
  refetch as the deliberate simple pattern and document that.

### 4.7 Smaller UX polish items
- Loading states are plain text — skeleton placeholders would make screens feel faster.
- Empty states are plain text without a CTA (e.g. "No teams yet" could link to team creation).
- Static browser tab title on every route — per-page `document.title` is cheap.
- Inline delete confirmations work but are verbose; a shared `ConfirmDialog` would unify them.
- Error-message copy varies in tone/capitalization — a short style guideline would fix drift.
- Forms rely on HTML5 validation only; `react-hook-form` + zod would give field-level feedback
  and reuse the backend's validation vocabulary.

---

## 5. Accessibility

### 5.1 Drag-and-drop is mouse/touch only
`Board.tsx` configures `MouseSensor` and `TouchSensor` but not dnd-kit's `KeyboardSensor` — cards
cannot be moved by keyboard at all (WCAG 2.1 keyboard-equivalence gap).

- **Suggestion:** add `KeyboardSensor` (one import + one line) and verify the Space/arrows/Enter
  flow; consider `aria-live` announcements for moves.

### 5.2 Existing baseline is decent
`aria-label`s, `role="alert"`, `aria-current="page"`, styled `:focus-visible`, and
reduced-motion support are already present — the gap is concentrated in DnD.

---

## 6. Testing

### 6.1 No frontend unit tests
Zero `*.test.ts(x)` in `frontend/`; no Vitest config or test script. Store logic (board filters,
optimistic move reconciliation) is exactly the kind of pure logic that is cheap to unit-test.

- **Suggestion:** add Vitest + Testing Library; start with the Zustand stores.

### 6.2 E2E suite is hand-rolled Playwright
`tests/e2e/*.ts` drive raw `chromium` with custom `waitForHttp`/sleep/mail-polling helpers and a
sequential `npm test` chain — no automatic retries, no traces/screenshots/videos on failure, no
per-test timeouts. Past flakes in this repo (comments-flow ordering, teams-flow selector) were
debugged blind for exactly this reason.

- **Suggestion:** migrate to `@playwright/test` (`playwright.config.ts` with retries, trace
  `on-first-retry`, screenshots on failure), and upload `test-results/` as a CI artifact with
  `actions/upload-artifact` + `if: always()`.

### 6.3 Mailpit polling failure mode is opaque
`findVerificationToken` polls ~30s and fails generically. On timeout, dump Mailpit's message list
to the log so "wrong recipient" vs "no email at all" is obvious.

### 6.4 No concurrency tests
Backend integration tests are sequential; races (two users moving the same ticket, delete vs
reference creation) are untested.

---

## 7. CI/CD & containers

### 7.1 No lint/format/audit gates
CI runs build + tests only. There is **no ESLint/Prettier anywhere in the repo**, no `npm audit`,
and no pre-commit hooks.

- **Suggestion:** add ESLint + Prettier to both packages, a `lint` job in
  `.github/workflows/ci.yml`, `npm audit --audit-level=moderate` (allowed-to-fail at first), and
  optionally Husky + lint-staged.

### 7.2 Containers run as root; some images unpinned
- `backend/Containerfile` and `tests/e2e/Containerfile` have no `USER` directive.
- `axllent/mailpit:latest` in `compose.yaml` / `compose.dev.yaml` drifts on every pull; base
  images pinned only to major (`postgres:15`).
- **Suggestion:** add a non-root user to the runtime stage; pin mailpit and base images to
  specific minor versions.

### 7.3 Dev compose lacks the DB healthcheck
`compose.yaml` gates the backend on `service_healthy`; `compose.dev.yaml` does not, so local dev
can hit "backend up before Postgres" races that CI never sees.

- **Suggestion:** copy the healthcheck block into `compose.dev.yaml`.

### 7.4 E2E job rebuilds everything each run
No Docker layer caching; the Playwright browser (~200MB) re-downloads inside the e2e image build.

- **Suggestion:** `docker/build-push-action` with GHA `cache-from`/`cache-to`, and order the
  Containerfile so browser install is a stable early layer.

### 7.5 No failure artifacts (see 6.2)
When e2e fails in CI there is nothing to inspect. Pairs with the `@playwright/test` migration.

---

## 8. Repo hygiene & developer experience

### 8.1 `"latest"` dependency pins (flagged by all three audits)
`backend/package.json`, `frontend/package.json`, and `tests/e2e/package.json` pin dependencies to
`"latest"`. Lock files make installs reproducible *until* anything regenerates them — at which
point every dependency silently jumps to the newest major.

- **Suggestion:** pin to caret ranges of the currently-locked versions, and add
  Dependabot/Renovate so upgrades arrive as reviewable PRs.

### 8.2 No `.env.example`
`vite.config.ts` reads `VITE_PORT` / `VITE_API_PROXY`, and the backend needs `JWT_SECRET` etc.;
required variables are documented in prose but there is no copy-paste template.

- **Suggestion:** add `.env.example` at root (and/or per package) listing every variable with a
  safe default or placeholder.

### 8.3 Missing standard meta-files
No `LICENSE`, no `CONTRIBUTING.md`, no `.editorconfig`. Add whichever match the repo's intent
(a private project may only want `.editorconfig`).

### 8.4 No changelog/release automation
Optional at this stage; conventional commits + auto-changelog only matter once there are external
consumers.

---

## 9. Documentation

### 9.1 Stale: README still says the Tailwind migration is deferred
`README.md` lines ~91, ~103-104, ~595, ~612 describe the Tailwind migration as an
"intentionally-deferred item". It was completed and merged (PR #10, 2026-07-01); `styles.css` now
contains only tokens, base rules, the button baseline, and four text helpers.

- **Suggestion:** update these four spots — cheapest fix in this document.

### 9.2 No structured API reference
Endpoints are described in prose across README and phase docs, but there is no single
endpoint/method/status/shape table (or OpenAPI spec — see 3.2, one artifact could serve both).

### 9.3 Docs are otherwise a strength
Phase-by-phase plans, a Definition-of-Done checklist mapping spec items to test proof, seed-data
docs, cross-platform (Podman/WSL2) setup, and troubleshooting notes are all present and current.

---

## 10. What's already done well

- **Backend architecture:** clean router → service → repository layering with a composition-root
  `createApp()` that makes everything testable.
- **SQL safety:** fully parameterized queries throughout; no string interpolation.
- **Auth design:** email verification, single-use reset tokens, Argon2id hashing, httpOnly cookies,
  normalized emails.
- **Error handling:** typed `AppError` hierarchy, central handler, 500s never leak internals.
- **Validation:** zod on every route's params/query/body.
- **Schema:** FK constraints with the right cascades, indexed foreign keys, migrations via
  node-pg-migrate.
- **Frontend:** strict TypeScript with no `any`, tidy Zustand stores, no prop drilling,
  well-commented optimistic board moves, Tailwind v4 tokens as a single source of truth for the
  Phase 9 type/state colours.
- **Testing:** 10 backend test files running against real Postgres in CI; e2e covers auth, teams,
  epics, tickets, comments, board DnD, and DoD flows.
- **Infra:** multi-stage container builds, prod healthchecks with `service_healthy` gating, a
  hot-reload dev stack, ephemeral seed mode, and a launcher script that auto-detects
  Docker vs Podman.
- **Secrets:** everything sensitive is env-driven; `.env` is git-ignored; nothing hardcoded in
  compose files.

---

## Suggested sequencing

1. **Day-one batch (no behavior change):** pin dependencies, `.env.example`, README Tailwind-note
   fix, dev-compose healthcheck, non-root containers + image pins, centralize UI class constants.
2. **Hardening batch:** CORS allow-list, body size limit, rate limiting, JWT-secret validation,
   explicit Argon2 params, pool config.
3. **Quality batch:** ESLint/Prettier + CI lint job + `npm audit`, error boundary, keyboard DnD
   sensor, first Vitest store tests.
4. **Bigger projects (one PR each):** `@playwright/test` migration with CI artifacts, structured
   logging, toast system, shared API types, pagination, mobile layout.
