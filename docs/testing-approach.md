# Testing Approach

This document groups end-to-end scenario candidates from `docs/KanbanBoard.pdf`. The scenarios are intended for Playwright and should be implemented progressively as the application moves beyond the current scaffold.

## Current Phase

<<<<<<< HEAD
Phases 0–7 are complete (foundation, persistence/migrations, authentication with password
recovery, team management, epic management, ticket management, comments, and the Kanban board with
filtering & search). Phase 8 (quality gates & Definition-of-Done hardening) is the next phase.
Scenario sections below are marked **[implemented]** when covered by automated tests today, or
**[planned]** when they document the target behavior for an upcoming phase.
=======
Phases 0–6 are complete (foundation, persistence/migrations, authentication with password
recovery, team management, epic management, ticket management, and comments). Phase 7 (the Kanban
board, filtering & search) is the next phase. Scenario sections below are marked **[implemented]**
when covered by automated tests today, or **[planned]** when they document the target behavior for
an upcoming phase.
>>>>>>> 38c086d85be695e4709f7537890cbca79299944a

Current automated coverage:

- Backend `vitest`/`supertest` suite (`backend/test/`): auth unit tests (password hashing, token
  hashing, JWT), auth integration tests (signup → verify → login, duplicates, weak password,
  single-use/expired tokens, resend invalidation, full password-reset flow), teams integration
  tests (CRUD, trim, validation, case-insensitive conflict, referenced-delete guard, 401), epics
  integration tests (CRUD, trim/validation, optional description, unknown-team rejection,
  team-immutability, `teamId` filter, referenced-delete guard, 404/401), tickets integration
  tests (CRUD, required-field/enum validation, unknown-team and cross-team-epic rejection,
  `created_by` provenance, modified-timestamp semantics, immediate state change, team-change epic
  consistency, comment cascade on delete, filters, 404/401), comments integration tests (add with
  author/timestamp from the server, body trim/empty/oversize validation, oldest-first order, the
  ticket-`modified_at` invariant, `author_id` provenance, unknown-ticket 404 / non-UUID 400,
  cascade delete, 401), and a migration smoke test asserting a fresh database has schema + metadata
  only.
- Playwright containers under `tests/e2e/`: a smoke test (frontend shell loads), an auth-flow
  test (sign up, read the verification email from Mailpit, verify, log in, reach the board), a
  teams-flow test (create, rename, and delete a team through the UI), an epics-flow test
  (create a team, then create, edit, and delete an epic for it through the UI), a tickets-flow
  test (create a team + epic, then create a ticket, change its state, edit it, and delete it
<<<<<<< HEAD
  through the UI), a comments-flow test (create a team + ticket, add two comments, confirm
  oldest-first order with author + timestamp, that the ticket's modified time is unchanged, and
  that they survive a refresh), and a board-flow test (create a team + tickets, drag a card to a
  new column and confirm it persists across a refresh, force a state-change failure and confirm
  the card rolls back with an error, and exercise the type/search filters and Clear).
=======
  through the UI), and a comments-flow test (create a team + ticket, add two comments, confirm
  oldest-first order with author + timestamp, that the ticket's modified time is unchanged, and
  that they survive a refresh).
>>>>>>> 38c086d85be695e4709f7537890cbca79299944a

Target coverage:

- Add e2e coverage for core user workflows as teams, epics, tickets, comments, and persisted
  board operations are implemented (each phase contributes its scenario group below).
- Keep browser tests runnable through Podman using the `e2e` compose profile.

## How To Read These Cases

Each bullet is a text test case: an `id` followed by the behavior to verify (preconditions,
action, and expected result). They are deliberately tool-agnostic — most become Playwright e2e
tests, some become backend integration tests — and are written so QA can also execute them
manually.

## Running Headless Tests

Create a local `.env` file from `.env.example` before running tests. The test target URL is read from `E2E_APP_URL`.

Run the Playwright smoke test from the repository root:

```shell
podman-compose -f infra/podman/podman-compose.yml --profile test up --build --abort-on-container-exit e2e
```

This command starts the required application services and runs the `e2e` container. Playwright launches Chromium headlessly inside the Podman container.

Clean up the test stack:

```shell
podman-compose -f infra/podman/podman-compose.yml --profile test down
```

## Authentication [implemented]

