# Testing Approach

This document groups end-to-end scenario candidates from `docs/KanbanBoard.pdf`. The scenarios are intended for Playwright and should be implemented progressively as the application moves beyond the current scaffold.

## Current Phase

The project is currently in Phase 1: foundation and runtime scaffold.

Current automated coverage:

- A Playwright smoke test container exists under `tests/e2e/`.
- The smoke test verifies that the frontend loads and renders the main application shell.

Target coverage:

- Add e2e coverage for core user workflows once authentication, teams, epics, tickets, comments, and persisted board operations are implemented.
- Keep browser tests runnable through Podman using the `e2e` compose profile.

## Running Headless Tests

Run the Playwright smoke test from the repository root:

```shell
podman-compose -f infra/podman/podman-compose.yml --profile test up --build --abort-on-container-exit e2e
```

This command starts the required application services and runs the `e2e` container. Playwright launches Chromium headlessly inside the Podman container.

Clean up the test stack:

```shell
podman-compose -f infra/podman/podman-compose.yml --profile test down
```

## Authentication

- `auth-signup-verification-login`: user signs up, receives verification flow, verifies email, then logs in.
- `auth-unverified-user-blocked`: newly registered unverified user cannot access the main app.
- `auth-resend-verification`: unverified user requests a new verification email; old token becomes invalid.
- `auth-token-expired`: expired verification token shows a clear result and allows resend.
- `auth-email-normalization`: emails are trimmed and compared case-insensitively.
- `auth-logout`: authenticated user logs out and protected screens become inaccessible.

## Team Management

- `teams-create-rename-delete`: verified user creates, renames, and deletes an empty team.
- `teams-name-validation`: empty or duplicate team names show validation errors.
- `teams-delete-blocked-with-tickets`: team with tickets cannot be deleted and shows clear message.
- `teams-delete-blocked-with-epics`: team with epics cannot be deleted and shows clear message.

## Epic Management

- `epics-crud`: user creates, lists, edits, and deletes an epic for a team.
- `epics-title-validation`: blank epic title is rejected.
- `epics-team-immutable`: epic team cannot be changed after creation.
- `epics-delete-blocked-when-referenced`: epic referenced by tickets cannot be deleted.

## Ticket Management

- `tickets-create-view-edit-delete`: user creates a ticket, views all fields, edits it, confirms delete.
- `tickets-required-fields`: title, body, team, type, and state validation is enforced.
- `tickets-invalid-enums-rejected`: invalid ticket type or state is rejected by the backend/API flow.
- `tickets-created-by-and-timestamps`: created by, created at, and modified at are shown correctly.
- `tickets-unchanged-save-does-not-update-modified`: saving unchanged ticket values does not advance the modified timestamp.
- `tickets-team-change-clears-invalid-epic`: changing ticket team clears or replaces an incompatible epic.
- `tickets-cross-team-epic-rejected`: backend rejects a ticket epic from another team.

## Comments

- `comments-add-and-display`: user adds comments and sees author, body, and timestamp.
- `comments-empty-body-rejected`: empty comment body shows validation error.
- `comments-chronological-order`: comments display oldest first.
- `comments-do-not-update-ticket-modified`: adding a comment does not change the ticket modified timestamp.
- `comments-deleted-with-ticket`: deleting a ticket removes its comments.

## Kanban Board

- `board-five-workflow-columns`: board shows exactly five columns in required order.
- `board-team-selector`: selecting a team shows only that team's tickets.
- `board-card-content`: ticket cards show at least title and type, optionally epic.
- `board-open-ticket-from-card`: user opens ticket details from a board card.
- `board-create-ticket-entry`: board provides clear create-ticket action.
- `board-drag-persists-state`: dragging a card to another column updates the backend and survives refresh.
- `board-drag-failure-rolls-back`: failed drag update returns the card to its previous column and shows an error.
- `board-direct-state-move`: card can move directly between any two states.
- `board-order-by-modified-desc`: cards in a column are ordered by most recently modified first.

## Filtering And Search

- `filters-by-type`: board filters tickets by `bug`, `feature`, or `fix`.
- `filters-by-epic`: board filters tickets by selected epic.
- `filters-title-search`: case-insensitive substring search filters ticket titles.
- `filters-and-logic`: type, epic, and search filters combine using AND logic.
- `filters-clear`: user can clear filters and restore the full board.

## Persistence And Refresh

- `persistence-after-refresh`: teams, epics, tickets, comments, and board state survive browser refresh.
- `persistence-after-restart`: created data survives application container restart.
- `fresh-db-no-seed-data`: fresh database starts empty except migration metadata.

## Access Control

- `protected-screens-require-auth`: board, teams, epics, tickets, and comments require login.
- `protected-api-requires-auth`: protected API endpoints reject anonymous requests.
- `public-auth-pages-accessible`: sign-up, login, verification, resend, health, and readiness stay public.

## Smoke And Definition Of Done

- `dod-full-happy-path`: sign up, verify, log in, create team, create epic, create ticket, comment, drag ticket to done, refresh.
- `dod-clean-checkout-start`: application starts from a clean checkout through Podman compose.
- `dod-no-sample-data`: QA can create all data through UI/API without manual database edits.
