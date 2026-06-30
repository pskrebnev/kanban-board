# Phase 5 — Tickets

This document is the implementation plan and backlog for **Phase 5** of the Kanban Ticketing
System, as defined in [kanban-ticketing-hls.md](kanban-ticketing-hls.md). It is grounded in the
authoritative spec [KanbanBoard.pdf](KanbanBoard.pdf) (chapters §6, §9, §10, §11).

Phase 5 introduces the core business resource: **tickets**. A ticket belongs to exactly one team,
has a fixed type and a five-state workflow, may optionally belong to an epic of the same team, and
records who created it and when it was last changed. It builds on the Phase 1 persistence
foundation (the `tickets` table already exists from migration `0003`), the Phase 2 authentication
layer (all ticket endpoints sit behind `requireAuth`, and `created_by` comes from the session),
the Phase 3 teams resource, and the Phase 4 epics resource (reusing the exported
`assertEpicBelongsToTeam` validator).

> **Status: planned.** This document defines the plan only; no Phase 5 application code has been
> written yet. Comments (Phase 6) and the drag-and-drop board (Phase 7) are explicitly out of
> scope here.

## Goal

Allow an authenticated user to create, view, edit, and delete tickets through the API and UI, with
full server-side validation. Type and state are constrained to their fixed enums, an optional epic
must belong to the ticket's team, `created_by` is taken from the authenticated session, and
`modified_at` advances **only** when a real field or state value changes (a no-op save must not
bump it). Deleting a ticket deletes its comments (via the existing `ON DELETE CASCADE`). State
changes persist immediately. The drag-and-drop board itself is Phase 7; Phase 5 delivers the data
model, API, and the create/edit/details screens.

## Spec Alignment

- **§6 Tickets** — fields are id, team (required), type (`bug|feature|fix`), state
  (`new|ready_for_implementation|in_progress|ready_for_acceptance|done`), optional epic, title,
  body, `created_at`, `modified_at`, `created_by`. The epic (if set) must belong to the ticket's
  team. `modified_at` reflects the last real change; unchanged saves do not advance it.
- **§9 API & Persistence Expectations** — all changes go through the API and persist in
  PostgreSQL; enum values and references are enforced server-side; state changes persist
  immediately; meaningful HTTP status codes (400 validation, 401 unauthenticated, 404 missing,
  409 conflict where relevant).
- **§10 Minimum Screens** — a ticket create/edit/details screen showing all fields, including
  `created_by` and the timestamps, with an explicit delete confirmation.
- **§11 Non-Functional Requirements** — protected endpoints, validated input, and
  loading/empty/success/error states on the ticket screens.

## Scope

### In scope

- Ticket repository over the existing `tickets` table (no schema change required).
- Endpoints behind `requireAuth`: `GET /api/tickets` (filterable by `teamId`, `state`, `type`,
  `epicId`), `GET /api/tickets/:id` (full detail incl. team/epic names and author email),
  `POST /api/tickets`, `PATCH /api/tickets/:id`, `DELETE /api/tickets/:id`, and a dedicated
  `PATCH /api/tickets/:id/state` for immediate state transitions.
- `zod` validation: `type` and `state` constrained to their enums; trimmed, non-empty `title`
  (max length) and `body`; `teamId` required and must reference an existing team; `epicId`
  optional and, when present, must reference an epic **of the same team** (reusing Phase 4's
  `assertEpicBelongsToTeam`).
- **`created_by` from the session** (never trusted from the request body).
- **Modified-timestamp semantics:** compare incoming values to the stored row; only `UPDATE`
  (and only bump `modified_at`) when something actually changes; a no-op save returns the row
  unchanged with the original `modified_at`.
- **Team/epic consistency on edit:** when a ticket's team changes, an epic that no longer matches
  the new team is rejected (`400`); the UI clears/replaces the incompatible epic before saving.
- Deleting a ticket removes its comments automatically (the `comments.ticket_id` FK is
  `ON DELETE CASCADE`); no manual comment handling is needed in Phase 5.
- Frontend ticket screens: a create form, an editable details view (all fields + read-only
  metadata: `created_by`, `created_at`, `modified_at`), a team selector that constrains the epic
  options, type/state selectors, delete-with-confirmation, and loading/empty/success/error states.
- A `tickets` store (Zustand) and in-app routes (`/tickets/new`, `/tickets/:id`), reachable from
  the header; built with Tailwind utilities to match the Phase 4 screens.
- Tests: backend integration (CRUD, enum validation, required fields, cross-team epic rejection,
  `created_by` from session, modified-timestamp semantics, comment cascade, filters, 404/401) and
  a Playwright `tickets-*` flow.
- Documentation updates.

### Out of scope (later phases)

