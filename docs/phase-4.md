# Phase 4 — Epics

This document is the implementation plan and backlog for **Phase 4** of the Kanban Ticketing
System, as defined in [kanban-ticketing-hls.md](kanban-ticketing-hls.md). It is grounded in the
authoritative spec [KanbanBoard.pdf](KanbanBoard.pdf) (chapters §5, §9, §10, §11).

Phase 4 introduces the second business resource: **epics**, which belong to exactly one team and
group tickets. It builds on the Phase 1 persistence foundation (the `epics` table already exists
from migration `0002`), the Phase 2 authentication layer (all epic endpoints sit behind
`requireAuth`), and the Phase 3 teams resource (an epic references a team).

> **Status: complete.** The epics API (`GET/POST/PATCH/DELETE /api/epics`), the Tailwind-built
> `/epics` screen, backend integration tests, and a Playwright `epics-flow` are implemented and
> green. See the checked Definition of Done below.

## Goal

Allow an authenticated user to create, list (filterable by team), edit, and delete epics. An
epic's title is trimmed and non-empty, its description is optional, and its **team is fixed at
creation** (immutable afterwards). Deletion is blocked while the epic is still referenced by
tickets. No ticket or comment behavior is introduced in this phase.

## Spec Alignment

- **§5 Epics** — an epic belongs to exactly one team; create with a title (and optional
  description), edit title/description, delete only when no tickets reference it; the team is
  chosen at creation and does not change.
- **§9 API & Persistence Expectations** — all changes go through the API and persist in
  PostgreSQL; server-side validation and referential integrity; meaningful HTTP status codes
  (400 validation, 401 unauthenticated, 404 missing, 409 conflict).
- **§10 Minimum Screens** — an epic management screen (create with team selector, list filterable
  by team, edit, delete).
- **§11 Non-Functional Requirements** — protected endpoints, validated input, and
  loading/empty/success/error states on the epic screen.

## Scope

### In scope

- Epic repository over the existing `epics` table (no schema change required).
- Endpoints behind `requireAuth`: `GET /api/epics?teamId=…`, `POST /api/epics`,
  `PATCH /api/epics/:id`, `DELETE /api/epics/:id`.
- `zod` validation: trimmed, non-empty `title` (max length enforced); optional `description`;
  `teamId` required and must reference an existing team on create.
- **Team immutability:** `PATCH` accepts only `title`/`description`; any attempt to change
  `teamId` is rejected.
- Deletion guard: block deletes when tickets reference the epic (`409`, no cascade).
- `GET /api/epics` returns, per epic, whether it is referenced, so the UI can disable delete; it
  supports an optional `teamId` filter.
- A reusable **"epic belongs to ticket's team"** validator, exported for Phase 5 (tickets).
- Frontend epic management screen: create form with a team selector, list (filterable by team),
  edit (title/description), delete-with-confirmation, and a disabled/explained delete control for
  referenced epics; an epics store and an in-app route.
- Tests: backend integration (CRUD, validation, team-immutability, conflict, deletion guard) and
  a Playwright `epics-*` flow.
- Documentation updates.

### Out of scope (later phases)

- Tickets, comments, and the board (Phases 5–7).
- Moving an epic between teams (explicitly disallowed by the spec).
- Epic ordering, archiving, or rich text in descriptions.

## Technical Approach

### Data model & repository

- Reuse the existing `epics` table (`id uuid`, `team_id uuid NOT NULL REFERENCES teams ON DELETE
  RESTRICT`, `title text NOT NULL`, `description text`, `created_at`, `modified_at`) and its index
  `idx_epics_team_id` (migration `0002`). No new migration is needed.
- Add `src/repositories/epic-repository.ts` with `listEpics` (optionally filtered by `teamId`,
  joined to the team name and with a `referenced` flag), `createEpic`, `findEpicById`,
  `updateEpic` (title/description only), `deleteEpic`, and a reference check
  (`isEpicReferenced`) that counts rows in `tickets` for an epic id.
- `listEpics` returns each epic plus its `teamId`, `teamName`, and a `referenced` boolean (true
  when any ticket points at it), so the API exposes delete-eligibility and team context in one
  call.

### Endpoints (all behind `requireAuth`)

- `GET /api/epics?teamId=…` — list epics ordered by title; optional `teamId` filter; include
  `teamName` and `referenced` for each.
- `POST /api/epics` — create from a validated `teamId` + `title` + optional `description`; `201`
  with the new epic; unknown `teamId` → `400`/`404`; invalid title → `400`.
- `PATCH /api/epics/:id` — edit `title`/`description`; bump `modified_at`; `404` when missing;
  invalid title → `400`; an attempt to change the team → `400` (`team is immutable`).
