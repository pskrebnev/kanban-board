# Phase 2 — User Accounts & Authentication

This document is the implementation plan and backlog for **Phase 2** of the Kanban Ticketing
System, as defined in [kanban-ticketing-hls.md](kanban-ticketing-hls.md). It is grounded in
the authoritative spec [KanbanBoard.pdf](KanbanBoard.pdf) (chapters §3, §9, §10, §11).

Phase 2 adds local authentication: sign-up with email verification, login/logout with a
JWT session cookie, and protection of all business endpoints. It builds directly on the
Phase 1 persistence foundation (the `users` and `email_verification_tokens` tables already
exist from migration `0001`).

## Goal

Allow a user to sign up, verify their email through a configurable SMTP service, log in and
out with local credentials, and have all business endpoints and screens protected. No teams,
epics, tickets, or comments behavior is introduced in this phase.

## Spec Alignment

- **§3 User Accounts and Authentication** — email/password sign-up (trimmed, case-insensitive,
  unique email; password ≥8 chars; Argon2id hashing); SMTP email verification supporting
  `relay1.dataart.com`; 24h single-use verification tokens; resend invalidates prior tokens;
  unverified users cannot use the app; public endpoints limited to sign-up, login, verify, and
  resend.
- **§9 API & Persistence Expectations** — cookie-based session or bearer token (no tokens in
  URLs except the single-use verification token); meaningful HTTP status codes; persistence in
  the RDBMS.
- **§10 Minimum Screens** — sign-up, email-verification result, resend action, login.
- **§11 Non-Functional Requirements** — hash passwords, protect endpoints, validate input,
  keep SMTP/JWT secrets out of source control; show loading/empty/success/error states.

## Scope

### In scope

- Backend auth dependencies: `argon2`, `jsonwebtoken`, `cookie-parser`, `nodemailer`, `zod`.
- Password hashing with Argon2id; JWT issued in an httpOnly, SameSite cookie.
- Endpoints: `signup`, `verify`, `resend`, `login`, `logout`, `me`.
- Single-use, 24h email-verification tokens (stored hashed); SMTP delivery via Nodemailer;
  Mailpit capture in local/test environments.
- `requireAuth` middleware and a public allow-list (signup, login, verify, resend, health,
  readiness, static assets).
- Frontend auth screens (sign-up, login, email-verification result, resend), an auth store,
  and a `ProtectedRoute` guard.
- Tests: backend integration + unit, and a Playwright auth flow.
- Documentation updates.

### Out of scope (later phases)

- Teams, epics, tickets, comments endpoints and UI (Phases 3–7).
- Password reset, SSO/OAuth, roles/membership (out of mandatory scope per spec §12; reset is a
  stretch feature §14).

## Technical Approach

### Auth backend foundation

- Add `argon2` for Argon2id password hashing (configurable cost left at safe defaults).
- Add `jsonwebtoken` to mint a signed JWT containing the user id and verification status; store
  it in an httpOnly, `SameSite=Strict`, `Secure`-in-production cookie via `cookie-parser`.
- `requireAuth` middleware verifies the cookie JWT, loads the user, and rejects unauthenticated
  (401) or unverified (403) requests. A public allow-list keeps auth and health endpoints open.
- All input validated with `zod`; failures map to `ValidationError` (400) via the Phase 1
  error handler.

### Sign-up & email verification

- `POST /api/auth/signup`: trim + lowercase email; validate password length ≥8; hash with
  Argon2id; insert an unverified user; generate a random verification token, store only its
  hash with a 24h `expires_at`; send the verification email. Duplicate email → 409.
- Verification token: random high-entropy value; the raw token goes only in the verification
  URL (the one allowed exception per §9); the database stores a hash.
- `GET /api/auth/verify?token=…`: look up by token hash; reject if missing, expired, or already
  consumed; mark the user verified and set `consumed_at`. Success routes the SPA to login.
- `POST /api/auth/resend`: for an unverified email, invalidate prior unused tokens (set
  `consumed_at` or delete), issue a new token, and resend. Always responds without leaking
  whether the email exists.