- Comments UI and endpoints (Phase 6) — only the delete-cascade behavior is relied upon here.
- The Kanban board, drag-and-drop, column ordering, filtering/search UI, and ≥100-ticket
  performance work (Phase 7). Phase 5 provides the listing/state API those will build on.
- Attachments, rich text, ticket history/audit, and assignees (not in mandatory scope).

## Technical Approach

### Data model & repository

- Reuse the existing `tickets` table (`id`, `team_id NOT NULL REFERENCES teams ON DELETE
  RESTRICT`, `epic_id REFERENCES epics ON DELETE RESTRICT`, `type ticket_type`, `state
  ticket_state DEFAULT 'new'`, `title`, `body`, `created_by NOT NULL REFERENCES users`,
  `created_at`, `modified_at`) and its indexes on `team_id`, `epic_id`, `state`, and
  `modified_at DESC` (migration `0003`). No new migration is needed.
- Add `src/repositories/ticket-repository.ts` with `listTickets` (filters: `teamId`, `state`,
  `type`, `epicId`; joined to team name, epic title, and author email; ordered by
  `modified_at DESC` to match the future board), `findTicketById` (full detail), `createTicket`,
  `updateTicket` (only the changed columns; always sets `modified_at = now()` when called),
  `updateTicketState`, and `deleteTicket`.
- The repository returns enriched read rows (`teamName`, `epicTitle`, `createdByEmail`) so the
  details/list screens render without N+1 calls.

### Endpoints (all behind `requireAuth`)

- `GET /api/tickets?teamId=&state=&type=&epicId=` — list tickets, newest-modified first; all
  filters optional and AND-combined; include `teamName`, `epicTitle`, and `createdByEmail`.
- `GET /api/tickets/:id` — full ticket detail; `404` when missing.
- `POST /api/tickets` — create from a validated `teamId` + `type` + `title` + `body`
  (+ optional `epicId`, + optional initial `state` defaulting to `new`); `created_by` from the
  session; `201` with the new ticket.
- `PATCH /api/tickets/:id` — edit `title`, `body`, `type`, `state`, `teamId`, `epicId`; enforce
  enum values and team/epic consistency; advance `modified_at` only on a real change; `404` when
  missing.
- `PATCH /api/tickets/:id/state` — transition state and persist immediately; advance
  `modified_at`; `404` when missing. (Used by the Phase 7 board; introduced here so state changes
  have a single, immediate-persistence path.)
- `DELETE /api/tickets/:id` — delete the ticket (its comments cascade); `404` when missing;
  otherwise `204`.
- Mount `createTicketsRouter(...)` at `/api/tickets` in `app.ts`, guarded by `requireAuth`.

### Validation, references & conflict handling

- `zod` schemas: `type` is `z.enum(['bug','feature','fix'])`; `state` is
  `z.enum(['new','ready_for_implementation','in_progress','ready_for_acceptance','done'])`;
  `title` is `z.string().trim().min(1).max(200)`; `body` is `z.string().trim().min(1).max(20000)`;
  `teamId` is a `z.uuid()`; `epicId` is an optional, nullable `z.uuid()`. Failures map to
  `ValidationError` (`400`) through the existing error handler.
- The service verifies the team exists (reusing the team repository) and, when an `epicId` is
  provided, calls the Phase 4 `assertEpicBelongsToTeam(pool, epicId, teamId)` so a cross-team or
  unknown epic is rejected with a clear `400`.
- `created_by` is always read from `request.user` (set by `requireAuth`), never from the body.
- **Modified-timestamp rule:** the service loads the existing row, builds the set of genuinely
  changed columns, and: if nothing changed, returns the row untouched (original `modified_at`); if
  something changed, issues a single `UPDATE` that also sets `modified_at = now()`.
- FK-restrict on `team_id`/`epic_id` and FK-cascade on `comments.ticket_id` are the database-level
  safeguards; the service pre-checks where a friendlier message helps.

### Reuse from earlier phases

- **Auth:** `requireAuth` + the session user for `created_by`.
- **Teams:** `findTeamById` to validate the team.
- **Epics:** `assertEpicBelongsToTeam` for the cross-team epic rule — the single source of truth
  introduced in Phase 4.

### Frontend

- New ticket screens behind `ProtectedRoute`:
  - **Create** (`/tickets/new`): team selector (required) → constrains the epic dropdown; type
    selector; title; body; optional epic; on submit, navigate to the new ticket's details.
  - **Details/Edit** (`/tickets/:id`): all fields editable except the read-only metadata
    (`created_by` email, `created_at`, `modified_at`); a state selector that persists immediately;
    explicit delete confirmation.
- A `tickets` store (Zustand) calling the API for list (with filters), get, create, update,
  state-change, and delete, refetching on success; the team selector drives the epic options
  (reusing the epics store filtered by team).