- `DELETE /api/epics/:id` — delete only when unreferenced; `404` when missing; referenced →
  `409` with a clear message; otherwise `204`.
- Mount `createEpicsRouter(...)` at `/api/epics` in `app.ts`, guarded by the Phase 2
  `requireAuth` middleware.

### Validation & conflict handling

- `zod` schema: `title` is `z.string().trim().min(1).max(200)`; `description` is an optional,
  trimmed string (nullable); `teamId` is a `z.uuid()`. Failures map to `ValidationError` (`400`)
  through the existing error handler.
- On create, the service verifies the team exists (reusing the team repository) and maps a
  missing team to a clear `400`/`404`. The FK-restrict constraint on `tickets.epic_id` is the
  ultimate safeguard for deletes; the service pre-checks references (`23503` caught as a
  fallback) and re-throws `ConflictError` (`409`) with a friendly message.
- The `PATCH` payload schema simply omits `teamId`; if a client sends one that differs from the
  stored value, the service rejects it with a `400` so the immutability rule is explicit.

### Reusable validator for Phase 5

- Export `assertEpicBelongsToTeam(pool, epicId, teamId)` (or a pure helper operating on a loaded
  epic) so Phase 5 ticket creation/edit can reject an epic that belongs to a different team than
  the ticket. This keeps the cross-resource rule in one place.

### Frontend

- New **Epics** page (`/epics`, behind `ProtectedRoute`) reachable from the board header and the
  teams screen.
- An epics store (Zustand) calling the API for list (with optional `teamId`), create, edit, and
  delete, with refetch-on-success behavior; a team selector populated from the teams store.
- UI: a team filter; a create form with a required team selector and title (+ optional
  description); a list grouped/filtered by team; edit (inline or a small form) for
  title/description; delete with a confirmation step; the delete control is disabled with an
  explanation when `referenced` is true; surface `409`/`400` messages inline.
- Loading, empty, success, and error states throughout (spec §11), consistent with the rest of
  the app's styling (Tailwind CSS).

### Security & states

- All endpoints require an authenticated, verified session (Phase 2 cookie).
- No secrets involved; standard input validation and referential integrity apply.
- Server is the system of record; the UI never persists epics locally.

---

## Backlog (JIRA-style Epics & Tasks)

Story points are rough relative estimates. IDs are local references (e.g. `P4-1`).

### EPIC P4-E1 — Epics API

> As an authenticated user, I can manage epics through the API so that tickets can be grouped
> under a team's epic.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P4-1 | Epic repository | `epic-repository.ts` with list (optional `teamId`, join team name, `referenced` flag), create, find, update (title/description), delete, and ticket reference count. | Functions typed and parameterized; `listEpics` returns `teamId`, `teamName`, and `referenced`. | 3 |
| P4-2 | List & create endpoints | `GET /api/epics?teamId=…` (ordered, filterable, with `referenced`) and `POST /api/epics`. | List returns epics; create returns `201` with the epic; both behind `requireAuth`. | 3 |
| P4-3 | Edit endpoint | `PATCH /api/epics/:id` updates title/description and bumps `modified_at`. | Valid edit → `200`; missing id → `404`. | 2 |
| P4-4 | Delete endpoint | `DELETE /api/epics/:id` removes an unreferenced epic. | Unreferenced → `204`; missing id → `404`. | 2 |
| P4-5 | Router wiring | Mount `/api/epics` behind `requireAuth` in `app.ts`. | Anonymous → `401`; authenticated requests routed correctly. | 1 |

### EPIC P4-E2 — Validation, Immutability & Deletion Guards

> As the system, I enforce title rules, team membership, immutability, and referential integrity
> so that epic data stays consistent.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P4-6 | Title/description validation | `zod` schema: trimmed, non-empty title, max length; optional description. | Empty/whitespace/oversize title → `400` with a clear message. | 1 |
| P4-7 | Team exists on create | Verify `teamId` references an existing team. | Unknown team → `400`/`404` with a clear message. | 2 |
| P4-8 | Team immutability | Reject any attempt to change an epic's team on edit. | `PATCH` with a different `teamId` → `400` ("team is immutable"). | 2 |
| P4-9 | Referenced-delete guard | Block deletion when tickets reference the epic. | Referenced epic delete → `409` with explanation; no cascade; unreferenced succeeds. | 2 |
| P4-10 | Cross-team validator | Export an `assertEpicBelongsToTeam` helper for Phase 5. | Helper returns/throws consistently; unit-tested. | 1 |

### EPIC P4-E3 — Frontend Epic Management

