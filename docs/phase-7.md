# Phase 7 — Kanban Board, Filtering & Search

This document is the implementation plan and backlog for **Phase 7** of the Kanban Ticketing
System, as defined in [kanban-ticketing-hls.md](kanban-ticketing-hls.md). It is grounded in the
authoritative spec [KanbanBoard.pdf](KanbanBoard.pdf) (chapters §8, §9, §10, §11, §15).

Phase 7 delivers the **primary screen** of the application: a real, persisted Kanban board for one
selected team, with drag-and-drop state changes, filtering, and search. It builds on the Phase 3
teams resource (team selector), the Phase 4 epics resource (epic filter), and — most directly — the
Phase 5 tickets resource, which already provides the list endpoint (filterable, ordered
`modified_at DESC`), the dedicated `PATCH /api/tickets/:id/state` endpoint, and the ticket
create/details screens the board's "create" and "open" actions navigate to.

> **Status: planned.** This document defines the plan only; no Phase 7 application code has been
> written yet. The current `Board` screen is a static placeholder (hard-coded columns, one sample
> card, an empty `DndContext`) — see [Board.tsx](../frontend/src/pages/Board.tsx).

## Goal

Replace the placeholder board with the real primary screen: a team-scoped Kanban board with five
fixed columns in workflow order, draggable cards that persist state changes through the existing
ticket API, a clear way to create and open tickets, and filtering (type, epic) plus a
case-insensitive title search — all combined with AND logic — while remaining usable with at least
100 tickets on one team's board.

## Spec Alignment

- **§8 Kanban Board** — the board is the primary screen, for one selected team; exactly five
  columns in workflow order; each card shows at least title and type (epic recommended); drag a
  card to change its state, persisted immediately through the API; a failed update rolls the card
  back and shows an error; cards may move directly between any two states (no enforced sequence);
  within a column, cards are ordered by most-recently-modified first (no persisted manual order);
  clear create-ticket and open-ticket actions; minimum filtering by type and epic, plus a
  case-insensitive title substring search, AND-combined; usable with ≥100 tickets on one board.
- **§9 API & Persistence Expectations** — all state changes go through the API and persist in
  PostgreSQL; meaningful status codes; identifiers/timestamps unchanged from earlier phases.
- **§10 Minimum Screens** — "Kanban board with team selector" is a mandatory screen.
- **§11 Non-Functional Requirements** — usability (loading/empty/success/error states) and
  reliability (refresh must not lose board state); the UI remains usable at ≥100 tickets.
- **§15 Reference Wireframes (Wireframe 1)** — team selector, search box, type/epic filters with a
  clear/reset action, a per-column ticket count, a prominent "New ticket" action, and cards showing
  type, title, epic, and a relative last-modified hint. Wireframes are guidance, not a mandated
  visual design.

## Scope

### In scope

- A real `Board` screen at the existing `/` (or `/board`) route: a team selector, five fixed
  columns (`new`, `ready_for_implementation`, `in_progress`, `ready_for_acceptance`, `done`) in
  that order, and cards rendering each ticket's title, type, and epic (when set).
- Drag-and-drop using the already-installed `dnd-kit` (`@dnd-kit/core`): draggable cards, droppable
  columns, an optimistic move on drop, a call to the existing
  `PATCH /api/tickets/:id/state`, and a rollback to the original column with a visible error if the
  request fails.
- Cards may move directly between any two columns (no sequential-transition enforcement) — this is
  already true of the Phase 5 state endpoint; Phase 7 only needs to confirm the board does not add
  any client-side restriction.
- Within a column, cards keep the order already returned by the existing list endpoint
  (`modified_at DESC` — most-recently-modified first); no new sort/persistence is required.
- Clear "New ticket" (navigates to the existing `/tickets/new`, pre-selecting the board's current
  team) and "open ticket" (navigates to the existing `/tickets/:id`) actions.
- Filtering by ticket type and epic (epic options scoped to the selected team), plus a
  case-insensitive substring search over ticket title; all active filters combine with AND logic; a
  "Clear" action resets them. Filtering happens **client-side** over the already-fetched,
  team-scoped ticket list (see the explicit decision in Technical Approach below).
