# Phase 3 Milestone 3.3 Audit

**Date:** 2026-09-01
**Historical Phase 2 baseline:** `5c1ceba`
**Active baseline:** `f7517ae` (Phase 3.2 documentation closure)
**Scope:** User Settings only
**Result:** PASS WITH WARNINGS — no architectural conflict; email delivery and delayed hard-delete infrastructure remain deferred

## Baseline

- `f7517ae` is on `main`, tracking `origin/main`; working tree before this milestone contained only intentional untracked `.env.development`.
- Phase 3.2 implementation is present: server invitation lifecycle, team management, ownership transfer, and CI run `33544316656` completed successfully.
- Existing known validation: 75 tests, typecheck/lint/test/build/database validation pass; EAS and Maestro remain deferred.
- Existing authorization boundary: Hono + tRPC `protectedProcedure`; user-level settings must use `ctx.user.id`, not organization membership or client-supplied `userId`.
- IDs remain text/cuid2. No RLS, new identity system, password hash column, or custom auth token is permitted.

## Existing user/auth/settings capabilities

### Database

At the 3.2 baseline the schema has 17 tables. Relevant authoritative columns:

- `users`: `id text pk`, `email text unique`, `email_verified boolean default false`, `name text`, `image text nullable`, `created_at`, `updated_at`. `image` is already Better Auth's canonical avatar/profile-image field.
- `sessions`: `id`, `user_id fk users cascade`, unique `token`, `expires_at`, optional `ip_address`/`user_agent`, `created_at`; index on `user_id`.
- `accounts`: Better Auth account rows, including nullable `password_hash` for the email provider; no settings code may read or write this field.
- `devices`: existing notification/device table; untouched in this milestone.
- No `user_preferences` table exists.
- No `users.deleted_at` exists.

### Better Auth

- `packages/api/src/auth.ts` uses Better Auth `1.7.2`, Drizzle adapter, email/password enabled, and the existing `users/accounts/sessions` tables.
- Better Auth 1.7.2 has official endpoints for `updateUser`, `changeEmail`, `changePassword`, `listSessions`, `revokeSession`, `revokeSessions`, `revokeOtherSessions`, and `deleteUser`.
- The current server config does not enable Better Auth's `user.deleteUser` option, and the current mobile client exposes only generic `$invoke` plus existing auth actions. No custom password or session model exists.
- Existing mobile `updateProfile` used a non-authoritative `PATCH /user` call. Better Auth's installed endpoint is `POST /update-user`; it returns status and the client must refresh the session afterward.
- Email-change support exists in Better Auth but requires a configured verification-mail flow; the repository has no configured sender implementation. Email changes are therefore deferred rather than implemented as direct SQL.

### Mobile settings/localization/theme

- `apps/mobile/app/(app)/(tabs)/settings.tsx` already renders account identity, theme (`system|light|dark`), locale (`en|de`), sign-out, and delete controls.
- `apps/mobile/lib/settings-store.ts` persists theme/locale locally in `settings.v1` and resolves system appearance through the existing UI theme hook.
- `@tanstack/react-query` was already declared at the workspace root but was not wired into the mobile root; this milestone adds the mobile dependency and `QueryClientProvider`. The settings screen uses the existing tRPC client as query/mutation functions with invalidation.
- `apps/mobile/lib/i18n/{en,de}.ts` and `changeLanguage()` are already the supported localization infrastructure.
- The active app shell uses `@repo/auth`, while deep-link handling had retained a legacy demo-store import. The import is corrected in this milestone so deep-link gating reads the same Better Auth-backed session store as the app/settings screens; the legacy unused file is not expanded or used as a second identity system.
- There is no server-backed preference fetch/update, profile edit form, notification-preference storage, password form, or session list/revoke UI.

## Proposed changes and classification