- `auth-signup-verification-login`: user signs up, receives the verification email (Mailpit), verifies, then logs in successfully.
- `auth-signup-duplicate-email`: signing up with an existing email (any case) returns a `409` conflict.
- `auth-signup-weak-password`: a password shorter than 8 characters is rejected with `400`.
- `auth-signup-invalid-email`: a malformed email is rejected with `400`; any well-formed domain (e.g. `name@mailpit.pit`) is accepted.
- `auth-unverified-user-blocked`: a registered but unverified user cannot log in (`403`) or reach protected screens.
- `auth-resend-verification`: an unverified user requests a new verification email; the previous token is invalidated and only the newest verifies.
- `auth-token-single-use`: a verification token works once; reusing it returns `400`.
- `auth-token-expired`: an expired verification token shows a clear result and allows resend.
- `auth-email-normalization`: emails are trimmed and compared case-insensitively at signup, login, and resend.
- `auth-login-bad-credentials`: wrong password or unknown email returns a generic `401` (no account enumeration).
- `auth-session-me`: an authenticated request to `/api/auth/me` returns the current user; an anonymous request returns `401`.
- `auth-logout`: an authenticated user logs out, the session cookie is cleared, and protected screens become inaccessible.

## Password Recovery [implemented]

- `recovery-request-generic-response`: requesting a reset always returns the same generic message, whether or not the email exists (no account enumeration).
- `recovery-email-sent`: for a known account, a "Reset your password" email is delivered (captured in Mailpit) containing a single-use link.
- `recovery-reset-and-login`: opening the reset link and submitting a new password updates the credentials; the user can log in with the new password and the old one is refused (`401`).
- `recovery-token-single-use`: a reset token works once; reusing it returns `400`.
- `recovery-token-expired`: a reset token older than one hour is rejected with `400`.
- `recovery-weak-password-rejected`: a new password shorter than 8 characters is rejected with `400`.
- `recovery-verifies-email`: resetting the password for an unverified account also marks the email verified, allowing immediate login.

## Team Management [implemented]

- `teams-create-rename-delete`: verified user creates, renames, and deletes an empty team; changes persist across refresh. (Playwright `teams-flow`.)
- `teams-name-trimmed`: a name with surrounding whitespace is stored trimmed.
- `teams-name-required`: an empty or whitespace-only team name is rejected with `400`.
- `teams-name-max-length`: a name longer than 100 characters is rejected with `400`.
- `teams-name-unique-case-insensitive`: creating or renaming to an existing name (any case) returns `409`.
- `teams-list-ordered`: `GET /api/teams` returns teams ordered by name.
- `teams-list-shows-reference-state`: `GET /api/teams` reports whether each team is referenced so the UI can disable delete.
- `teams-delete-blocked-with-epics`: a team with epics cannot be deleted and returns a clear `409` ("Team has epics or tickets and cannot be deleted"); no cascade occurs.
- `teams-delete-blocked-with-tickets`: a team with tickets cannot be deleted and returns the same `409` message. (Exercised once tickets exist; the guard checks both epics and tickets.)
- `teams-delete-unreferenced-succeeds`: an unreferenced team is deleted with `204`.
- `teams-id-format-validated`: a non-UUID `:id` is rejected with `400`.
- `teams-rename-missing-404`: renaming or deleting a non-existent team id returns `404`.
- `teams-require-auth`: all team endpoints reject anonymous requests with `401`.

## Epic Management [implemented]

- `epics-crud`: a verified user creates, lists, edits, and deletes an epic for a team; changes persist across refresh.
- `epics-title-required`: a blank or whitespace-only epic title is rejected with `400`.
- `epics-title-trimmed`: a title with surrounding whitespace is stored trimmed.
- `epics-title-max-length`: a title longer than the allowed maximum is rejected with `400`.
- `epics-description-optional`: an epic can be created and edited with no description (null) and with a description.
- `epics-create-requires-team`: creating an epic without a `teamId` is rejected with `400`.
- `epics-create-unknown-team`: creating an epic for a non-existent team is rejected with `400`/`404` and a clear message.
- `epics-team-immutable`: editing an epic cannot change its team; a `PATCH` carrying a different `teamId` returns `400` ("team is immutable").
- `epics-list-filter-by-team`: `GET /api/epics?teamId=…` returns only that team's epics; omitting the filter returns all.
- `epics-list-shows-team-and-reference-state`: each listed epic includes its `teamName` and a `referenced` flag so the UI can label it and disable delete.
- `epics-delete-unreferenced-succeeds`: an epic with no tickets is deleted with `204`.
- `epics-delete-blocked-when-referenced`: an epic referenced by tickets cannot be deleted and returns a clear `409`; no cascade occurs.
- `epics-id-format-validated`: a non-UUID `:id` is rejected with `400`.
- `epics-missing-404`: editing or deleting a non-existent epic id returns `404`.
- `epics-require-auth`: all epic endpoints reject anonymous requests with `401`.
- `epics-belongs-to-team-validator`: the reusable cross-team validator (for Phase 5 tickets) accepts an epic from the same team and rejects one from a different team.

## Ticket Management [implemented]

