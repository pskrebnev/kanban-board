# Phase 9 — Reference Wireframe Fidelity & UX Polish

This document is the implementation plan and backlog for **Phase 9** — the final phase — of the
Kanban Ticketing System, as defined in [kanban-ticketing-hls.md](kanban-ticketing-hls.md). It is
grounded in the authoritative spec [KanbanBoard.pdf](KanbanBoard.pdf) (chapters §15, §11, §10).

Phase 9 adds **no new business features** — all mandatory scope is complete through Phase 8.
Instead it brings the UI up to the information hierarchy and flows shown in the reference wireframes
(spec §15), polishes the loading/empty/success/error states (§11), and makes the whole app look and
feel smoother and more coherent. It also folds in three specific product requests:

1. **Colour-code ticket types** — Bug, Feature, and Fix are each visually distinct.
2. **Colour-code workflow states** — New, Ready for implementation, In progress, Ready for
   acceptance, and Done are each visually distinct.
3. **A smoother, more polished general style** across the app.

> **Status: implemented.** The three requested UI improvements and the overall polish are built and
> verified: ticket types (Bug/Feature/Fix) and the five workflow states are each colour-coded from a
> single token source, with the text label always shown; the app has a smoother feel (shared
> transitions, hover-lift cards, coloured column accents, `focus-visible` rings, a refined sticky
> header and background, and `prefers-reduced-motion` support). The **Tailwind migration is now
> finished** too: the legacy `@layer components` layout classes were converted to utilities (auth
> screens use a shared `authUi` module; Teams/Epics reuse `<AppHeader />`), leaving `styles.css` as
> the framework import, the `@theme` tokens, a small base layer, and four tiny semantic text/button
> helpers. The full Playwright suite still passes (all test-facing hooks preserved).

## Goal

Deliver a visually coherent, polished UI: a small design-token system drives distinct, consistent
colours for the three ticket types and the five workflow states; the board, ticket, team, epic, and
auth screens align with their reference wireframes; interactions (hover, focus, drag) feel smooth;
and the remaining legacy CSS is migrated to Tailwind utilities. Crucially, this is a **visual-only**
phase: no API, data model, or behaviour changes, and **all test-facing hooks are preserved** so the
existing automated suite stays green.

## Spec Alignment

- **§15 Reference Wireframes** — align each screen to its wireframe's information hierarchy and
  primary flows: Wireframe 1 (Kanban board), Wireframe 2 (login / sign-up / verification with the
  header user menu + Log out), Wireframe 3 (ticket details / editing / comments), Wireframe 4 (team
  management with disabled delete controls for referenced teams), Wireframe 5 (epic management).
  Wireframes are guidance, not a mandated pixel design.
- **§11 Non-Functional (Usability)** — consistent loading, empty, success, and error states across
  every screen; readable typography; accessible colour usage.
- **§10 Minimum Screens** — confirm all required screens remain present and reachable after the
  restyle.

## Scope

### In scope

- **A design-token layer** in the Tailwind `@theme`: colours for the three ticket **types** and the
  five workflow **states** (each with a strong and a soft/background variant), plus shared
  elevation (shadows), radius, and motion (transition) tokens for consistency.
- **Ticket type colour-coding** — a single source of truth for type → colour, applied consistently
  everywhere a type appears (board cards, ticket list, ticket details, and the type selectors).
- **Workflow state colour-coding** — each board column carries its state colour (header / accent /
  count), and the state is shown as a coloured pill in the ticket list and details.
- **General style polish** — consistent radii, layered soft shadows, a refined spacing/typography
  rhythm, hover/focus affordances, smooth transitions (including drag feedback), a refined page
  header/background, and polished empty/loading/success/error states.
- **Wireframe alignment** for the board, auth, ticket-details, teams, and epics screens.
- **Finishing the Tailwind migration** — convert the remaining hand-written `@layer components`
  classes (`topbar`, `board`, `column`, `ticket`, `auth-*`, `team-*`, `user-*`, `hero`, etc.) to
  utilities, so `styles.css` is essentially `@import "tailwindcss";` + the `@theme` + minimal base.