| Proposal | Classification | Decision |
|---|---|---|
| `users.avatar_url` | REJECT | `users.image` is the existing Better Auth image field and canonical avatar reference. No duplicate concept. R2 upload remains Phase 3.4. |
| `users.deleted_at` | DEFER | The selected account-deletion model is immediate deletion through the existing Better Auth persistence tables after safety checks; no soft-delete column is needed for this milestone. Revisit only with an auth-aware grace lifecycle. |
| `user_preferences` | LEGITIMATE ADDITION | No equivalent exists. Add one row per user with safe defaults and `user_id` PK/FK cascade. |
| `locale` | LEGITIMATE ADDITION | Existing app supports only `en|de`; use a DB enum and Zod enum. |
| `theme` | LEGITIMATE ADDITION | Existing app supports only `system|light|dark`; use a DB enum and Zod enum. |
| `marketing_opt_in` | LEGITIMATE ADDITION | Safe user-level preference for future communication controls; default false. |
| `invite_emails` / `billing_alerts` | LEGITIMATE ADDITION | Notification preference foundation for later Phase 3.5; no push/send behavior here. Defaults true. |
| `quiet_hours_start/end` | LEGITIMATE ADDITION | Storage foundation only. Strict `HH:MM`; either both null or both valid. No timezone scheduling. |
| `settings.getProfile` | LEGITIMATE ADDITION | Protected, returns only the authenticated user's safe profile fields. |
| `settings.updateProfile` | LEGITIMATE ADDITION | Protected, session-derived user id, safe `name` and URL/null `image` only; email/security fields rejected. Uses the same Better Auth user record, not a second identity model. |
| Direct email update | REJECT | Would bypass Better Auth verification. Defer to Better Auth `changeEmail` once verification delivery is configured. |
| `settings.getPreferences/updatePreferences` | LEGITIMATE ADDITION | Protected, no `userId` input; lazily creates defaults and updates only the authenticated user's row. |
| `settings.listSessions/revokeSession/revokeOtherSessions` | LEGITIMATE CORRECTION | Thin wrappers over Better Auth's existing `sessions` table, returning no session tokens and filtering by `ctx.user.id`. No custom session table. |
| `settings.changePassword` tRPC route | DEFER | Better Auth officially supports `changePassword`; expose a thin mobile client wrapper instead of handling passwords in tRPC/SQL. |
| Auth client password wrapper | LEGITIMATE ADDITION | Calls Better Auth `POST /change-password`; no password storage or hashing in this repository code. |
| `settings.deleteAccount` | LEGITIMATE ADDITION | Guarded application-level account deletion over Better Auth-owned tables: reject sole-owner accounts, write an audit event, delete sessions, then delete the user so FK rules clean up account-owned data. |
| Better Auth `deleteUser` direct client call | REJECT | Current config does not enable it, and a direct client call would bypass the organization sole-owner guard. |
| Delayed hard-delete job | DEFER | No scheduler/grace-period infrastructure exists. This milestone performs an explicit immediate delete only; eventual delayed hard-delete lifecycle is not claimed. |
| New settings permission | REJECT | User settings are self-scoped and do not require organization RBAC. |
| R2/avatar upload | DEFER | Storage is Phase 3.4; only existing safe remote `users.image` references are supported. |
| Push/Expo notification runtime | DEFER | Only preference persistence is in scope. |

## Legitimate schema changes

### CHANGE: `user_preferences` table

- **WHY:** Persist existing theme/locale and required user-level notification preferences without mixing them into organizations or auth credentials.
- **SOURCE:** Phase 3 ERD `user_preferences`, existing local settings/i18n implementation, milestone requirements.
- **SAFE MIGRATION:** Create new table with `user_id text primary key references users.id on delete cascade`; all preference values have safe defaults; quiet-hour columns nullable. No backfill is required; API creates rows lazily.
- **AFFECTED PACKAGE:** `@repo/database`, `@repo/api`, mobile settings screen.
- **TEST REQUIRED:** defaults, valid/invalid enum values, strict quiet-hour pair validation, user isolation, lazy creation.

### CHANGE: `locale` and `theme` enums

- **WHY:** Keep database values aligned with the finite app-supported values and prevent arbitrary strings.
- **SOURCE:** Existing `settings-store.ts` and `i18n/index.ts`.
- **SAFE MIGRATION:** Create additive PostgreSQL enums before the new table; no existing type changes.
- **AFFECTED PACKAGE:** `@repo/database`, `@repo/api`.
- **TEST REQUIRED:** accepted values and rejected values through Zod/API validation.

## Profile and authorization assessment

- Better Auth remains the system of record for `users`, `accounts`, and `sessions`.
- `settings.getProfile` and `settings.updateProfile` derive identity exclusively from `ctx.user.id`; no user id appears in input.
- Profile update accepts trimmed name and URL/null image only. Email is not accepted by the schema, so direct email mutation is impossible through this route.
- `users.image` remains the one canonical avatar reference. No `avatar_url`, upload, R2, or temporary file endpoint is added.
- Organization membership is not required for user-level settings. Organization name/team/roles/billing remain in their existing domains.

## Preferences assessment

- Defaults: `locale=en`, `theme=system`, `marketingOptIn=false`, `inviteEmails=true`, `billingAlerts=true`, both quiet-hour values null.
- `getPreferences` lazily creates the row, preserving all existing users without a destructive backfill.
- `updatePreferences` merges the current row with the patch before validating quiet-hour pair completeness. A partial update can preserve an existing pair; clearing requires both values null.
- Quiet hours validate exactly `(?:[01]\\d|2[0-3]):[0-5]\\d`; timezone/scheduling semantics are intentionally deferred.
- Local Zustand remains immediate rendering/cache state. Server preferences are the persistent source; the mobile settings screen loads and updates them through tRPC and mirrors theme/locale locally.

