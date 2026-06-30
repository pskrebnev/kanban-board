# Phase 3 — Teams

This document is the implementation plan and backlog for **Phase 3** of the Kanban Ticketing
System, as defined in [kanban-ticketing-hls.md](kanban-ticketing-hls.md). It is grounded in the
authoritative spec [KanbanBoard.pdf](KanbanBoard.pdf) (chapters §4, §9, §10, §11).

Phase 3 introduces the first business resource: **teams**, which group epics and tickets. It
builds directly on the Phase 1 persistence foundation (the `teams` table already exists from
migration `0002`) and the Phase 2 authentication layer (all team endpoints sit behind
`requireAuth`).

## Goal

Allow an authenticated user to create, list, rename, and delete teams, with names that are
trimmed, non-empty, and case-insensitively unique, and with deletion blocked while a team is
still referenced by epics or tickets. No epic, ticket, or comment behavior is introduced in this
phase.

## Spec Alignment

- **§4 Teams** — create a team (unique, non-empty name), rename a team, delete a team only when
  it has no epics or tickets; teams group the rest of the domain.
- **§9 API & Persistence Expectations** — all changes go through the API and persist in
  PostgreSQL; server-side validation and referential integrity; meaningful HTTP status codes
  (400 validation, 401 unauthenticated, 404 missing, 409 conflict).
- **§10 Minimum Screens** — a team management screen (list, create, rename, delete).
- **§11 Non-Functional Requirements** — protected endpoints, validated input, and
  loading/empty/success/error states on the team screen.

## Scope

### In scope

- Team repository over the existing `teams` table (no schema change required).
- Endpoints behind `requireAuth`: `GET /api/teams`, `POST /api/teams`, `PATCH /api/teams/:id`,
  `DELETE /api/teams/:id`.
- `zod` validation: trimmed, non-empty `name` (max length enforced); case-insensitive
  uniqueness mapped to `409`.
- Deletion guard: block deletes when epics or tickets reference the team (`409`, no cascade).
- `GET /api/teams` returns, per team, whether it is referenced, so the UI can disable delete.
- Frontend team management screen: list, create, inline rename, delete-with-confirmation, and a
  disabled/explained delete control for referenced teams; a teams store and an in-app route.
- Tests: backend integration (CRUD, validation, conflict, deletion guard) and a Playwright
  `teams-*` flow.
- Documentation updates.

### Out of scope (later phases)

- Epics, tickets, comments, and the board (Phases 4–7).
- Team membership, roles, private teams, per-team access control (spec §12, out of scope).
- Editing anything other than a team's name.

## Technical Approach

### Data model & repository

- Reuse the existing `teams` table (`id uuid`, `name citext`, `created_at`, `modified_at`) and
  its case-insensitive unique index `idx_teams_name_unique` (migration `0002`). No new migration
  is needed.
- Add `src/repositories/team-repository.ts` with `listTeams`, `createTeam`, `findTeamById`,
  `renameTeam`, `deleteTeam`, and a reference check (`teamReferenceCounts` / `isTeamReferenced`)
  that counts rows in `epics` and `tickets` for a team id.
- `listTeams` returns each team plus a `referenced` boolean (true when any epic or ticket points
  at it) via `LEFT JOIN`/`EXISTS` subqueries, so the API exposes delete-eligibility in one call.

### Endpoints (all behind `requireAuth`)

- `GET /api/teams` — list all teams ordered by name; include `referenced` for each.
- `POST /api/teams` — create from a validated `name`; `201` with the new team; duplicate name →
  `409`; invalid name → `400`.
- `PATCH /api/teams/:id` — rename; bump `modified_at`; `404` when missing; duplicate name →
  `409`; invalid name → `400`.
- `DELETE /api/teams/:id` — delete only when unreferenced; `404` when missing; referenced →
  `409` with a clear message; otherwise `204`/`200`.
- Mount `createTeamsRouter(...)` at `/api/teams` in `app.ts`, guarded by the Phase 2
  `requireAuth` middleware.

### Validation & conflict handling

- `zod` schema: `name` is `z.string().trim().min(1).max(100)`; failures map to `ValidationError`
  (`400`) through the existing error handler.
- Case-insensitive uniqueness is enforced by the DB unique index; the service catches the unique
  violation (`23505`) and the FK-restrict violation (`23503`) and re-throws `ConflictError`
  (`409`) with friendly messages. The delete path also pre-checks references so the message is
  specific ("Team has epics or tickets and cannot be deleted").

### Frontend

- New **Teams** page (`/teams`, behind `ProtectedRoute`) reachable from the board header.
- A teams store (Zustand) calling the API for list/create/rename/delete with optimistic-free,
  refetch-on-success behavior.
- UI: a team list; a create form; inline rename (edit + save/cancel); delete with a confirmation
  step; the delete control is disabled with an explanation when `referenced` is true; surface
  `409`/`400` messages inline.
- Loading, empty, success, and error states throughout (spec §11), consistent with the auth
  screens' styling.

### Security & states

- All endpoints require an authenticated, verified session (Phase 2 cookie).
- No secrets involved; standard input validation and referential integrity apply.
- Server is the system of record; the UI never persists teams locally.

---

## Backlog (JIRA-style Epics & Tasks)

Story points are rough relative estimates. IDs are local references (e.g. `P3-1`).

### EPIC P3-E1 — Teams API