- `tickets-create-view-edit-delete`: a verified user creates a ticket (team + type + title + body), views all fields on the details screen, edits it, and deletes it with confirmation; changes persist across refresh.
- `tickets-title-required`: a blank or whitespace-only ticket title is rejected with `400`.
- `tickets-title-trimmed`: a title with surrounding whitespace is stored trimmed.
- `tickets-title-max-length`: a title longer than the allowed maximum is rejected with `400`.
- `tickets-body-required`: a blank or whitespace-only body is rejected with `400`.
- `tickets-team-required`: creating a ticket without a `teamId` is rejected with `400`.
- `tickets-create-unknown-team`: creating a ticket for a non-existent team is rejected with `400`/`404` and a clear message.
- `tickets-invalid-type-rejected`: a `type` outside {bug, feature, fix} is rejected with `400`.
- `tickets-invalid-state-rejected`: a `state` outside the five workflow states is rejected with `400`.
- `tickets-default-state-new`: a ticket created without an explicit state defaults to `new`.
- `tickets-epic-optional`: a ticket can be created and edited with no epic (null) and with a same-team epic.
- `tickets-cross-team-epic-rejected`: an `epicId` belonging to another team (or unknown) is rejected with `400` (reusing the Phase 4 cross-team validator).
- `tickets-created-by-from-session`: `created_by` always equals the authenticated caller; a `createdBy` supplied in the request body is ignored.
- `tickets-created-by-and-timestamps-displayed`: the details screen shows `created_by` (author email), `created_at`, and `modified_at`.
- `tickets-edit-updates-modified`: a real field/state change advances `modified_at`.
- `tickets-unchanged-save-does-not-update-modified`: saving identical values leaves `modified_at` unchanged (no-op save).
- `tickets-state-change-persists-immediately`: a state transition persists immediately and survives a refresh; `modified_at` advances.
- `tickets-team-change-clears-invalid-epic`: changing the ticket's team to one the current epic does not belong to clears/replaces the epic in the UI and is rejected by the API if forced (`400`).
- `tickets-list-filter`: `GET /api/tickets` supports optional `teamId`, `state`, `type`, and `epicId` filters combined with AND logic; results are ordered most-recently-modified first.
- `tickets-detail-missing-404`: fetching, editing, state-changing, or deleting a non-existent ticket id returns `404`.
- `tickets-id-format-validated`: a non-UUID `:id` is rejected with `400`.
- `tickets-delete-cascades-comments`: deleting a ticket removes its comments (cascade); deleting succeeds with `204`.
- `tickets-require-auth`: all ticket endpoints reject anonymous requests with `401`.

## Comments [implemented]

- `comments-add-and-display`: a verified user adds a comment to a ticket and sees it in the list with the author email, body, and a timestamp; the add form clears on success.
- `comments-add-returns-created`: `POST /api/tickets/:ticketId/comments` returns `201` with the created comment (id, body, author email, `createdAt`).
- `comments-body-required`: a blank or whitespace-only comment body is rejected with `400` and a clear message.
- `comments-body-trimmed`: a body with surrounding whitespace is stored trimmed.
- `comments-body-max-length`: a body longer than the allowed maximum is rejected with `400`.
- `comments-chronological-order`: `GET /api/tickets/:ticketId/comments` returns comments oldest-first with a stable tiebreak (`created_at ASC`, then `id`); the UI renders them in that order.
- `comments-author-from-session`: `author_id` always equals the authenticated caller; an `authorId` supplied in the request body is ignored.
- `comments-created-at-server-set`: `created_at` is assigned by the server, not the client.
- `comments-do-not-update-ticket-modified`: adding a comment does not change the parent ticket's `modified_at` (recorded before vs after the add).
- `comments-immutable`: there are no edit or per-comment delete endpoints in mandatory scope; comments cannot be modified once created.
- `comments-unknown-ticket-404`: listing or adding a comment for a non-existent ticket id returns `404`.
- `comments-ticket-id-format-validated`: a non-UUID `:ticketId` is rejected with `400`.
- `comments-deleted-with-ticket`: deleting a ticket removes its comments (cascade); the comment rows are gone afterward.
- `comments-require-auth`: all comment endpoints reject anonymous requests with `401`.
- `comments-empty-state`: a ticket with no comments shows an explicit "No comments yet" empty state.

<<<<<<< HEAD
## Kanban Board [implemented]
=======
## Kanban Board [planned — Phase 7]
>>>>>>> 38c086d85be695e4709f7537890cbca79299944a

See [phase-7.md](phase-7.md) for the detailed plan, JIRA-style backlog, and Definition of Done.