## Session/security assessment

- Better Auth has real session endpoints, but the current mobile client does not expose typed methods. The new settings wrappers operate on the existing Better Auth `sessions` table and never return `sessions.token`.
- `listSessions` filters by authenticated user and returns only id, timestamps, IP/user-agent metadata, and a current-session boolean.
- `revokeSession` matches both session id and authenticated user id; a user cannot revoke another user's session by id.
- `revokeOtherSessions` preserves only `ctx.sessionId`; if the current server context lacks a session id, it fails closed.
- Password changes call Better Auth's official endpoint from `packages/auth`; no SQL or custom hash operation is introduced.
- Email changes remain deferred until Better Auth verification email delivery is configured.

## Account deletion decision

**Selected model:** application-level immediate deletion with session revocation, using Better Auth's existing Drizzle tables.

Reasoning:

1. The official Better Auth delete endpoint exists but is not enabled in the current `getAuth()` configuration.
2. Calling a direct client delete endpoint would bypass the Phase 3.2 ownership invariant.
3. A soft-delete `deleted_at` field would require modifying context/authentication flows so deleted users cannot sign in or retain cached sessions; that lifecycle is not currently specified or configured.
4. The smallest safe implementation is a protected tRPC route that checks ownership, writes an audit event, deletes all user sessions, then deletes the Better Auth user row. Existing FK rules clean up account-owned records; audit user FK is `set null`.

Safety rules:

- For every organization where the user is an owner, count owners. If any organization would have zero owners after deletion, return `PRECONDITION_FAILED` with `ownership_transfer_required`.
- Ownership transfer from Phase 3.2 must occur first.
- After deletion, the current session is removed and the mobile client clears its local session state.
- This is immediate account deletion, not a delayed grace-period system. Hard-delete scheduling/eventual purge remains deferred.

## Email provider assessment

`RESEND_API_KEY` exists in the private environment schema, but there is no sender implementation or configured sender address. No credentials are added or exposed. This milestone does not invent a fake sender. Profile/account operations report their own result; email change and actual preference-driven delivery remain deferred.

## Rejected / deferred changes

- Duplicate `users.avatar_url`: rejected; use `users.image`.
- `users.deleted_at`: deferred pending an auth-aware soft-delete/grace design.
- Direct email update: rejected; Better Auth verification required.
- Password SQL/custom hashing: rejected; use Better Auth.
- R2/avatar upload, push tokens, Expo notifications, PostHog, Sentry, organization settings, billing settings, and broad hardening: deferred to their milestones.
- New settings/RBAC permission: rejected; self-scoped user settings do not need organization permission.

## Implementation plan

1. Add `locale`, `theme`, and `user_preferences` using one additive Drizzle migration.
2. Add pure settings validation helpers and tests first.
3. Add protected profile/preferences/session/delete procedures with user-id derivation and owner guard.
4. Add Better Auth client wrappers for official profile/password operations and a local-session clear method.
5. Extend the existing settings screen with server-backed profile/preferences/security controls; retain existing theme/i18n infrastructure.
6. Exercise the real PostgreSQL/tRPC flow, full test suite, migration drift, and bundle secret scan.
7. Document statuses and commit/push after validation.

## Risks

| Risk | Mitigation |
|---|---|
| Existing Better Auth client cookies/session behavior differs by native/web runtime | Keep password/profile calls behind the existing auth client; server settings routes remain independently protected and tested. |
| Immediate deletion lacks a grace window | Explicitly documented; delayed hard-delete lifecycle is deferred, and sole-owner guard prevents orphaned organizations. |
| User deletes an account while stale local auth remains | Server deletes all sessions; mobile clears local session only after successful server response; next server request cannot authenticate. |
| Preference row creation races | Lazy creation catches unique violation and rereads the row. |
| Private profile image URL is not storage-backed | Existing `users.image` is only a validated URL reference; actual avatar upload remains Phase 3.4. |
| Session metadata may contain sensitive network data | Only the authenticated user can read their own rows; tokens/passwords are never returned. |

## Audit conclusion

No fundamental conflict was found. The legitimate 3.3 delta is the additive `user_preferences` table plus finite locale/theme enums, protected settings procedures, Better Auth password/profile wrappers, existing-session wrappers, and guarded immediate account deletion. Proceed without implementing Storage, Notifications runtime, Analytics, Monitoring, or other later milestones.
