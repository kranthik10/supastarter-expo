# Phase 3 Milestone 3.5 Delivery — Notifications

**Status:** IMPLEMENTED locally; ready for implementation commit and CI verification
**Baseline:** `bba03eb`
**Scope:** In-app notification history, push-token/device registration, server provider abstraction, preference enforcement, safe deep links, and thin mobile notification center

## Summary

Phase 3.5 replaces the notification push stub with a server-authoritative foundation:

- Protected tRPC procedures for push-token registration/unregistration, bounded notification listing, unread count, mark-read, and mark-all-read.
- Additive PostgreSQL schema delta for token invalidation, notification category, organization context, and hot-path indexes.
- `@repo/notifications` client-safe Expo permission/token helpers and shared policy.
- `@repo/notifications/server` server-only Expo, fake, not-configured providers, and notification creation/delivery service.
- In-app notification persistence before push I/O; provider failures cannot erase history.
- Existing Phase 3.3 `user_preferences` consumed for billing push gating; no second preference model.
- Safe route metadata allowlist; invitation bearer tokens are never notification payload data.
- Contextual settings action for native push registration, best-effort unregister before logout, and a mobile notification-center tab.
- A trusted invitation-accepted event creates a team notification for the inviter without adding a client-controlled send endpoint.

## Status matrix

| Capability | Status | Evidence / boundary |
|---|---|---|
| Audit | VERIFIED | `docs/phase-3-milestone-3.5-audit.md`; no fundamental conflict |
| In-app notification persistence | IMPLEMENTED / VERIFIED | `createNotification` inserts before provider I/O; real PostgreSQL probe passed |
| Notification list | IMPLEMENTED / VERIFIED | Protected `notifications.list`, bounded cursor, max 100 |
| Unread count | IMPLEMENTED / VERIFIED | User-scoped `read_at IS NULL` query and index |
| Mark read | IMPLEMENTED / VERIFIED | User + notification ID predicate; cross-user IDOR returns not found |
| Mark all read | IMPLEMENTED / VERIFIED | Caller-only user predicate |
| Pagination | IMPLEMENTED / VERIFIED | Cursor over `(created_at, id)`, default 20, max 100 |
| Organization context | IMPLEMENTED / VERIFIED | Nullable FK, `ON DELETE SET NULL`; membership checked on creation and never used to bypass recipient scope |
| User isolation | IMPLEMENTED / VERIFIED | All reads/updates derive `ctx.user.id`; PostgreSQL/tRPC probe passed |
| Push-token registration | IMPLEMENTED / VERIFIED | Authenticated, validated Expo token; transactional device/token registration |
| Registration idempotency | IMPLEMENTED / VERIFIED | Same installation/token updates one row; probe passed |
| Token rotation | IMPLEMENTED / VERIFIED | Active prior token for same user/install receives `invalidated_at`; probe passed |
| Token invalidation | IMPLEMENTED / VERIFIED | Logout/unregister and immediate `DeviceNotRegistered` outcomes invalidate rows |
| Logout token lifecycle | IMPLEMENTED / VERIFIED | Mobile attempts installation-scoped unregister before sign-out; failure does not block logout |
| Notification provider abstraction | IMPLEMENTED / VERIFIED | `NotificationProvider` server seam |
| Expo push provider | IMPLEMENTED / PARTIAL | Server-only Expo Push API adapter; no external request made locally |
| Fake provider | IMPLEMENTED / VERIFIED | Provider tests and real PostgreSQL notification probe |
| Not-configured provider | IMPLEMENTED / VERIFIED | Returns `not_configured`, never false acceptance |
| Preference enforcement | IMPLEMENTED / VERIFIED | `billing_alerts=false` skips push while preserving the row; probe passed |
| Quiet-hours storage | IMPLEMENTED / VERIFIED | Phase 3.3 `user_preferences.quiet_hours_start/end` retained |
| Quiet-hours enforcement | DEFERRED | No timezone model; no locale/IP/server-time inference |
| Deep-link safety | IMPLEMENTED / VERIFIED | Safe route/org metadata allowlist; raw invite route rejected; client validates again |
| Native push registration | IMPLEMENTED / PARTIAL | Expo permission/token path handles web/simulator/no project ID gracefully |
| Mobile notification center | IMPLEMENTED / VERIFIED | Tab screen with list, unread count, read state, mark-all, load-more, empty/error/loading states |
| Invitation event integration | IMPLEMENTED / VERIFIED | Acceptance creates a team notification for inviter after transaction |
| Push receipt handling | PARTIAL | Immediate ticket parsing handles `DeviceNotRegistered` |
| Scheduled receipt reconciliation | DEFERRED | No worker/queue added |
| Real physical-device push | DEFERRED | EAS/native build and APNs/FCM credentials unavailable; no success claimed |
| Email delivery | DEFERRED | Existing Phase 3.2 email provider remains separate and not configured |

## Schema and migration

Migration: `packages/database/drizzle/0005_many_virginia_dare.sql`

Adds:

- Nullable `push_tokens.invalidated_at`.
- Non-null `notifications.category` with safe default `system`.
- Nullable `notifications.organization_id` referencing `organizations.id` with `ON DELETE SET NULL`.
- `notifs_user_read_created_idx` and `notifs_org_idx`.
- `push_tokens_device_idx` and `push_tokens_user_active_idx`.

The migration is additive and non-destructive. Existing columns/tables remain; no unsafe non-null addition, drop, or rename was generated. The migration was applied to local `mobile_saas_dev`; readback confirmed all columns, indexes, and FK actions.

## API surface

Protected procedures:

- `notifications.registerPushToken({ token, platform, installationId, appVersion? })`
- `notifications.unregisterPushToken({ installationId, token? })`
- `notifications.list({ limit?, cursor? })`
- `notifications.getUnreadCount()`
- `notifications.markRead({ notificationId })`
- `notifications.markAllRead()`

The API never accepts a caller-supplied recipient user ID. There is no client procedure for arbitrary notification creation or push sending.

## Provider and delivery boundary

- Client root: `@repo/notifications` — Expo permission/token APIs and safe shared types only.
- Shared policy: `@repo/notifications/policy` — Expo token validation, finite category set, safe metadata, cursor encoding.
- Server path: `@repo/notifications/server` — Expo HTTP provider, fake provider, not-configured provider, persistence/delivery service.
- `EXPO_ACCESS_TOKEN` is read only in the server provider factory. No notification provider secret, APNs private credential, FCM server credential, or database package is imported by the mobile notification package path.
- Expo ticket acceptance is reported separately from device delivery. Immediate `DeviceNotRegistered` failures invalidate token rows.

## Preference and quiet-hours semantics

The service consumes Phase 3.3 `user_preferences`:

- `billingAlerts=false` skips billing push only; the in-app notification persists.
- `inviteEmails` remains an email preference and does not suppress team in-app history or push in this V1 model.
- Quiet-hour values remain stored as paired strict `HH:MM` values. Enforcement is deferred because no user timezone is modeled and no delivery queue exists.

## Mobile behavior

- `expo-notifications` `~0.32.16` and its config plugin were added for SDK 57.
- Settings requests permission only after the user presses “Enable push notifications”.
- Web, simulator, and placeholder EAS project configuration return an unavailable/denied result without crashing.
- Installation identity is an opaque locally persisted `install_*` value; no permanent hardware identifier is claimed.
- Notification taps are accepted only after safe metadata validation and route through the existing app/deep-link gate.
- Invitation bearer tokens remain confined to the existing invitation flow and are never copied to notification data.

## Tests and validation

### Focused tests

- Notification policy/provider/API/mobile focused suites: **13 PASS**.
- Full suite: **111 PASS across 17 files**.
- Existing 98 tests remain passing; no prior test was removed or weakened.

### Real PostgreSQL/tRPC integration

`pnpm exec tsx /tmp/phase-3-5-check.ts` — PASS against local PostgreSQL with fake provider. Verified:

- Token registration idempotency and rotation.
- Invalid Expo token rejection and cross-user device ownership rejection.
- Notification persistence and organization context.
- Billing preference skip with retained in-app row.
- Provider invalid-token invalidation and provider-failure row preservation.
- Bounded cursor pagination and user isolation.
- Unread count, mark-read, and caller-only mark-all-read.
- Unsafe invitation-token route rejection.
- Logout/unregister invalidation.
- User-deletion notification/token cascades.

### Canonical checks

- `pnpm typecheck` — PASS, 26 tasks.
- `pnpm lint` — PASS, 14 tasks.
- `pnpm test` — PASS, 111 tests across 17 files.
- `pnpm build` — PASS, Expo export completed for iOS, Android, and web. This is not an EAS native build.
- `pnpm --filter @repo/database db:generate` — PASS, no schema changes after migration generation.
- Migration destructive-operation scan — PASS, zero matches.
- `git diff --check` — PASS.
- `pnpm install --frozen-lockfile` — PASS.
- Mobile bundle scan — PASS, zero matches for private notification/provider identifiers and no server notification module/database import in generated bundles.

## Regression boundary

Phase 3.1 billing/entitlements, Phase 3.2 team/invitations/ownership transfer, Phase 3.3 settings/preferences/sessions/account deletion, and Phase 3.4 storage/avatar/quota remain covered by the full suite and canonical typecheck/lint/build checks. No Analytics, Monitoring, EAS, or Maestro work was added.

## Deferred work

- Real Expo/APNs/FCM physical-device round trip: DEFERRED until EAS/native credentials and build exist.
- Scheduled Expo receipt reconciliation: DEFERRED.
- Quiet-hours enforcement: DEFERRED until timezone and deferral semantics are designed.
- Email delivery provider and verified email-change flow: DEFERRED.
- Distributed rate limiting and background job infrastructure: DEFERRED.
- Phase 3.6 Analytics and later milestones: NOT STARTED.

## Checkpoint

- Implementation commit: pending.
- Implementation GitHub Actions run: pending.
- Documentation closure commit: pending.
- Final-head GitHub Actions run: pending.
