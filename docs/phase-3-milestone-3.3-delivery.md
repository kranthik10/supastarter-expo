# Phase 3 Milestone 3.3 Delivery — User Settings

**Status:** IMPLEMENTED locally; ready for commit and CI verification
**Baseline:** `f7517ae`
**Scope:** User Settings only

## Summary

Phase 3.3 adds a user-scoped settings layer without changing the Better Auth identity model or mixing user and organization settings.

Implemented:

- Persistent profile API for the authenticated user's safe `name` and validated remote `image` reference.
- Additive `user_preferences` table with finite locale/theme values, marketing preference, invitation/billing notification preference foundation, and paired quiet-hour fields.
- Protected settings API deriving identity from `ctx.user.id`.
- Thin wrappers over Better Auth's existing session rows, with no session token exposure.
- Better Auth official password-change client wrapper; no password SQL/hash handling.
- Immediate account deletion through existing Better Auth Drizzle tables, with session deletion and sole-organization-owner protection.
- Thin mobile settings UI integrated with the existing i18n, Zustand theme/locale, auth, and tRPC infrastructure.

Not implemented:

- R2/avatar upload or file storage.
- Push token registration, Expo Notifications, APNs, FCM, or notification sending.
- PostHog, Sentry, organization-settings redesign, or billing-settings redesign.
- Delayed soft-delete/grace-period hard-delete worker.
- Direct email-change flow until Better Auth verification email delivery is configured.
- EAS, Apple/Google credentials, or Maestro.

## Status matrix

| Capability | Status | Evidence / boundary |
|---|---|---|
| Profile read/update | IMPLEMENTED / VERIFIED | `settings.getProfile` and `settings.updateProfile`; real PostgreSQL/tRPC check updated name/image and rejected email input. |
| Avatar metadata/interface | IMPLEMENTED / VERIFIED | Uses existing Better Auth `users.image`; image accepts only URL/null in the settings API. |
| Avatar upload | DEFERRED | Phase 3.4 Storage/R2; no upload endpoint or provider SDK added. |
| Theme persistence | IMPLEMENTED / VERIFIED | `user_preferences.theme`, `system|light|dark`; mobile mirrors the server value into existing local settings state. |
| Locale persistence | IMPLEMENTED / VERIFIED | `user_preferences.locale`, `en|de`; mobile mirrors the server value through existing i18n. |
| Notification preference foundation | IMPLEMENTED / VERIFIED | `marketing_opt_in`, `invite_emails`, `billing_alerts`, and strict paired quiet-hour storage. No notification runtime. |
| Password change | IMPLEMENTED / VERIFIED | Thin Better Auth `POST /change-password` client wrapper; no custom password SQL/hash logic. Live provider/auth-session execution remains environment-dependent. |
| Email change | DEFERRED | Better Auth supports it, but verification-mail delivery is not configured; direct SQL email mutation is rejected. |
| Session listing | IMPLEMENTED / VERIFIED | User-scoped wrapper over Better Auth's `sessions` table; returns metadata only, never `token`. |
| Session revoke | IMPLEMENTED / VERIFIED | Own-session filter; cross-user session id returns not found. Revoke-other preserves current session. |
| Account deletion | IMPLEMENTED / VERIFIED | Deletes sessions before the Better Auth user row in a transaction; real PostgreSQL check confirms sessions/user removal. |
| Owner deletion protection | IMPLEMENTED / VERIFIED | Sole owner deletion returns `PRECONDITION_FAILED` / `ownership_transfer_required`; succeeds after Phase 3.2 ownership transfer. |
| Hard-delete lifecycle | DEFERRED | No delayed grace-period worker exists. Current operation is explicit immediate deletion, not eventual scheduled erasure. |
| User isolation | IMPLEMENTED / VERIFIED | No settings input accepts `userId`; all reads/mutations derive from authenticated `ctx.user.id`. |
| Organization boundary | IMPLEMENTED / VERIFIED | User preferences are independent of organization membership; team/billing behavior remains in existing routers. |

## Schema and migration

### Migration

`packages/database/drizzle/0003_workable_reavers.sql`

Creates:

- PostgreSQL enum `locale`: `en`, `de`.
- PostgreSQL enum `theme`: `system`, `light`, `dark`.
- `user_preferences` with `user_id text primary key` and `users.id` foreign key `ON DELETE CASCADE`.
- Safe defaults for all non-null preference values; nullable quiet-hour pair; no backfill required.