- **Accessibility** — colour is never the *only* signal (type/state always carry their text label);
  text contrast meets WCAG AA; interactive elements have a visible focus ring; transitions respect
  `prefers-reduced-motion`.
- **Documentation** — README, architecture, and HLS updates.

### Out of scope

- Any new features, endpoints, data-model, or behavioural changes (visual-only phase).
- Renaming or removing test-facing hooks — aria-labels, `data-*` attributes, placeholders, roles,
  headings, and key text strings are **preserved** (see Risks).
- A full design-system component library, theming/dark-mode toggle, or icon set beyond what the
  polish needs (optional, not required by the spec).

## Technical Approach

### Design tokens (`frontend/src/styles.css` `@theme`)

Extend the existing token set (`--color-brand`, `--color-muted`, `--color-line`, …) with:

- **Ticket types** (distinct hues; strong + soft):
  - `--color-type-bug` / `--color-type-bug-soft` — red (reuses the danger family).
  - `--color-type-feature` / `--color-type-feature-soft` — indigo/blue (the brand family).
  - `--color-type-fix` / `--color-type-fix-soft` — amber.
- **Workflow states** (an intuitive progression; strong + soft):
  - `new` — slate/grey · `ready_for_implementation` — blue · `in_progress` — amber ·
    `ready_for_acceptance` — violet · `done` — green.
- **Shared** — `--radius-*`, `--shadow-*`, and a standard transition duration/easing so cards,
  panels, and controls share one visual language.

### Ticket type colour-coding (request 1)

- Add a single mapping (e.g. `TYPE_STYLES: Record<TicketType, string>`) next to the existing
  `TYPE_LABELS` in `frontend/src/store/tickets.ts`, returning the badge classes for each type.
- Replace today's one-size `bg-brand-soft text-brand` type badge (in `Board.tsx` and `Tickets.tsx`)
  with the per-type styles, so Bug/Feature/Fix are immediately distinguishable. The **text label is
  always shown** alongside the colour.

### Workflow state colour-coding (request 2)

- Add a `STATE_STYLES: Record<TicketState, string>` mapping next to `STATE_LABELS`.
- Board columns (`Board.tsx`) get a state-coloured header accent and count chip; the ticket list and
  details render the state as a coloured pill. Same state → same colour everywhere.

### General style & smoothness (request 3)

- Elevation & shape: consistent `rounded-xl/2xl`, layered soft shadows, hairline borders.
- Motion & interaction: card hover-lift, `focus-visible` rings on all interactive elements, smooth
  colour/opacity/transform transitions, and refined dnd-kit drag feedback — all gated behind
  `prefers-reduced-motion: reduce`.
- Rhythm: a consistent spacing scale and typographic hierarchy (headings, weights, tracking).
- Chrome: a refined top bar / nav and a subtle page background; polished empty ("No tickets yet"),
  loading, success, and error treatments.

### Wireframe alignment (spec §15)

Pass over each screen to match its wireframe's hierarchy (not pixels): board (W1), auth (W2),
ticket details/comments (W3), teams with disabled-delete affordance (W4), epics (W5).

### Finish the Tailwind migration

Migrate the remaining `@layer components` classes to utilities screen-by-screen, re-running the
Playwright suite after each screen, until `styles.css` carries only the framework import, the
`@theme`, and a few base rules.

### Accessibility & preserved contracts

- Every type/state keeps its **text label** — colour is a reinforcement, not the sole signal.
- Verify WCAG AA contrast for text on coloured chips; add visible focus states.
- **Preserve all test-facing hooks** (see Risks) so the automated suite is unaffected.

---

## Backlog (JIRA-style Epics & Tasks)

Story points are rough relative estimates. IDs are local references (e.g. `P9-1`).

### EPIC P9-E1 — Design Tokens & Theme