> As a user, I have a screen to view and manage epics.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P4-11 | Epics store & API client | Zustand store + Axios calls for list (with `teamId`), create, edit, delete. | Store reflects server state; refetches after mutations. | 2 |
| P4-12 | Epics screen & route | `/epics` page (guarded) with team filter, create form (team selector + title + optional description), and navigation from the header. | Reachable when authenticated; redirects anonymous users to login. | 3 |
| P4-13 | Edit & delete UX | Edit title/description; delete with confirmation; disabled/explained delete when referenced. | Edits and deletes persist; referenced epics show a disabled delete with reason. | 3 |
| P4-14 | UX states (Tailwind) | Loading/empty/success/error across the screen; surface `400`/`409` messages; built with Tailwind utilities. | Each state visible where applicable (spec §11). | 2 |

### EPIC P4-E4 — Testing

> As a maintainer, I need automated proof of the epic flows.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P4-15 | Backend integration tests | CRUD happy paths; invalid title (`400`); unknown team (`400`/`404`); team-immutability (`400`); missing (`404`); referenced-delete (`409`); `teamId` filter. | All cases assert status codes and DB side effects against a real Postgres. | 3 |
| P4-16 | Playwright `epics-*` flow | Create a team, create an epic for it, edit it, attempt a blocked delete (after a ticket exists in a later phase), then a successful delete. | E2E passes in the `test` compose profile. | 3 |

### EPIC P4-E5 — Documentation

> As a reader, I need docs that reflect epic management.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P4-17 | README & architecture | Document epic endpoints, the screen, and update functionality status. | README and architecture reflect Phase 4. | 1 |
| P4-18 | HLS status update | Mark Phase 4 complete in the HLS. | HLS shows Phase 4 as done with a link here. | 1 |

## Phase 4 Definition of Done

- [x] An authenticated user can create, list (filterable by team), edit, and delete epics through
      the UI, persisted in PostgreSQL.
- [x] Epic titles are trimmed and non-empty (max length enforced); descriptions are optional;
      violations return `400` with clear messages.
- [x] An epic's team is set at creation and is immutable; attempts to change it return `400`.
- [x] Creating an epic for an unknown team is rejected with a clear `400`/`404`.
- [x] Deleting an epic referenced by tickets is blocked with a `409` and a clear message; no
      cascade occurs.
- [x] `GET /api/epics` exposes whether each epic is referenced and supports a `teamId` filter.
- [x] All epic endpoints require an authenticated, verified session; anonymous access → `401`.
- [x] A reusable cross-team validator is exported for Phase 5.
- [x] The epic screen shows loading, empty, success, and error states.
- [x] Backend integration tests pass; a Playwright `epics-*` flow is included.
- [x] README, architecture, and HLS docs reflect epic management.

## How To Test Locally

With the stack running (`docker compose up --build`, or the Podman equivalent) and a verified,
logged-in account that already has at least one team:

### Manual (browser)

1. From the board header, open the **Epics** screen.
2. Select a team and create an epic (title + optional description); it appears in the list.
3. Edit the epic's title/description and save; the changes persist across refresh.
4. Confirm there is no way to change the epic's team after creation.
5. Filter the list by team; only that team's epics are shown.
6. Delete an unreferenced epic → it disappears from the list.
7. (After Phase 5) an epic with tickets shows a disabled delete with an explanation; forcing the
   request returns `409`.

### Automated

- **Backend:** from `backend/`, run `npm test` with `TEST_DATABASE_URL`/`DATABASE_URL` pointing
  at a migrated database.
- **End-to-end:** `podman-compose -f infra/podman/podman-compose.yml --profile test up --build --abort-on-container-exit e2e`.

### Text test scenarios

The catalogue of text-format test cases for epics lives in
[testing-approach.md](testing-approach.md) under **Epic Management**. They cover CRUD, title
validation, unknown-team rejection, team immutability, the `teamId` filter, the referenced-delete
guard, and authentication.

## Dependencies & Risks

- **Builds on Phases 2–3:** epic endpoints rely on `requireAuth` and on teams existing; the e2e
  flow must sign up, verify (via Mailpit), log in, and create a team before exercising epics.
- **Reference checks vs. Phase 5:** tickets (Phase 5) are the source of references. Until they
  exist, the deletion guard is exercised by tests that insert ticket rows directly; the UI's
  disabled-delete state becomes fully meaningful once Phase 5 lands.
- **Team immutability:** enforced at the service/schema level (the `PATCH` schema omits `teamId`),
  not just in the UI, so the rule holds for direct API calls.
- **Conflict mapping:** rely on the DB FK-restrict (`23503`) as the source of truth for deletes,
  translating it to `409`, with a service-side pre-check for a specific message.
