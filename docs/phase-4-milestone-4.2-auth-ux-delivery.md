# Phase 4.2 — Auth UX Completion Delivery

**Historical implementation baseline:** `e7d5344236238ac3c56234469418a3d6a642616e`
**Milestone:** 4.2 Auth UX Completion
**Local result:** PASS WITH RELEASE GATE
**Schema or migration change:** No

## IMPLEMENTED

### Better Auth password recovery

- Kept Better Auth as the authentication and reset-token authority.
- Connected the forgot-password screen to Better Auth's `request-password-reset` operation via the installed client's callable `$invoke` transport (`$invoke(path, { method: 'POST', body })`).
- Added the `/reset-password` Expo Router screen and Better Auth `reset-password` submission (`{ token, newPassword }` in the request body, matching the server endpoint contract).
- Added password confirmation, minimum-length validation, expired/invalid-token handling, completion state, and a return-to-sign-in path.
- Clears password fields from memory and strips the single-use token from route params immediately after successful consumption.
- Enabled `revokeSessionsOnPasswordReset`, so a successful reset invalidates existing server sessions.
- Added a server-only password-reset email provider seam. Its default result is explicitly `not_configured`; it does not fabricate delivery.
- The reset-email handler swallows provider failures so reset-request responses stay account-enumeration neutral even when delivery is down.
- Added the exact configured mobile reset callback path to Better Auth trusted origins. The callback is derived from `EXPO_PUBLIC_APP_SCHEME` and rejects malformed schemes.

### Sign-in and sign-up

- Centralized normalization, validation, and finite safe error classification.
- Added user-facing states for invalid credentials, duplicate account, missing password, short password, network failure, rate limiting, and generic server failure.
- Removed the broken GitHub button and inaccurate demo-mode claims rather than presenting non-functional authentication choices.
- Replaced the misleading email-verification and resend claims with an explicit disabled-state screen because server-side verification is not configured.
- Kept English and German strings aligned.

### Session and cache safety

- Added structured tRPC `UNAUTHORIZED` detection for single and batched responses without matching arbitrary error text or successful application payloads.
- The transport wrapper captures the failed request's `Authorization` identity and the app terminates a session only when it matches the currently active credential, so a delayed 401 from a previous user's in-flight request cannot log out the active user.
- On invalid session, clears the local Better Auth session, TanStack Query cache, cached organizations, pending organization invitations, and active organization before returning to sign-in.
- Added a user-bound organization cache marker. A different authenticated user cannot inherit another user's cached organizations or active organization.
- Stale organization refreshes are dropped: results fetched under a prior session identity are never installed after the session changes or ends.
- Revalidates accessible organizations when an authenticated session begins and falls back safely after membership loss.

### Deep links and invitation continuity

- Added an allowlist for internal routes and bounded validation for invitation, organization, and reset-password parameters.
- Reconstructed Expo custom-scheme host/path components safely and rejected foreign schemes and unknown routes.
- Kept reset-password links public while retaining authentication requirements for invitation and application routes.
- Deep-link hydration reads the same `@repo/organizations` store the root layout hydrates; the legacy local org store is no longer consulted.
- Single pending-link ownership: sign-in/sign-up consume the stored link as one ordered consume-and-navigate step; the root layout consumes only on the first post-hydration restore, so the two paths cannot race or overwrite each other.
- Preserved pending invitation links across sign-in, including direct visits to `/invite/[token]`.
- Reset and invitation credentials are not sent to analytics or monitoring; monitoring and analytics continue to receive pathname-level logical route context only.

## VERIFIED

| Gate | Result | Evidence |
|---|---|---|
| Focused auth/API/navigation/session tests | PASS | 9 files, 40 tests |
| Typecheck | PASS | `pnpm typecheck` — 28/28 Turbo tasks |
| Lint | PASS | `pnpm lint` — 15/15 Turbo tasks |
| Full tests | PASS | `pnpm test` — 36 files, 184 tests |
| Build/export | PASS | `pnpm build` — iOS, Android, and web bundles exported; `/reset-password` present in 43 static routes |
| Migration generation | PASS | `pnpm db:generate` — 18 tables; no schema changes; nothing to migrate |
| Maestro | DEFERRED | Not executed; prohibited until Milestone 4.9 conditions are met |
| EAS/native build | DEFERRED | Not executed |
| Native-device interaction | NOT VERIFIED | No device run was performed |

The full-suite count increased from the Phase 4.1 baseline of 151 tests to 184 tests.

An independent review of the pre-fix diff failed on six defects (callable `$invoke` shape, wrong org store in deep links, premature pending-link flag, sign-in/layout navigation race, generation-unaware 401 handling, stale org-refresh installs). Each was fixed with a failing test first and the full gate re-run above.

## SECURITY DECISIONS

- Forgot-password success remains account-enumeration safe. A valid request produces neutral copy whether or not an account exists.
- The neutral response does not claim delivery: it says instructions arrive only when an account exists and email delivery is available.
- Backend authentication messages are converted to finite client codes; raw provider/database messages are not rendered.
- Reset tokens are accepted only on the bounded reset route and submitted only to Better Auth's reset endpoint.
- The single-use token value is destroyed in memory and route params immediately after successful consumption (`setParams` overwrites rather than removes the key in the installed React Navigation delegation, so the value — not the key — is what leaves state).
- Arbitrary external, protocol-relative, malformed, and credential-bearing redirects are rejected.
- Successful tRPC data containing a domain field named `code: "UNAUTHORIZED"` does not trigger logout.

## DEFERRED

- A real Resend/SMTP password-reset email adapter, sender/domain verification, bounce handling, and delivery monitoring.
- Web pending-link persistence encryption (mobile `secureStorage` falls back to plaintext on web).
- Legacy `apps/mobile/lib/org-store.ts` removal (now unreferenced; scheduled with 4.8 navigation cleanup to avoid a second org-session source of truth).
- Better Auth email verification and a real delivery/resend path; the route remains explicitly disabled until those exist.
- Universal-link/app-link association as a stronger production alternative to a custom URL scheme.
- Native-device deep-link and email-client validation.
- Maestro execution and EAS builds.

## BLOCKED / RELEASE GATE

Production password recovery is **not release-ready** until a real server-side email provider is configured and independently verified. The local provider seam intentionally returns `not_configured`. The request/reset lifecycle, route, validation, and session revocation are implemented, but no real reset message was delivered during this milestone.

## NEXT MILESTONE

Proceed to Milestone 4.3 only after this milestone's scoped commit is pushed and GitHub Actions passes at the exact commit SHA.