> As the UI, I have a single source of truth for type/state colours and shared elevation/motion so
> the whole app is visually consistent.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P9-1 | Type colour tokens | Add `--color-type-{bug,feature,fix}` (+ soft) to `@theme`. | Three distinct, accessible hues available as utilities. | 1 |
| P9-2 | State colour tokens | Add tokens for the five workflow states (+ soft). | Five distinct hues available as utilities. | 1 |
| P9-3 | Elevation/radius/motion tokens | Shared shadow, radius, and transition tokens. | Cards/panels/controls reference the same tokens. | 2 |

### EPIC P9-E2 — Ticket Type Colour-Coding

> As a user, I can tell Bug, Feature, and Fix apart at a glance.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P9-4 | Type → style mapping | `TYPE_STYLES` beside `TYPE_LABELS`. | One mapping drives every type badge. | 1 |
| P9-5 | Apply on all screens | Board cards, ticket list, details, selectors. | Each type has its distinct colour everywhere; label always shown. | 2 |

### EPIC P9-E3 — Workflow State Colour-Coding

> As a user, I can tell the five workflow states apart at a glance.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P9-6 | State → style mapping | `STATE_STYLES` beside `STATE_LABELS`. | One mapping drives every state chip/accent. | 1 |
| P9-7 | Board columns + pills | Column header accents/counts + coloured state pills in list/details. | Each state distinct on the board and in the list/details; label always shown. | 3 |

### EPIC P9-E4 — General Style & Smoothness

> As a user, the app looks polished and feels smooth.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P9-8 | Elevation & shape pass | Consistent radii, soft shadows, borders across cards/panels. | Cohesive surfaces app-wide. | 3 |
| P9-9 | Motion & interaction | Hover-lift, focus-visible rings, smooth transitions, drag feedback; honour reduced-motion. | Interactions feel smooth; no motion when reduced-motion is set. | 3 |
| P9-10 | Typography & spacing | Consistent type scale, weights, and spacing rhythm. | Headings/labels/body consistent across screens. | 2 |
| P9-11 | Chrome & UX states | Refined header/nav/background; polished loading/empty/success/error. | Each state visibly distinct and consistent (§11). | 3 |

### EPIC P9-E5 — Wireframe Alignment (§15)

> As a reviewer, each screen matches the intent of its reference wireframe.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P9-12 | Board (Wireframe 1) | Team selector, filters bar, five columns, card content. | Maps to W1's hierarchy. | 2 |
| P9-13 | Auth (Wireframe 2) | Login / sign-up / verification + header user menu with Log out. | Maps to W2. | 2 |
| P9-14 | Ticket details (Wireframe 3) | Fields, metadata, actions, comments layout. | Maps to W3. | 2 |
| P9-15 | Teams (Wireframe 4) | List with disabled delete affordance for referenced teams. | Maps to W4. | 1 |
| P9-16 | Epics (Wireframe 5) | List + create/edit with team selector. | Maps to W5. | 1 |

### EPIC P9-E6 — Finish Tailwind Migration

> As a maintainer, styling lives in utilities and tokens, not a parallel CSS file.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P9-17 | Migrate legacy classes | Convert remaining `@layer components` classes to utilities. | `styles.css` ≈ `@import "tailwindcss";` + `@theme` + minimal base; suite still green after each screen. | 5 |

### EPIC P9-E7 — Accessibility & Preserved Contracts

> As any user, the UI is accessible; as a maintainer, the tests still pass.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P9-18 | Accessibility | Colour not sole signal; WCAG AA contrast; visible focus. | Types/states carry labels; contrast passes; focus visible. | 2 |
| P9-19 | Preserve test hooks | Keep aria-labels, `data-*`, placeholders, roles, headings, key text. | Restyle changes visuals only; selectors unchanged. | 2 |

### EPIC P9-E8 — Testing

> As a maintainer, I have proof the restyle didn't regress behaviour.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P9-20 | Full Playwright suite | Re-run the whole e2e suite after the restyle. | All flows still pass. | 2 |
| P9-21 | Colour-distinction assertions | Optional light checks that type badges / state accents carry distinct classes. | Stable assertions only; no flakiness. | 2 |
| P9-22 | Visual review | Manual walkthrough against the wireframes and the text scenarios. | Reviewer signs off per screen. | 2 |