- A per-column ticket count and a total count, matching Wireframe 1.
- Usability at ≥100 tickets on one team's board: avoid unnecessary re-renders and keep the
  drag interaction responsive; virtualized rendering is an explicit optional stretch feature (spec
  §14) and is **not** required for Phase 7 — only revisited if real usage shows it is needed.
- Loading, empty (no team selected; team has no tickets; filters match nothing), success, and error
  states for the board and for a failed drag.
- Tests: Playwright `board-*`, `persistence-*`, and `filters-*` flows (including an automated
  drag-failure-rollback case using request interception — see Technical Approach), plus the
  applicable text test-case catalogue entries.
- Documentation updates (this document, README, architecture, HLS, testing-approach).

### Out of scope (later phases)

- Persisting a custom manual card order within a column (explicitly not required by spec §8).
- Server-side filtering/search (the spec allows either; Phase 7 chooses client-side — see below).
  Revisit only if a future phase needs to filter across more tickets than is practical to fetch
  client-side.
- Virtualized rendering for large boards (optional stretch, spec §14).
- Cross-tab/real-time board updates (out of mandatory scope, spec §12).
- Quality-gate/Definition-of-Done hardening and full access-control matrix (Phase 8); wireframe
  fidelity polish beyond what Phase 7 needs for its own screen (Phase 9 is the dedicated pass for
  the remaining screens).

## Technical Approach

### Data & API reuse — no backend changes expected

- The board is read-driven by the existing `GET /api/tickets?teamId=…` endpoint (Phase 5), which
  already returns tickets newest-modified-first with `teamName`, `epicTitle`, and
  `createdByEmail` joined in. Phase 7 fetches once per team selection and groups the result into
  the five fixed columns by `state` client-side — no new list endpoint or query parameter is
  required.
- State changes use the existing dedicated `PATCH /api/tickets/:id/state` endpoint (Phase 5),
  which already persists immediately and has no transition restrictions — exactly what spec §8
  requires ("cards may be moved directly between any two states").
- **No new migration, repository, service, or route is anticipated for Phase 7.** If implementation
  reveals a real need (e.g., a server-side search becomes necessary for performance), it should be
  scoped as a small, explicit addition rather than assumed up front.

### Decision: client-side filtering and search

The spec explicitly allows either client-side or server-side filtering/search (§8). Phase 7 chooses
**client-side**, for these reasons:
- The board already fetches the full, team-scoped ticket list to render the five columns; filters
  narrow that same in-memory list with no extra round-trip per keystroke.
- The usability target (≥100 tickets per team) is small enough to filter instantly in the browser
  without debouncing or pagination.
- It keeps Phase 7 free of new backend surface area, matching the "no backend changes expected"
  approach above.

If a team's ticket count grows well beyond the ≥100 target in practice, revisit this decision and
move search to the server (e.g., an optional `?search=` on `GET /api/tickets`) — call this out as a
risk below rather than building it speculatively now.

### Frontend

- **Team selector:** reuse the teams store; selecting a team re-fetches that team's tickets. No
  team selected → an explicit "choose a team" empty state (no columns rendered yet, or rendered
  empty — to be decided during implementation, consistent with Wireframe 1 always showing the five
  columns).
- **Columns:** five fixed `useDroppable` zones in workflow order, each labeled with its
  human-readable state name (existing `STATE_LABELS`) and a live count.
