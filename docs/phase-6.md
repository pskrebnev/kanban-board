# Phase 6 — Comments

This document is the implementation plan and backlog for **Phase 6** of the Kanban Ticketing
System, as defined in [kanban-ticketing-hls.md](kanban-ticketing-hls.md). It is grounded in the
authoritative spec [KanbanBoard.pdf](KanbanBoard.pdf) (chapters §7, §9, §11).

Phase 6 adds **comments** on tickets: a chronological, append-only discussion thread. A comment
belongs to exactly one ticket, records its author (from the authenticated session) and the moment
it was created, and is **immutable** in mandatory scope (no edit, no delete of an individual
comment). It builds on the Phase 1 persistence foundation (the `comments` table already exists from
migration `0003`), the Phase 2 authentication layer (all comment endpoints sit behind `requireAuth`
and `author_id` comes from the session), and the Phase 5 tickets resource (comments hang off a
ticket and are removed with it via `ON DELETE CASCADE`).

> **Status: complete.** The comments repository, service, nested `/api/tickets/:ticketId/comments`
> endpoints (behind `requireAuth`), the ticket-details comments section, backend integration tests,
> and a Playwright `comments-flow` are all implemented. The drag-and-drop board, filtering, and
> search (Phase 7) remain out of scope here.

## Goal

Allow an authenticated user to add comments to a ticket and read the ticket's comments
oldest-first, through the API and the ticket details screen, with full server-side validation. The
comment body is trimmed and non-empty; the author is taken from the authenticated session and never
trusted from the body; `created_at` is set by the server. **Adding a comment must not change the
ticket's `modified_at`** (comments are independent of ticket edits). Comments are immutable in
mandatory scope and are deleted only when their ticket is deleted (the existing cascade).

## Spec Alignment

- **§7 Comments** — a ticket has a list of comments; each comment has an author, a body, and a
  creation timestamp; comments are shown in chronological (oldest-first) order; comments are
  immutable in the mandatory scope; adding a comment does **not** modify the ticket itself.
- **§9 API & Persistence Expectations** — all changes go through the API and persist in
  PostgreSQL; the author and timestamp are set server-side; meaningful HTTP status codes
  (`201` created, `400` validation, `401` unauthenticated, `404` missing ticket).
- **§11 Non-Functional Requirements** — protected endpoints, validated input, and
  loading/empty/success/error states in the comments UI.

## Scope

### In scope

- Comment repository over the existing `comments` table (no schema change required).
- Endpoints behind `requireAuth`, nested under a ticket:
  - `GET /api/tickets/:ticketId/comments` — list a ticket's comments, oldest-first, each enriched
    with the author's email.
  - `POST /api/tickets/:ticketId/comments` — add a comment (`body`); `author_id` from the session;
    `201` with the created comment.
- `zod` validation: trimmed, non-empty `body` (max length); `:ticketId` is a `z.uuid()`; the ticket
  must exist (`404` otherwise).
- **`author_id` from the session** (never trusted from the request body).
- **Ticket-immutability invariant:** inserting a comment touches only the `comments` table, so the
  parent ticket's `modified_at` is left unchanged; tests assert this explicitly.
- **Comment immutability:** no edit or per-comment delete endpoints in mandatory scope.
- Comments are removed automatically when their ticket is deleted (the `comments.ticket_id` FK is
  `ON DELETE CASCADE`, exercised in Phase 5) — no manual handling needed.
- Frontend: a **comments section inside the ticket details screen** (`/tickets/:id`) — a
  chronological list (author email + timestamp + body) and an add-comment form, with
  loading/empty/success/error states, built with Tailwind utilities to match the Phase 5 screens.
- A `comments` store (Zustand) calling the API for list and add, refetching on success.
- Tests: backend integration (add, empty-body `400`, oldest-first order, ticket `modified_at`
  unchanged, unknown ticket `404`, cascade delete with the ticket, `401`) and a Playwright
  `comments-flow`.
- Documentation updates.

### Out of scope (later phases)

- Editing or deleting individual comments, reactions, mentions, threading/replies, and rich text
  or attachments (not in mandatory scope).
- The Kanban board, drag-and-drop, column ordering, and filtering/search UI (Phase 7).
- Notifications/emails on new comments.

## Technical Approach

### Data model & repository

- Reuse the existing `comments` table (`id`, `ticket_id NOT NULL REFERENCES tickets ON DELETE
  CASCADE`, `author_id NOT NULL REFERENCES users ON DELETE RESTRICT`, `body text NOT NULL`,
  `created_at timestamptz NOT NULL DEFAULT now()`) and its index on `ticket_id` (migration `0003`).
  There is intentionally **no `modified_at`** — comments are immutable. No new migration is needed.