### EPIC P9-E9 — Documentation

> As a reader, the docs reflect the final styling.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P9-23 | README & architecture | Document the colour system and final styling. | Docs reflect Phase 9. | 1 |
| P9-24 | HLS status update | Mark Phase 9 complete. | HLS shows Phase 9 done with a link here. | 1 |

## Phase 9 Definition of Done

- [x] Bug, Feature, and Fix each have a distinct, consistent colour wherever they appear (board
      cards, ticket list, details); the type text label is always present.
- [x] Each of the five workflow states has a distinct colour on the board (column accent + count)
      and in the list/details pills; the state text label is always present.
- [x] The UI is visibly smoother: consistent radii/shadows/spacing, hover-lift + `focus-visible`
      states, and smooth transitions that honour `prefers-reduced-motion`.
- [x] The screens keep their reference-wireframe hierarchy (§15) with consistent
      loading/empty/success/error states (§11).
- [x] Colour is never the only signal (types/states always carry their text label); interactive
      elements show a visible focus ring. (Contrast uses conventional strong/soft pairs; a formal
      WCAG audit is a follow-up.)
- [x] The remaining legacy component classes are migrated to Tailwind utilities; `styles.css` is
      essentially the framework import + `@theme` + a small base layer and a few tiny text/button
      helpers.
- [x] The full Playwright suite still passes (all test-facing hooks preserved) — 8/8 flows green.
- [x] README, architecture, and HLS docs reflect the styling.

## How To Test Locally

Once implemented, with the stack running (`make up`, `make seed`, or `make dev`):

### Manual (browser)

1. Open the board: the three ticket **types** are visually distinct (Bug / Feature / Fix), and each
   of the five **columns/states** has its own colour — with text labels still present.
2. Open the ticket list and a ticket's details: the same type and state colours appear consistently.
3. Hover cards and focus controls: hover/focus states are visible; dragging a card feels smooth.
4. Walk each screen (board, auth, ticket details, teams, epics) against its wireframe; confirm the
   loading/empty/success/error states look polished and consistent.
5. Enable "reduce motion" in the OS/browser and confirm transitions are suppressed.

### Automated

- **End-to-end:** `make verify` (or the `--profile test` compose run) — the full Playwright suite
  must still pass, proving the restyle didn't change any behaviour or break selectors.

### Text test scenarios

The catalogue of text-format test cases for Phase 9 lives in
[testing-approach.md](testing-approach.md) under **Visual & UX Polish**. They cover type/state
colour distinction and consistency, colour-not-sole-signal, contrast/focus, wireframe alignment per
screen, reduced-motion, and the "suite still green" regression guard.

## Dependencies & Risks

- **Visual-only phase, but the top risk is breaking the automated suite.** The Playwright flows key
  off aria-labels (`Board team`, `Filter by type`, `State`, `Add comment`, …), `data-*` attributes
  (`data-column`, `data-ticket-id`), placeholders (`Search title…`, `New team name`, `Ticket title`,
  `Describe the work`, `Write a comment…`), roles/button names (`Post comment`, `Create team`,
  `New ticket`, `Clear`, `Log in`, `Sign up`), headings (`Kanban board`, `Teams`, `Epics`,
  `Tickets`, `New ticket`), and key text (`No comments yet`). Phase 9 **must not** rename these —
  restyle visuals only, and re-run the suite after each screen.
- **Accessibility:** colour choices must meet WCAG AA and never be the sole signal (always pair with
  the text label); include visible focus states.
- **Tailwind migration is broad but mechanical:** do it incrementally, screen-by-screen, keeping the
  suite green throughout, to avoid a big-bang regression.
- **Scope discipline:** this is polish — resist adding features, dark mode, or a component library
  beyond what the wireframes and the three requests call for.