- Email delivery via Nodemailer using the Phase 1 SMTP config; production must support
  `relay1.dataart.com`; local/test uses Mailpit (already wired under the `test` profile).

### Login, logout, session

- `POST /api/auth/login`: look up by email; verify password with Argon2; reject unverified
  users (403); on success set the JWT cookie. Invalid credentials → 401 (generic message).
- `POST /api/auth/logout`: clear the cookie.
- `GET /api/auth/me`: return the authenticated user's safe profile (id, email, verified) for
  SPA session bootstrap; 401 when not authenticated.

### Frontend

- Screens/routes: Sign-up, Login, Email-verification result (reads `token` from the URL and
  calls verify), and a Resend action available from the login/verification screens.
- An auth store (Zustand) that calls `/api/auth/me` on load and after login/logout.
- A `ProtectedRoute` wrapper redirecting unauthenticated users to login; a header user menu
  with **Log out** (per wireframe 2).
- Loading, empty, success, and error states on every form (spec §11).
- Axios configured to send credentials (cookies) with API requests.

### Security

- Passwords never stored in plain text (Argon2id only).
- JWT secret and SMTP credentials read from env; never committed.
- Session token in an httpOnly cookie (not web storage, not URLs).
- Generic auth error messages to avoid user enumeration; resend/login do not reveal account
  existence.

---

## Backlog (JIRA-style Epics & Tasks)

Story points are rough relative estimates. IDs are local references (e.g. `P2-1`).

### EPIC P2-E1 — Auth Backend Foundation

> As the system, I need password hashing, token-based sessions, and endpoint protection so
> that user identity is established securely.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P2-1 | Add auth dependencies | Add `argon2`, `jsonwebtoken`, `cookie-parser`, `nodemailer`, `zod` (+ types). | Packages install; backend builds; deps are runtime (not dev) where needed. | 1 |
| P2-2 | Password hashing service | Argon2id hash + verify helpers. | Hash is non-reversible; verify returns true/false; unit tested. | 2 |
| P2-3 | JWT + cookie session | Sign/verify JWT; set/clear httpOnly SameSite cookie (Secure in prod). | Valid token round-trips; tampered/expired token rejected; cookie flags correct. | 3 |
| P2-4 | `requireAuth` middleware | Verify cookie JWT, load user, enforce verified status; public allow-list. | Anonymous → 401; unverified → 403; verified → passes; allow-list stays public. | 3 |
| P2-5 | Request validation | `zod` schemas for auth payloads wired to the error handler. | Invalid input → 400 with consistent JSON; valid input passes. | 2 |

### EPIC P2-E2 — Sign-up & Email Verification

> As a new user, I can register and verify my email so that I can access the application.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P2-6 | Signup endpoint | `POST /api/auth/signup` with email normalization, password rules, Argon2id hash, unverified user insert. | Valid signup → 201 unverified user; duplicate email → 409; weak password → 400. | 3 |
| P2-7 | Verification token issuance | Generate high-entropy token, store hash + 24h expiry; raw token only in the email link. | Token row created with hash + `expires_at`; raw token not persisted. | 2 |
| P2-8 | Email delivery | Nodemailer transport from SMTP config; send verification email; Mailpit in dev/test. | Email appears in Mailpit during local run; prod config supports relay1.dataart.com. | 3 |
| P2-9 | Verify endpoint | `GET /api/auth/verify?token=…` validates, expires/consumes token, marks user verified. | Valid token → verified + consumed; expired/used/unknown → rejected; SPA routes to login. | 3 |
| P2-10 | Resend endpoint | `POST /api/auth/resend` invalidates prior unused tokens and reissues. | New token issued; old tokens invalidated; response does not leak account existence. | 2 |

### EPIC P2-E3 — Login, Logout, Session

> As a verified user, I can log in and out so that my session is established and cleared.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P2-11 | Login endpoint | `POST /api/auth/login` verifies credentials, blocks unverified, sets JWT cookie. | Valid + verified → 200 + cookie; bad credentials → 401; unverified → 403. | 3 |
| P2-12 | Logout endpoint | `POST /api/auth/logout` clears the session cookie. | Cookie cleared; subsequent `me` → 401. | 1 |
| P2-13 | Current-user endpoint | `GET /api/auth/me` returns safe profile or 401. | Authenticated → profile (no hash); anonymous → 401. | 1 |