- Add `src/repositories/comment-repository.ts` with `listCommentsByTicket(pool, ticketId)` (joined
  to the author's email; ordered by `created_at ASC, id ASC` for a stable oldest-first order) and
  `createComment(pool, { ticketId, authorId, body })` (returns the created id; the read row is then
  fetched enriched).
- The repository returns enriched read rows (`authorEmail`) so the comments list renders without
  N+1 calls.

### Endpoints (all behind `requireAuth`)

- `GET /api/tickets/:ticketId/comments` — verify the ticket exists (`404` otherwise); return its
  comments oldest-first, each including `authorEmail` and `createdAt`.
- `POST /api/tickets/:ticketId/comments` — verify the ticket exists; validate the body; insert with
  `author_id` from the session and a server `created_at`; `201` with the created comment.
- Mount the comment routes under the existing tickets router (or a dedicated
  `createCommentsRouter(...)` mounted at `/api/tickets/:ticketId/comments`), guarded by
  `requireAuth`, so anonymous access returns `401`.

### Validation, references & invariants

- `zod` schemas: `body` is `z.string().trim().min(1).max(20000)`; `:ticketId` is a `z.uuid()`.
  Failures map to `ValidationError` (`400`) through the existing error handler; a malformed id is
  `400`.
- The service verifies the ticket exists (reusing the Phase 5 ticket repository's `findTicketById`)
  and returns `404` (`NotFoundError`) when it does not — for both listing and adding.
- `author_id` is always read from `request.user` (set by `requireAuth`), never from the body.
- **Ticket-immutability invariant:** the add path inserts only into `comments`; it never updates
  `tickets`, so `tickets.modified_at` is unaffected. This is verified by a test that records the
  ticket's `modified_at`, adds a comment, and asserts it is unchanged.
- **Comment immutability:** there are no update/delete endpoints for an individual comment in
  mandatory scope; the only removal path is the ticket cascade.

### Reuse from earlier phases

- **Auth:** `requireAuth` + the session user for `author_id`.
- **Tickets:** `findTicketById` to validate the parent ticket and to drive the comments section on
  the details screen.
- **Errors:** the shared `ValidationError`/`NotFoundError` → HTTP mapping from the central error
  handler.

### Frontend

- Extend the existing **ticket details screen** (`/tickets/:id`) with a comments section beneath
  the ticket fields:
  - A chronological (oldest-first) list; each item shows the author email, a formatted timestamp,
    and the body.
  - An add-comment form (textarea + submit); on success the new comment appears and the form
    clears.
  - Loading, empty ("No comments yet"), success, and error states (spec §11); surface `400`/`404`
    messages inline.
- A `comments` store (Zustand) calling the API for `fetchComments(ticketId)` and
  `addComment(ticketId, body)`, refetching the list after a successful add; the server is the
  system of record (no local-only comments).
- Comments are read-only in the UI (no edit/delete affordances), matching the immutability rule.

### Security & states

- All endpoints require an authenticated, verified session (Phase 2 cookie).
- `author_id` is derived from the session; the body cannot spoof authorship.
- Server is the system of record; the UI never persists comments locally.

---

## Backlog (JIRA-style Epics & Tasks)

Story points are rough relative estimates. IDs are local references (e.g. `P6-1`).

### EPIC P6-E1 — Comments API

> As an authenticated user, I can read and add comments on a ticket so that work can be discussed
> in context.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P6-1 | Comment repository | `comment-repository.ts` with `listCommentsByTicket` (joined to author email, ordered `created_at ASC, id ASC`) and `createComment`. | Functions typed and parameterized; read rows include `authorEmail`; ordering is stable oldest-first. | 2 |
| P6-2 | List endpoint | `GET /api/tickets/:ticketId/comments` returns the ticket's comments oldest-first. | Existing ticket → `200` with enriched rows; unknown ticket → `404`; behind `requireAuth`. | 2 |
| P6-3 | Add endpoint | `POST /api/tickets/:ticketId/comments` with `author_id` from the session and server `created_at`. | Valid add → `201` with the comment; `author_id` matches the caller, never the body; unknown ticket → `404`. | 3 |
| P6-4 | Router wiring | Mount the comment routes under `/api/tickets/:ticketId/comments` behind `requireAuth` in `app.ts`. | Anonymous → `401`; authenticated requests routed correctly. | 1 |

### EPIC P6-E2 — Validation & Invariants

> As the system, I enforce the body rule, authorship, ticket references, and the immutability
> invariants so that comment data stays consistent and tickets are unaffected.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P6-5 | Body validation | `zod`: trimmed, non-empty `body` (max length). | Empty/whitespace/oversize body → `400` with a clear message; surrounding whitespace stored trimmed. | 2 |
| P6-6 | Ticket existence | Verify `:ticketId` references an existing ticket for both list and add. | Unknown ticket → `404`; non-UUID id → `400`. | 1 |
| P6-7 | author_id from session | Derive `author_id` from `request.user`. | Authorship always equals the caller; a body-supplied `authorId` is ignored. | 1 |
| P6-8 | Ticket-modified invariant | Adding a comment must not touch the ticket's `modified_at`. | After adding a comment, the parent ticket's `modified_at` is unchanged. | 2 |
| P6-9 | Chronological order | List returns comments oldest-first with a stable tiebreak. | Comments returned in `created_at ASC` (then `id`) order. | 1 |
| P6-10 | Immutability (no edit/delete) | No update/per-comment delete endpoints in mandatory scope. | Only removal path is the ticket cascade; no comment edit/delete routes exist. | 1 |

### EPIC P6-E3 — Frontend Comments

> As a user, I can read and add comments within a ticket's details.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P6-11 | Comments store & API client | Zustand store + Axios calls for `fetchComments(ticketId)` and `addComment(ticketId, body)`. | Store reflects server state; refetches after a successful add. | 2 |
| P6-12 | Comments section in details | Extend `/tickets/:id` with a chronological list (author email + timestamp + body) and an add-comment form. | Comments render oldest-first; adding shows the new comment and clears the form; comments are read-only. | 3 |
| P6-13 | UX states (Tailwind) | Loading/empty/success/error for the comments section; surface `400`/`404`; built with Tailwind utilities. | Each state visible where applicable (spec §11). | 2 |

### EPIC P6-E4 — Testing

> As a maintainer, I need automated proof of the comment flows.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P6-14 | Backend integration tests | Add happy path (`201`, author from session); empty/whitespace/oversize body (`400`); oldest-first order; **ticket `modified_at` unchanged after add**; unknown ticket (`404`); non-UUID id (`400`); cascade delete with the ticket; anonymous (`401`). | All cases assert status codes and DB side effects against a real Postgres. | 3 |
| P6-15 | Playwright `comments-flow` | Create a team + ticket, open details, add two comments, see them oldest-first with author + timestamp, and confirm they survive a refresh. | E2E passes in the `test` compose profile. | 3 |

### EPIC P6-E5 — Documentation

> As a reader, I need docs that reflect comment management.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P6-16 | README & architecture | Document the comment endpoints, the details-screen section, and update functionality status. | README and architecture reflect Phase 6. | 1 |
| P6-17 | HLS status update | Mark Phase 6 complete in the HLS. | HLS shows Phase 6 as done with a link here. | 1 |

## Phase 6 Definition of Done

- [x] An authenticated user can add a comment to a ticket and read its comments oldest-first,
      through the UI, persisted in PostgreSQL.
- [x] The comment `body` is trimmed and non-empty (max length enforced); violations return `400`
      with clear messages.
- [x] `author_id` is always taken from the authenticated session and cannot be spoofed by the
      request body; `created_at` is set by the server.
- [x] Adding a comment does **not** change the parent ticket's `modified_at`.
- [x] Comments are immutable in mandatory scope (no edit or per-comment delete endpoints).
- [x] Listing or commenting on a non-existent ticket returns `404`; a non-UUID id returns `400`.
- [x] Deleting a ticket deletes its comments (cascade — verified again here).
- [x] All comment endpoints require an authenticated, verified session; anonymous access → `401`.
- [x] The comments section shows loading, empty, success, and error states.
- [x] Backend integration tests pass; a Playwright `comments-flow` is included.
- [x] README, architecture, and HLS docs reflect comment management.

## How To Test Locally

With the stack running (`docker compose up --build`, or the Podman equivalent) and a verified,
logged-in account that already has a team and at least one ticket:

### Manual (browser)

1. Open a ticket's details; note its **Last modified** timestamp.
2. In the comments section, add a comment; it appears in the list with your email and a timestamp,
   and the form clears.
3. Add a second comment; it appears **below** the first (oldest-first order).
4. Confirm the ticket's **Last modified** timestamp is **unchanged** after commenting.
5. Refresh the page; the comments persist in the same order.
6. Try submitting an empty/whitespace-only comment; it is rejected with a validation message.
7. (Cascade) Delete the ticket; its comments are removed with it.

### Automated

- **Backend:** from `backend/`, run `npm test` with `TEST_DATABASE_URL`/`DATABASE_URL` pointing
  at a migrated database.
- **End-to-end:** `podman-compose -f infra/podman/podman-compose.yml --profile test up --build --abort-on-container-exit e2e`.

### Text test scenarios

The catalogue of text-format test cases for comments lives in
[testing-approach.md](testing-approach.md) under **Comments**. They cover adding/displaying,
body validation, chronological order, the ticket-`modified_at` invariant, `author_id` provenance,
immutability, unknown-ticket `404`, the cascade delete, and authentication.

## Dependencies & Risks

- **Builds on Phases 2 & 5:** comment endpoints rely on `requireAuth` and on tickets existing; the
  e2e flow must sign up, verify (via Mailpit), log in, create a team, and create a ticket before
  exercising comments.
- **Ticket-modified invariant** is the subtlest rule: the add path must never write to `tickets`,
  and a test must assert the parent ticket's `modified_at` is unchanged after a comment — this is
  the comments analogue of the Phase 5 modified-timestamp rule.
- **Immutability:** keeping comments append-only (no edit/delete) is a deliberate mandatory-scope
  decision; revisit only if the spec's optional scope is pursued.
- **Cascade reuse (Phase 5):** the delete-with-ticket behavior depends on the existing
  `comments.ticket_id ON DELETE CASCADE`; Phase 6 adds real comment rows that exercise it through
  the UI/API rather than direct inserts.