> As an authenticated user, I can manage teams through the API so that tickets and epics can be
> grouped.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P3-1 | Team repository | `team-repository.ts` with list/create/find/rename/delete and reference counts over `epics` + `tickets`. | Functions typed and parameterized; `listTeams` returns a `referenced` flag per team. | 3 |
| P3-2 | List & create endpoints | `GET /api/teams` (ordered, with `referenced`) and `POST /api/teams`. | List returns all teams; create returns `201` with the team; both behind `requireAuth`. | 2 |
| P3-3 | Rename endpoint | `PATCH /api/teams/:id` updates name and bumps `modified_at`. | Valid rename → `200`; missing id → `404`. | 2 |
| P3-4 | Delete endpoint | `DELETE /api/teams/:id` removes an unreferenced team. | Unreferenced → `204`/`200`; missing id → `404`. | 2 |
| P3-5 | Router wiring | Mount `/api/teams` behind `requireAuth` in `app.ts`. | Anonymous → `401`; authenticated requests routed correctly. | 1 |

### EPIC P3-E2 — Validation & Deletion Guards

> As the system, I enforce name rules, uniqueness, and referential integrity so that team data
> stays consistent.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P3-6 | Name validation | `zod` schema: trimmed, non-empty, max length. | Empty/whitespace/oversize → `400` with a clear message. | 1 |
| P3-7 | Case-insensitive uniqueness | Map unique-index violations to `409`. | Creating/renaming to an existing name (any case) → `409`. | 2 |
| P3-8 | Referenced-delete guard | Block deletion when epics or tickets reference the team. | Referenced team delete → `409` with explanation; no cascade; unreferenced succeeds. | 2 |

### EPIC P3-E3 — Frontend Team Management

> As a user, I have a screen to view and manage teams.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P3-9 | Teams store & API client | Zustand store + Axios calls for list/create/rename/delete. | Store reflects server state; refetches after mutations. | 2 |
| P3-10 | Teams screen & route | `/teams` page (guarded) with list, create form, and navigation from the header. | Reachable when authenticated; redirects anonymous users to login. | 3 |
| P3-11 | Rename & delete UX | Inline rename; delete with confirmation; disabled/explained delete when referenced. | Rename and delete persist; referenced teams show a disabled delete with reason. | 3 |
| P3-12 | UX states | Loading/empty/success/error across the screen; surface `400`/`409` messages. | Each state visible where applicable (spec §11). | 2 |

### EPIC P3-E4 — Testing

> As a maintainer, I need automated proof of the team flows.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P3-13 | Backend integration tests | CRUD happy paths; duplicate (`409`); invalid name (`400`); missing (`404`); referenced-delete (`409`). | All cases assert status codes and DB side effects against a real Postgres. | 3 |
| P3-14 | Playwright `teams-*` flow | Create a team, rename it, attempt a blocked delete, then a successful delete. | E2E passes in the `test` compose profile. | 3 |

### EPIC P3-E5 — Documentation

> As a reader, I need docs that reflect team management.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P3-15 | README & architecture | Document team endpoints, the screen, and update functionality status. | README and architecture reflect Phase 3. | 1 |
| P3-16 | HLS status update | Mark Phase 3 complete in the HLS. | HLS shows Phase 3 as done with a link here. | 1 |

## Phase 3 Definition of Done

- [ ] An authenticated user can create, list, rename, and delete teams through the UI, persisted
      in PostgreSQL.
- [ ] Team names are trimmed, non-empty, and case-insensitively unique; violations return `400`
      or `409` with clear messages.
- [ ] Deleting a team referenced by epics or tickets is blocked with a `409` and a clear
      message; no cascade occurs.
- [ ] `GET /api/teams` exposes whether each team is referenced so the UI can disable delete.
- [ ] All team endpoints require an authenticated, verified session; anonymous access → `401`.
- [ ] The team screen shows loading, empty, success, and error states.
- [ ] Backend integration tests pass; a Playwright `teams-*` flow is included.
- [ ] README, architecture, and HLS docs reflect team management.

## How To Test Locally

With the stack running (`docker compose up --build`, or the Podman equivalent) and a verified,
logged-in account:

### Manual (browser)

1. From the board header, open the **Teams** screen.
2. Create a team (e.g. `Platform`); it appears in the list.
3. Rename it inline and save; the new name persists across refresh.
4. Try to create another team with the same name (any case) → a `409` conflict message appears.
5. Delete an unreferenced team → it disappears from the list.
6. (After Phase 4/5) a team with epics or tickets shows a disabled delete with an explanation;
   forcing the request returns `409`.

### Automated

- **Backend:** from `backend/`, run `npm test` with `TEST_DATABASE_URL`/`DATABASE_URL` pointing
  at a migrated database.
- **End-to-end:** `podman-compose -f infra/podman/podman-compose.yml --profile test up --build --abort-on-container-exit e2e`.

## Dependencies & Risks

- **Builds on Phase 2 auth:** team endpoints rely on `requireAuth`; the e2e flow must first sign
  up, verify (via Mailpit), and log in before exercising teams.
- **Reference checks vs. later phases:** epics (Phase 4) and tickets (Phase 5) are the sources of
  references. Until they exist, the deletion guard is exercised by tests that insert reference
  rows directly; the UI's disabled-delete state becomes fully meaningful once those phases land.
- **Conflict mapping:** rely on DB constraints (unique `23505`, FK-restrict `23503`) as the
  source of truth, translating them to `409` rather than racing with pre-checks.
- **Case-insensitivity:** `citext` + the unique index already provide case-insensitive
  uniqueness; the service should not re-implement comparison logic.
