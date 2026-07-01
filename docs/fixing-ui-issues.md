# Fixing UI & Workflow Issues

This document records a focused round of fixes made on the `fixing-ui-issues` branch, addressing
CLI ergonomics, contributor attribution, two colour/UX issues, a functional drag-vs-edit bug, board
filter labelling, and the top navigation's active state.

## 1. Short commands that run directly from any shell

`make` is not available on a default Windows install, so the `make up/seed/verify` shortcuts weren't
runnable from the CLI. Added a **dependency-free Node launcher** ([`scripts/run.mjs`](../scripts/run.mjs))
behind root [`package.json`](../package.json) scripts, so the same three modes run from PowerShell,
cmd, or bash with just Node (already required):

```shell
npm run up       # build + start with NO data (clean, schema-only DB)
npm run seed     # build + start with the generated demo dataset (ephemeral)
npm run verify   # build + start seeded, then run the full end-to-end suite
npm run down      # stop and remove volumes
```

The launcher auto-detects the engine (Docker if present, otherwise `podman-compose`), runs a fixed
`kanban` compose project, and points the seed at `backend/seed/generated-data.json`. Override the
engine with `COMPOSE`, e.g. `COMPOSE="podman-compose" npm run up`. The `Makefile` remains for
environments that have `make`.

## 2. Removing "Cursor" from the repository contributors — investigation

**Finding:** Cursor is still attributed. GitHub computes the contributors list from commit history,
and the near-root scaffold commit `be4b603` ("Add Podman TypeScript scaffold and testing docs")
carries a trailer:

```
Co-authored-by: Cursor <cursoragent@cursor.com>
```

Every real author/committer is Pavel Skrabneu; this trailer is the only Cursor attribution.

**Is removal possible?** Yes, but it requires rewriting published history and force-pushing, because
the trailer lives inside a commit near the root of the graph. `git filter-repo` is not installed, so
use the built-in `git filter-branch`:

```shell
# 1. Rewrite the trailer out of every commit on every local branch/tag.
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --force \
  --msg-filter "sed '/[Cc]o-authored-by: Cursor/d'" -- --all

# 2. Verify it's gone.
git log --all --pretty=full | grep -i cursor   # should print nothing

# 3. Force-push the rewritten branches (rewrites published history).
git push --force origin main            # (+ any other branches you keep on the remote)

# 4. Clean up the local backups filter-branch created.
git for-each-ref --format="%(refname)" refs/original/ | xargs -n1 git update-ref -d
```

**Caveats / why it's disruptive now:**

- It changes the SHA of `be4b603` **and every commit after it** (including the merge commits from
  PRs #1–#6) on **all** branches — anyone with a clone must re-clone or hard-reset.
- It force-pushes published history, which is destructive; open PRs/branches on the remote would
  need re-basing or re-pushing.
- GitHub caches the contributors list, so it can take a while to recompute after the push.

Because this rewrites the whole published history, it is documented here rather than executed as
part of this branch — run it deliberately when you're ready to force-push.

## 3. Ticket types (Bug / Feature / Fix) are now clearly distinct

The type colours were too subtle (soft pastel pills). Type badges are now **solid, saturated chips
with white text**, one distinct hue each — unmistakable at a glance, with the text label always
present:

- **Bug** — red · **Feature** — blue · **Fix** — teal.

Driven by `TYPE_STYLES` in [`store/tickets.ts`](../frontend/src/store/tickets.ts) (single source of
truth), applied on board cards, the ticket list, and ticket details.

## 4. Workflow states are now clearly distinct

State pills are now **soft, ring-bordered chips in the state's colour** — visually different from the
solid type badges, and each of the five states clearly distinct:

- New — slate · Ready for implementation — blue · In progress — amber · Ready for acceptance —
  violet · Done — green.

Driven by `STATE_STYLES` / `STATE_COLUMN_ACCENT`; board columns also carry a coloured top-accent and
a coloured count chip.

## 5. Functional bug: editing a ticket's state didn't save

**Bug:** dragging a card on the board changed its state (persisted), but on the ticket **edit
screen** the state was a separate "changes save immediately" dropdown that sat *outside* the edit
form — so a user who changed the State and clicked **Save changes** saw no state change saved.

**Fix:** state is now a **field of the edit form**, saved together with the other fields by
**Save changes** (via `PATCH /api/tickets/:id`, which already supports state). Drag-and-drop on the
board keeps its own immediate-save behaviour.

**Tests added:**
- Backend integration: `PATCH /api/tickets/:id` with `{ state }` persists the new state
  ([`tickets-integration.test.ts`](../backend/test/tickets-integration.test.ts)).
- E2E: the `tickets-flow` now changes the state in the edit form, clicks **Save changes**, reloads,
  and asserts the state persisted ([`tickets-flow.ts`](../tests/e2e/tickets-flow.ts)).

## 6. Visible labels for the board filters

The Kanban board's filter controls had accessible (`aria-label`) names but no visible captions.
Each control now has a visible label — **Team**, **Title**, **Type**, **Epic** — above the control
(the `aria-label`s are preserved, so existing automated tests still match).

## 7. Active state for the top navigation

The header links (**Board**, **Teams**, **Epics**, **Tickets**) are always visible, but the link for
the current screen is now shown as the active page: **bold + underlined and non-clickable**
(`disabled`, `aria-current="page"`). `AppHeader` derives this from the current route (`useLocation`),
matching sub-routes too (e.g. `/tickets/:id` keeps **Tickets** active).

## 8. Documentation

This document, plus the README's Quick Commands section (the new `npm run …` shortcuts) and the
testing-approach catalogue.

## Verification

- Frontend `tsc --noEmit && vite build` clean.
- Backend integration tests updated/passing (state-via-update).
- Full Playwright suite run from a freshly-built stack (all test-facing hooks preserved).