### EPIC P2-E4 — Frontend Auth Screens & Guard

> As a user, I have screens to sign up, verify, resend, and log in, and I am redirected when
> unauthenticated.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P2-14 | Auth store & Axios creds | Zustand auth store calling `/api/auth/me`; Axios sends cookies. | Store reflects auth state; requests include credentials. | 2 |
| P2-15 | Sign-up screen | Form with validation and success/error states. | Valid submit shows "check your email"; errors surfaced; empty/invalid handled. | 2 |
| P2-16 | Login screen | Form with error handling; redirects to board on success. | Bad credentials show error; success establishes session and redirects. | 2 |
| P2-17 | Verification result + resend | Reads token, calls verify, shows result; resend action for expired/unverified. | Valid token → success + link to login; failure → clear message + resend option. | 3 |
| P2-18 | ProtectedRoute & logout | Guard for business screens; header menu with Log out. | Anonymous users redirected to login; logout clears session and returns to login. | 2 |
| P2-19 | UX states | Loading/empty/success/error across auth forms. | Each state visible where applicable (spec §11). | 2 |

### EPIC P2-E5 — Testing

> As a maintainer, I need automated proof of the auth flows.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P2-20 | Backend integration tests | Supertest flow: signup → blocked unverified login → verify → login; duplicate/weak/expired/reused/resend cases. | All cases assert correct status codes and side effects; run against a real Postgres. | 3 |
| P2-21 | Unit tests | Password hashing/verify; token hashing + expiry; JWT sign/verify. | Edge cases covered; deterministic and fast. | 2 |
| P2-22 | Playwright auth flow | Sign-up shows verification state; login rejects bad credentials; email captured via Mailpit. | E2E passes in the `test` compose profile. | 3 |

### EPIC P2-E6 — Documentation

> As a reader, I need docs that reflect authentication and its configuration.

| ID | Task | Description | Acceptance Criteria | Est |
|---|---|---|---|---|
| P2-23 | `.env` documentation | Confirm/extend `JWT_SECRET` and SMTP vars in `.env.example`; document generation. | Vars documented with safe placeholders; no secrets committed. | 1 |
| P2-24 | README + architecture | Document auth flow, SMTP/Mailpit setup, and protected endpoints; update functionality status. | README sections and architecture phase status updated. | 2 |
| P2-25 | HLS status update | Mark Phase 2 progress in the HLS phase table. | HLS reflects Phase 2 as in progress/complete. | 1 |

## Phase 2 Definition of Done

- [x] A user can sign up, receive a verification email via the configured SMTP service
      (captured in Mailpit locally), verify the account, and log in.
- [x] Passwords are hashed with Argon2id and never stored or returned in plain text.
- [x] Email is trimmed and compared case-insensitively; duplicates are rejected.
- [x] Verification tokens are single-use and expire after 24 hours; resend invalidates prior
      unused tokens.
- [x] Unverified users cannot log in or access protected endpoints/screens.
- [x] Session is carried in an httpOnly cookie; no tokens appear in URLs (except the single-use
      verification token).
- [x] All business endpoints are protected; sign-up, login, verify, resend, health, and
      readiness remain public.
- [x] Backend integration/unit tests pass; a Playwright auth flow test is included.
- [x] No secrets are committed; `.env.example` documents required variables.
- [x] README, architecture, and HLS docs reflect authentication.

## Dependencies & Risks

- **SMTP availability:** local/test relies on Mailpit; production requires `relay1.dataart.com`
  reachability and correct credentials. Mitigate by reading all SMTP settings from env.
- **Cookie/CORS in containers:** the SPA calls the API through the Nginx `/api` proxy
  (same-origin), so cookies should work without cross-site complications; verify `SameSite`
  and `Secure` behavior behind the proxy.
- **Token security:** store only token hashes; ensure tokens are high-entropy and single-use.
- **User enumeration:** keep login/resend responses generic to avoid leaking account existence.
- **Clock/expiry:** compute expiry in UTC; ensure 24h expiry is enforced server-side.
