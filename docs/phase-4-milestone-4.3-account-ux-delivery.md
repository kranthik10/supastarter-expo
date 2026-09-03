# Phase 4.3 — Account + Profile UX Delivery

**Historical implementation baseline:** `9daeb915233d8400c7f6be21aa5c75248ea5f9fe`
**Milestone:** 4.3 Account + Profile UX
**Local result:** PASS
**Schema or migration change:** No

## IMPLEMENTED

### Finite account error presentation
- Added `resolveErrorMessageKey(error, operation?, fallbackKey)` to `@repo/auth` UX policy: authentication-shaped failures resolve to finite `auth.*` keys; all other failures resolve to the caller-provided generic fallback. Raw backend, database, and transport text is never returned for rendering.
- The settings screen resolves every failure through this helper with a `settings.unknownError` fallback. The raw `error.message` alert path is removed.
- `classifyAuthError` passes client-side validation codes through untouched and accepts an optional operation: a wrong current password during `change-password` maps to `current_password_incorrect` (`auth.currentPasswordIncorrect`) instead of the sign-in `invalid_credentials` copy.

### Shared account validation
- Added `validateProfileNameInput` and `validateChangePasswordInput` (current-password required, new-password minimum length) to `@repo/auth`; the settings screen uses them before any network submission.
- New `auth.currentPasswordRequired` / `auth.currentPasswordIncorrect` strings in English and German.

### Classified store errors
- `updateProfile` and `changePassword` in `@repo/auth` now throw `toAuthActionError` results (`UPDATE_PROFILE_FAILED` / `CHANGE_PASSWORD_FAILED` fallbacks) instead of raw backend `Error` text, so the finite-key pipeline classifies them.

### Full session termination on sign-out and account deletion
- Sign-out and delete-account now run `terminateClientSession`: query cache, organization session, auth session, and the stored pending deep link are all cleared. Delete-account keeps using local-only auth clearing (the server user row is already gone); sign-out keeps revoking the server session first.
- `terminateClientSession` accepts an optional `clearPendingLink` dependency (backward compatible); a stored pending invite/reset link can no longer leak into the next user's session.
- The global 401 handler passes the same pending-link clearing.

## VERIFIED

| Check | Result | Evidence |
| --- | --- | --- |
| Focused auth/session tests | PASS | `ux.test.ts` (10 tests), `session-lifecycle.test.ts` (8 tests) |
| Typecheck | PASS | `pnpm typecheck` — 28/28 Turbo tasks |
| Lint | PASS | `pnpm lint` — 15/15 Turbo tasks |
| Full tests | PASS | `pnpm test` — 36 files, 191 tests |
| Build | PASS | `pnpm build` — 15/15 Turbo tasks |
| Migration/drift | PASS | `pnpm db:generate` — no schema changes, nothing to migrate |

## SECURITY DECISIONS

- No raw error text reaches alerts on the account surface; tRPC/storage/avatar failures render the generic settings key.
- Wrong-current-password is distinguishable from wrong sign-in credentials without disclosing account existence.
- Pending single-use links are destroyed on every session-termination path (sign-out, delete, forced 401 logout); a clearing failure is contained and can never skip organization/auth clearing.
- Validation-code passthrough uses `Object.hasOwn` so prototype-chain names (`toString`, `constructor`) can never slip through as UX codes (independent review finding, fixed with regression tests).
- Better Auth remains the password authority; `changePassword` still routes through its official endpoint with `revokeOtherSessions: false` unchanged.
- Server `deleteAccount` sole-owner guard, audit write, and session deletion are unchanged and still enforced transactionally.

## DEFERRED

- Native-device validation of the settings flows.
- Legacy `apps/mobile/lib/org-store.ts` removal (scheduled with 4.8 navigation cleanup).
- `settings.passwordRequired` / `settings.nameRequired` keys are now superseded by the shared `auth.*` keys; removal scheduled with the 4.7 shared-state pass to avoid touching 4.5/4.6 string tables early.