- `board-five-workflow-columns`: board shows exactly five columns in required order.
- `board-team-selector`: selecting a team shows only that team's tickets.
- `board-no-team-selected-state`: with no team selected, the board shows an explicit prompt rather than an empty or broken layout.
- `board-team-empty-state`: a team with no tickets shows the five columns with an explicit "no tickets" indication rather than blank space.
- `board-loading-state`: the board shows a loading indicator while a team's tickets are being fetched.
- `board-card-content`: ticket cards show at least title and type, optionally epic.
- `board-column-counts`: each column shows a live count of the cards currently in it, and a total ticket count is visible.
- `board-open-ticket-from-card`: user opens ticket details from a board card.
- `board-create-ticket-entry`: board provides a clear create-ticket action that pre-selects the board's current team.
- `board-drag-persists-state`: dragging a card to another column updates the backend and survives refresh.
- `board-drag-failure-rolls-back`: failed drag update returns the card to its previous column and shows a visible, dismissible error naming the failed action.
- `board-direct-state-move`: card can move directly between any two states (e.g. `new` straight to `done`) with no enforced sequence.
- `board-order-by-modified-desc`: cards in a column are ordered by most recently modified first, matching the existing ticket list API order.
- `board-click-vs-drag`: clicking a card without dragging it opens ticket details rather than starting/ending a drag.
- `board-usable-at-100-tickets`: with at least 100 tickets on one team, the board remains responsive for scrolling, filtering, and dragging.

<<<<<<< HEAD
## Filtering And Search [implemented]
=======
## Filtering And Search [planned — Phase 7]
>>>>>>> 38c086d85be695e4709f7537890cbca79299944a

See [phase-7.md](phase-7.md) for the detailed plan, JIRA-style backlog, and Definition of Done.

- `filters-by-type`: board filters tickets by `bug`, `feature`, or `fix`.
- `filters-by-epic`: board filters tickets by selected epic, with epic options scoped to the currently selected team.
- `filters-title-search`: case-insensitive substring search filters ticket titles (e.g. searching "pay" matches a title containing "Payment").
- `filters-and-logic`: type, epic, and search filters combine using AND logic.
- `filters-no-match-state`: a filter combination matching no ticket shows the board's empty/no-results state instead of an error.
- `filters-update-on-team-change`: switching the team while filters are active re-scopes the epic filter to the new team's epics.
- `filters-clear`: user can clear filters and restore the full board.
- `filters-client-side-no-extra-requests`: applying or changing a filter does not issue a new `GET /api/tickets` request — filtering happens over the already-fetched team ticket list.

## Seed / Test Data [implemented]

- `seed-loads-on-start`: with the seed compose file, the backend loads the fixed dataset on startup (2 users, 2 teams, 2 epics, 5 tickets, 2 comments) and the demo account can log in.
- `seed-idempotent-reload`: restarting the stack reloads the same fixed dataset (truncate + insert), producing identical row counts each time.
- `seed-flushed-on-stop`: stopping the seeded stack flushes all data (tmpfs database); on the next start, migrations re-apply from scratch before reseeding.
- `seed-absent-in-default-run`: the default `up` (without the seed compose file) leaves the database schema-only — no seed/application data — satisfying the Definition of Done.
- `seed-default-dataset-file`: with no override, the seed imports the bundled `backend/seed/data.json`, and the startup log reports the file path and imported counts.
- `seed-custom-file-import`: setting `SEED_FILE_HOST` (compose) or `SEED_FILE` (manual run) imports the referenced JSON instead of the bundled dataset; the database reflects the custom users/teams/tickets.
- `seed-references-by-key`: the dataset resolves natural-key references (user email, team name, epic/ticket title); a ticket referencing an unknown epic/team or a comment referencing an unknown ticket fails with a clear "unknown <kind>" error.
- `seed-invalid-file-rejected`: a malformed dataset (bad JSON, invalid email, ticket `type`/`state` outside the allowed sets) is rejected with a validation error and the backend exits non-zero rather than partially importing.

## Persistence And Refresh [partly implemented — fresh-db smoke test; rest Phase 8]

- `persistence-after-refresh`: teams, epics, tickets, comments, and board state survive browser refresh.
- `persistence-after-restart`: created data survives application container restart.
- `fresh-db-no-seed-data`: fresh database starts empty except migration metadata.

## Access Control [partly implemented — auth guard; full matrix Phase 8]

- `protected-screens-require-auth`: board, teams, epics, tickets, and comments require login.
- `protected-api-requires-auth`: protected API endpoints reject anonymous requests.
- `public-auth-pages-accessible`: sign-up, login, verification, resend, health, and readiness stay public.

## Smoke And Definition Of Done [planned — Phase 8]

- `dod-full-happy-path`: sign up, verify, log in, create team, create epic, create ticket, comment, drag ticket to done, refresh.
- `dod-clean-checkout-start`: application starts from a clean checkout through Podman compose.
- `dod-no-sample-data`: QA can create all data through UI/API without manual database edits.