- When the selected team changes and the chosen epic no longer belongs to it, the UI clears the
  epic before allowing save (mirroring the server rule).
- Loading, empty, success, and error states throughout (spec §11), consistent with the Tailwind
  styling of the Phase 4 screens. Surface `400`/`404` messages inline.

### Security & states

- All endpoints require an authenticated, verified session (Phase 2 cookie).
- `created_by` is derived from the session; the body cannot spoof authorship.
- Server is the system of record; the UI never persists tickets locally.

---

## Backlog (JIRA-style Epics & Tasks)

Story points are rough relative estimates. IDs are local references (e.g. `P5-1`).

### EPIC P5-E1 — Tickets API

> As an authenticated user, I can manage tickets through the API so that work can be tracked
> against a team (and optionally an epic).

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P5-1 | Ticket repository | `ticket-repository.ts` with list (filters: `teamId`/`state`/`type`/`epicId`, joined to team name, epic title, author email, ordered by `modified_at DESC`), find-by-id (detail), create, update (changed columns), update-state, delete. | Functions typed and parameterized; read rows include `teamName`, `epicTitle`, `createdByEmail`. | 3 |
| P5-2 | List & detail endpoints | `GET /api/tickets` (filterable, newest-modified first) and `GET /api/tickets/:id`. | List returns enriched rows; detail returns full ticket or `404`; both behind `requireAuth`. | 3 |
| P5-3 | Create endpoint | `POST /api/tickets` with `created_by` from the session and default state `new`. | Valid create → `201` with the ticket; `created_by` matches the caller, never the body. | 3 |
| P5-4 | Edit endpoint | `PATCH /api/tickets/:id` updates title/body/type/state/team/epic. | Valid edit → `200`; missing id → `404`. | 3 |
| P5-5 | State-change endpoint | `PATCH /api/tickets/:id/state` persists a transition immediately and bumps `modified_at`. | Valid transition → `200` with the new state; missing id → `404`. | 2 |
| P5-6 | Delete endpoint | `DELETE /api/tickets/:id` removes the ticket; comments cascade. | Existing → `204` and its comments are gone; missing id → `404`. | 2 |
| P5-7 | Router wiring | Mount `/api/tickets` behind `requireAuth` in `app.ts`. | Anonymous → `401`; authenticated requests routed correctly. | 1 |

### EPIC P5-E2 — Validation, References & Timestamp Semantics

> As the system, I enforce field rules, enum values, references, and correct timestamp behavior so
> that ticket data stays consistent.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P5-8 | Field validation | `zod`: trimmed, non-empty `title` (max length) and `body`; required `teamId`. | Empty/whitespace/oversize title or empty body → `400` with a clear message. | 2 |
| P5-9 | Enum validation | `type` ∈ {bug,feature,fix}; `state` ∈ the five workflow states. | Invalid `type`/`state` → `400`; valid values accepted. | 1 |
| P5-10 | Team exists | Verify `teamId` references an existing team. | Unknown team → `400`/`404` with a clear message. | 1 |
| P5-11 | Cross-team epic rule | When `epicId` is set, reuse `assertEpicBelongsToTeam`. | Epic from another team or unknown epic → `400`; same-team epic accepted; null epic allowed. | 2 |
| P5-12 | created_by from session | Derive `created_by` from `request.user`. | Authorship always equals the caller; a body-supplied `createdBy` is ignored. | 1 |
| P5-13 | Modified-timestamp semantics | Only update + bump `modified_at` when a real value changes. | A no-op save leaves `modified_at` unchanged; any real change advances it. | 3 |
| P5-14 | Team-change epic consistency | On a team change, reject an epic that no longer matches. | `PATCH` changing `teamId` with an incompatible `epicId` → `400`; clearing the epic succeeds. | 2 |

### EPIC P5-E3 — Frontend Ticket Management

> As a user, I have screens to create, view, edit, and delete tickets.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P5-15 | Tickets store & API client | Zustand store + Axios calls for list (with filters), get, create, update, state-change, delete. | Store reflects server state; refetches after mutations. | 2 |
| P5-16 | Create screen & route | `/tickets/new` (guarded): team selector → constrains epic options, type, title, body, optional epic. | Reachable when authenticated; redirects anonymous users to login; create navigates to details. | 3 |
| P5-17 | Details/edit screen | `/tickets/:id` (guarded) shows all fields with read-only `created_by`/timestamps; edit + immediate state change; delete with confirmation. | Edits and state changes persist; delete removes the ticket; metadata is read-only. | 3 |
| P5-18 | Team/epic UX consistency | Changing team clears/replaces an incompatible epic before save. | UI prevents saving a cross-team epic; matches the server rule. | 2 |
| P5-19 | UX states (Tailwind) | Loading/empty/success/error across the screens; surface `400`/`404` messages; built with Tailwind utilities. | Each state visible where applicable (spec §11). | 2 |