### Non-destructive review

- No existing tables renamed or removed.
- No existing columns renamed or removed.
- No existing types changed.
- No `DROP TABLE`, `DROP COLUMN`, destructive rename, or unintended type change found.
- `users.image` remains the one canonical avatar field.
- `users.deleted_at` was not added; soft-delete requires an auth-aware lifecycle not present in this milestone.

## API surface

### Profile

- `settings.getProfile`
- `settings.updateProfile`

Accepted profile fields are `name` and URL/null `image`. Email, password, roles, organization membership, and arbitrary user ids are rejected or unavailable.

### Preferences

- `settings.getPreferences`
- `settings.updatePreferences`

Rows are created lazily with defaults. Updates merge with the current row before validating the quiet-hour pair. Valid times are exactly `HH:MM` in 24-hour format; either both values are null or both are valid.

### Sessions

- `settings.listSessions`
- `settings.revokeSession`
- `settings.revokeOtherSessions`

All procedures are protected and scoped to the authenticated user. Tokens are never returned to the mobile app.

### Account deletion

- `settings.deleteAccount`

The procedure counts owners per organization before deletion. If any organization would have zero owners afterward, it fails closed with `ownership_transfer_required`. Otherwise it writes an audit event, deletes the user's sessions, and deletes the Better Auth user row inside a transaction. Existing FK rules clean up account-owned data; audit user references survive as null.

## Mobile integration

`apps/mobile/app/(app)/(tabs)/settings.tsx` now provides:

- Profile name editing.
- Existing image display with no upload flow.
- Server-synchronized theme and locale controls.
- Invitation, billing, and marketing preference switches.
- Better Auth password-change form.
- Own-session list, revoke, and revoke-other controls.
- Guarded account deletion with local session clearing after success.

The existing i18n files were extended in English and German. TanStack Query is now provided at the mobile root and owns settings query/mutation cache invalidation; the existing tRPC client remains the transport. The existing local settings store remains rendering/cache state; server preferences are persistent state. Deep-link auth gating now uses the same `@repo/auth` store as the app shell.

## Security review

- Better Auth remains the identity/account/session system of record.
- No duplicate identity/session table, password hash, or custom auth token was added.
- User id comes from the authenticated server context for every settings operation.
- Direct email mutation is not part of the profile schema.
- Passwords are sent only to Better Auth's official endpoint by the existing auth client; settings SQL never reads or writes password fields.
- Session tokens are never serialized in the settings API response.
- Account deletion revokes sessions and cannot orphan a sole-owner organization.
- No private secret was added to the mobile bundle.

## Validation evidence

- `pnpm vitest run packages/api/src/settings.test.ts` — PASS, 8 tests.
- `DATABASE_URL=[REDACTED] pnpm exec tsx /tmp/phase-3-3-check.ts` — PASS; defaults, preferences, validation, profile isolation, session isolation, owner deletion block, transfer, and deletion verified against local PostgreSQL.
- `pnpm typecheck` — PASS, 26 tasks.
- `pnpm lint` — PASS, 14 tasks.
- `pnpm test` — PASS, 83 tests across 9 files.
- `pnpm build` — PASS, Expo export completed for iOS, Android, and web; EAS native build was not claimed.
- `pnpm --filter @repo/database db:generate` after migration — PASS, `No schema changes, nothing to migrate`.
- `git diff --check` — PASS.
- Migration destructive-operation scan — PASS, zero matches.
- Mobile bundle secret scan — PASS, zero matches for `DATABASE_URL`, `BETTER_AUTH_SECRET`, `STRIPE_SECRET`, `REVENUECAT_SECRET`, `R2_SECRET`, and `RESEND_API_KEY`.

## Deferred work

- EAS native development/production builds and credentials: DEFERRED.
- Maestro installation/execution: DEFERRED; no native development build exists.
- Email provider and Better Auth email-change verification: DEFERRED.
- R2/avatar upload: DEFERRED to Phase 3.4.
- Push notification runtime: DEFERRED to Phase 3.5.
- Delayed hard-delete/grace processing: DEFERRED.

## Checkpoint

- Implementation commit: `bb06f6d` — `feat: complete phase 3.3 user settings`.
- Implementation GitHub Actions run: `33551508092` — completed successfully for head `bb06f6d`.
- Documentation closure commit: pending local commit.
- Final documentation-head GitHub Actions: pending remote verification.