- **Cards:** `useDraggable` items showing type (existing `TYPE_LABELS`), title, epic title when
  set, and a relative last-modified hint (matching Wireframe 1's "2h ago" style); clicking a card
  (outside of a drag) opens `/tickets/:id`.
- **Drag-and-drop:** `DndContext` with `onDragEnd` computing the source/target column from the
  drag event; on drop, optimistically move the card in local board state, call
  `changeState(id, newState)` (the existing tickets-store action from Phase 5), and:
  - on success, leave the optimistic move in place (optionally reconciled with the server response
    already returned by `changeState`);
  - on failure, move the card back to its original column and show a dismissible, visible error
    (spec §8: "the card must return to its previous column and the UI must display an error").
- **Filters bar:** type select, epic select (scoped to the selected team's epics, reusing the
  epics store), a title search input, and a "Clear" button; all three combine with AND logic over
  the in-memory ticket list; reuses the same filter-control patterns already built on the
  `/tickets` list screen ([Tickets.tsx](../frontend/src/pages/Tickets.tsx)).
- **Create/open actions:** a "New ticket" button navigating to `/tickets/new` (with the current
  board team pre-selected); clicking a card navigates to `/tickets/:id`.
- A `board` store (Zustand) holding the selected team, the fetched tickets, the active filters, and
  derived per-column, filtered card lists; reuses the existing `tickets` store's `fetchTickets`,
  `changeState`, and type definitions rather than duplicating ticket-fetching logic.
- Loading, empty, success, and error states throughout (spec §11), styled with Tailwind utilities
  to match the Phase 4–6 screens, replacing the current plain CSS placeholder classes
  (`board`, `column`, `ticket` in `styles.css`).

### Performance at ≥100 tickets

- Render columns and cards from memoized, derived lists (filtered/grouped once per ticket-list or
  filter change, not per render).
- Avoid per-card subscriptions that cause whole-board re-renders on unrelated state changes.
- Defer virtualization (spec §14, optional) unless manual testing at 100+ tickets shows a real
  problem; if it does, scope it as a separate, explicit follow-up rather than building it
  speculatively now.

### Testing approach for drag-and-drop

- **Happy path:** simulate a drag (or, more reliably in Playwright, perform the drop via dnd-kit's
  pointer-event sequence) from one column to another; assert the card appears in the new column and
  that a page reload shows it still in that column (state persisted).
- **Failure/rollback:** use Playwright's request interception (`page.route`) to make the
  `PATCH /api/tickets/:id/state` call fail for one drag; assert the card returns to its original
  column and an error message is shown. This makes the otherwise-hard-to-trigger failure path
  deterministic and automatable rather than only a manual/text case.

### Reuse from earlier phases

- **Teams (Phase 3):** team list/selection for the board's team selector.
- **Epics (Phase 4):** epic list, scoped to the selected team, for the epic filter.
- **Tickets (Phase 5):** `GET /api/tickets?teamId=…` for the column data, `PATCH /api/tickets/:id/state`
  for drag persistence, the `tickets` Zustand store's existing actions and types, and the
  `/tickets/new` and `/tickets/:id` screens for the create/open actions.
- **Tailwind styling (Phases 4–6):** the established utility-first patterns and shared field/button
  classes used on the Teams/Epics/Tickets screens.

### Security & states

- The board sits behind `ProtectedRoute`/`requireAuth` like every other business screen; no new
  authorization rules are introduced.
- The server remains the system of record: a drag only "counts" once the API confirms it; the
  optimistic UI move is rolled back on failure rather than kept as local-only state.

---

## Backlog (JIRA-style Epics & Tasks)

Story points are rough relative estimates. IDs are local references (e.g. `P7-1`).

### EPIC P7-E1 — Board Layout & Data

> As an authenticated user, I can see a Kanban board for one team with my tickets correctly placed
> in their workflow columns.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P7-1 | Board store | A `board` Zustand store: selected team, fetched team tickets (via the existing `tickets` store), and derived per-column lists. | Selecting a team fetches and groups its tickets into the five fixed states. | 3 |
| P7-2 | Team selector | Replace the placeholder header nav with a real team selector on the board screen. | Switching teams reloads the board with that team's tickets only. | 2 |
| P7-3 | Five fixed columns | Render exactly five columns in workflow order with human-readable labels and a live per-column count. | Column order and labels match spec §8; counts match the filtered ticket list. | 2 |
| P7-4 | Card rendering | Cards show title, type, epic (when set), and a relative last-modified hint. | Matches Wireframe 1's card content; epic omitted cleanly when absent. | 2 |
| P7-5 | Column ordering | Cards within a column reflect the existing `modified_at DESC` API order. | No extra client-side sort needed; verified against the API response order. | 1 |
| P7-6 | Create/open actions | "New ticket" navigates to `/tickets/new` (team pre-selected); clicking a card navigates to `/tickets/:id`. | Both actions reachable from the board; a drag does not also trigger a navigation. | 2 |

### EPIC P7-E2 — Drag-And-Drop Persistence

> As a user, I can drag a ticket to another column and have the change persist, with a clear
> rollback if it fails.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P7-7 | Droppable columns & draggable cards | Wire `@dnd-kit/core`'s `useDroppable`/`useDraggable` (or `DndContext` + sensors) for the five columns and each card. | A card can be picked up and dropped on any column with visible drag feedback. | 3 |
| P7-8 | Drop persistence | On drop, optimistically move the card and call the existing `PATCH /api/tickets/:id/state`. | A successful drop changes state in the DB and the card stays in the new column after a refresh. | 3 |
| P7-9 | Failure rollback | On a failed state-change call, move the card back to its original column and show a visible error. | Simulated failure (e.g., intercepted request) shows the card back in its original column with an error message. | 2 |
| P7-10 | Any-to-any transitions | Confirm the board imposes no sequential-transition restriction. | A card can move from `new` directly to `done` (and any other pair) without a client-side block. | 1 |

### EPIC P7-E3 — Filtering & Search

> As a user, I can narrow the board down to the tickets I care about.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P7-11 | Type filter | Filter the board's cards by `bug`/`feature`/`fix`. | Selecting a type shows only matching cards across all columns. | 1 |
| P7-12 | Epic filter | Filter by epic, options scoped to the selected team. | Selecting an epic shows only its tickets; options update when the team changes. | 2 |
| P7-13 | Title search | Case-insensitive substring search over ticket title. | Matching is case-insensitive and substring-based; updates as the user types. | 2 |
| P7-14 | AND combination & clear | Combine active type/epic/search filters with AND logic; a "Clear" action resets all three. | Multiple simultaneous filters narrow correctly; "Clear" restores the full board. | 2 |
| P7-15 | Filters scoped client-side | Implement filtering over the already-fetched team ticket list (the documented decision above), not a new API call per filter change. | No additional network request fires per filter/search keystroke. | 1 |

### EPIC P7-E4 — Usability At Scale & UX States

> As a user, the board stays clear and responsive even with many tickets, and always tells me what
> is happening.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P7-16 | ≥100-ticket usability pass | Verify and, if needed, optimize rendering/derived-state memoization with ~100+ tickets on one team. | Board remains responsive (scroll, filter, drag) with 100+ tickets; no unnecessary whole-board re-renders. | 3 |
| P7-17 | UX states | Loading (fetching team tickets), empty (no team selected; team has no tickets; filters match none), success, and error states. | Each state is visibly distinct and matches spec §11. | 2 |
| P7-18 | Wireframe alignment | Align the filters bar, counts, and card content with Wireframe 1 (not pixel-exact, but matching the information hierarchy). | Reviewer can map each Wireframe 1 element to a board element. | 2 |

### EPIC P7-E5 — Testing

> As a maintainer, I need automated proof the board, drag persistence, and filters work correctly.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P7-19 | Playwright `board-flow` | Create tickets in different states for a team (via the existing ticket screens/API) and confirm each lands in its correct column with correct content. | E2E passes in the `test` compose profile. | 3 |
| P7-20 | Playwright `persistence-flow` | Drag a card to another column, reload the page, and confirm it remains in the new column. | State change and refresh both verified in one flow. | 2 |
| P7-21 | Playwright drag-failure rollback | Intercept the state-change request to force a failure during a drag; assert rollback + error message. | Deterministic, automated reproduction of the failure path (see Technical Approach). | 3 |
| P7-22 | Playwright `filters-flow` | Exercise type, epic, and search filters individually and combined, plus "Clear". | All filter combinations and the clear action behave per spec. | 3 |

### EPIC P7-E6 — Documentation

> As a reader, I need docs that reflect the real Kanban board.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P7-23 | README & architecture | Document the board's behavior (drag-and-drop, filters, search) and move it from "Not Yet Implemented" to "Implemented". | README and architecture reflect Phase 7. | 1 |
| P7-24 | HLS status update | Mark Phase 7 complete in the HLS. | HLS shows Phase 7 as done with a link to this document. | 1 |

## Phase 7 Definition of Done

- [ ] The board shows exactly five columns, in workflow order, for the selected team.
- [ ] A team selector switches the board to show only that team's tickets.
- [ ] Each card shows at least title and type; epic is shown when set.
- [ ] Dragging a card to another column changes its state and persists the change through the
      existing ticket API.
- [ ] A failed drag-and-drop update returns the card to its previous column and shows a visible
      error.
- [ ] Cards can move directly between any two states; no sequential-transition restriction exists.
- [ ] Within a column, cards are ordered by most-recently-modified first.
- [ ] The board provides a clear way to create a new ticket and to open an existing one.
- [ ] Filtering by type and by epic, plus a case-insensitive title substring search, are all
      available and combine using AND logic; a "Clear" action resets them.
- [ ] The board remains usable with at least 100 tickets on one team.
- [ ] The board shows loading, empty, success, and error states.
- [ ] A state change made by dragging survives a page refresh.
- [ ] Playwright `board-flow`, `persistence-flow`, a drag-failure-rollback case, and `filters-flow`
      all pass.
- [ ] README, architecture, and HLS docs reflect the real Kanban board.

## How To Test Locally

Once implemented, with the stack running (`docker compose up --build`, or the Podman equivalent)
and a verified, logged-in account that has a team with several tickets spread across different
states (and at least one epic):

### Manual (browser)

1. Open the board; select the team. All of that team's tickets appear, grouped into the correct
   columns.
2. Drag a card from one column to a non-adjacent column (e.g., `new` → `done`); it lands there
   immediately.
3. Refresh the page; the card is still in the column you dropped it in.
4. Use the type filter, the epic filter, and the title search individually, then together; the
   board narrows to tickets matching all active filters. Click "Clear" to restore the full board.
5. Click "New ticket" from the board; it opens the create screen with the current team
   pre-selected. Create a ticket and return to the board — it appears in the `new` column.
6. Click an existing card; it opens that ticket's details screen.
7. (Optional, to exercise the failure path manually) Disconnect the network briefly during a drag,
   or stop the backend container, and confirm the card returns to its original column with an
   error shown.

### Automated

- **End-to-end:** `podman-compose -f infra/podman/podman-compose.yml --profile test up --build --abort-on-container-exit e2e`
  runs the `board-flow`, `persistence-flow`, drag-failure-rollback, and `filters-flow` Playwright
  cases described above.
- No new backend integration tests are anticipated (Phase 7 reuses the existing Phase 5 ticket
  endpoints); if a server-side search or any other backend change is added during implementation,
  it must get its own backend integration tests at that time.

### Text test scenarios

The catalogue of text-format test cases for the board and for filtering/search lives in
[testing-approach.md](testing-approach.md) under **Kanban Board** and **Filtering And Search**.
They cover the five fixed columns, the team selector, card content, create/open actions, drag
persistence and rollback, direct any-to-any moves, most-recently-modified ordering, the type/epic/
search filters and their AND combination, the clear action, and the board's loading/empty/error
states.

## Dependencies & Risks

- **Builds on Phases 3–5:** the board has no value without teams, and reuses the Phase 4 epics list
  and the Phase 5 ticket list/state endpoints and screens; no new backend resource is anticipated.
- **dnd-kit is already a frontend dependency** (`@dnd-kit/core`) but is only wired to an empty
  `DndContext` today (see [Board.tsx](../frontend/src/pages/Board.tsx)) — Phase 7 is the first
  phase that implements real drag-and-drop behavior with it.
- **Client-side filtering decision:** documented above; revisit only if real ticket volumes
  outgrow what is practical to filter in the browser, and treat moving to server-side search as a
  small, explicit, separately-tested change rather than scope creep into this phase.
- **Drag-failure testing is inherently awkward** to trigger reliably; the plan calls for Playwright
  request interception (`page.route`) specifically so the rollback path has real automated
  coverage instead of being only a manual/text case.
- **Performance at ≥100 tickets** is a stated requirement, not just a stretch goal — virtualization
  remains optional (spec §14) and should only be pursued if the simpler memoization approach proves
  insufficient.