### EPIC P5-E4 — Testing

> As a maintainer, I need automated proof of the ticket flows.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P5-20 | Backend integration tests | CRUD happy paths; required fields (`400`); invalid enums (`400`); unknown team (`400`/`404`); cross-team epic (`400`); `created_by` from session; modified-timestamp semantics (no-op vs real change); comment cascade on delete; filters; missing (`404`); anonymous (`401`). | All cases assert status codes and DB side effects against a real Postgres. | 3 |
| P5-21 | Playwright `tickets-*` flow | Create a team (+ epic), create a ticket for it, view details, edit fields, change state, then delete. | E2E passes in the `test` compose profile. | 3 |

### EPIC P5-E5 — Documentation

> As a reader, I need docs that reflect ticket management.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P5-22 | README & architecture | Document ticket endpoints, the screens, and update functionality status. | README and architecture reflect Phase 5. | 1 |
| P5-23 | HLS status update | Mark Phase 5 complete in the HLS. | HLS shows Phase 5 as done with a link here. | 1 |

## Phase 5 Definition of Done

- [ ] An authenticated user can create, view, edit, and delete tickets through the UI, persisted
      in PostgreSQL.
- [ ] `title` and `body` are trimmed and non-empty (max length enforced); violations return `400`
      with clear messages.
- [ ] `type` and `state` are constrained to their fixed enums; invalid values return `400`.
- [ ] A ticket's `teamId` must reference an existing team; an optional `epicId` must reference an
      epic of the **same** team (reusing `assertEpicBelongsToTeam`); violations return `400`.
- [ ] `created_by` is always taken from the authenticated session and cannot be spoofed by the
      request body.
- [ ] `modified_at` advances only on a real field/state change; a no-op save leaves it unchanged.
- [ ] Changing a ticket's team rejects an epic that no longer belongs to it (`400`); clearing the
      epic succeeds.
- [ ] State changes persist immediately via a dedicated endpoint.
- [ ] Deleting a ticket deletes its comments (cascade); deleting a missing ticket returns `404`.
- [ ] All ticket endpoints require an authenticated, verified session; anonymous access → `401`.
- [ ] The ticket screens show loading, empty, success, and error states.
- [ ] Backend integration tests pass; a Playwright `tickets-*` flow is included.
- [ ] README, architecture, and HLS docs reflect ticket management.

## How To Test Locally

With the stack running (`docker compose up --build`, or the Podman equivalent) and a verified,
logged-in account that already has at least one team (and, to test epic association, an epic for
that team):

### Manual (browser)

1. From the header, open the ticket create screen and create a ticket (team + type + title +
   body, optional epic); it appears with `created_by` set to you and `created_at`/`modified_at`
   timestamps.
2. Open the ticket details; edit the title/body/type and save — `modified_at` advances.
3. Save again without changing anything — `modified_at` does **not** advance.
4. Change the state; the change persists immediately and survives a refresh.
5. Try associating an epic from a different team — the UI prevents it and the API rejects it.
6. Change the ticket's team so the current epic no longer matches — the UI clears the epic before
   allowing save.
7. Delete the ticket (with confirmation) → it disappears; any comments it had are gone too.

### Automated

- **Backend:** from `backend/`, run `npm test` with `TEST_DATABASE_URL`/`DATABASE_URL` pointing
  at a migrated database.
- **End-to-end:** `podman-compose -f infra/podman/podman-compose.yml --profile test up --build --abort-on-container-exit e2e`.

### Text test scenarios

The catalogue of text-format test cases for tickets lives in
[testing-approach.md](testing-approach.md) under **Ticket Management**. They cover CRUD, required
fields, enum validation, cross-team epic rejection, `created_by` provenance, the
modified-timestamp semantics, team-change epic consistency, immediate state persistence, the
comment cascade, filtering, and authentication.

## Dependencies & Risks

- **Builds on Phases 2–4:** ticket endpoints rely on `requireAuth`, on teams existing, and on the
  Phase 4 `assertEpicBelongsToTeam` validator; the e2e flow must sign up, verify (via Mailpit),
  log in, and create a team (and an epic, to exercise association) before exercising tickets.
- **Comments cascade (Phase 6):** the delete path depends on the existing
  `comments.ticket_id ON DELETE CASCADE`. Until the comments feature lands, the cascade is
  exercised by tests that insert comment rows directly.
- **Board reuse (Phase 7):** the list ordering (`modified_at DESC`), filters, and the dedicated
  state-change endpoint are designed so the Phase 7 board can build on them without API churn.
- **Modified-timestamp correctness** is the subtlest rule: it must be enforced server-side by
  comparing stored vs incoming values, not by trusting the client, so direct API calls behave
  correctly too.
