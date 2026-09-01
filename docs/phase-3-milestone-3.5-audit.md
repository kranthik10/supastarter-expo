# Phase 3 Milestone 3.5 Audit — Notifications

**Status:** PASS WITH WARNINGS — implementation may proceed
**Baseline:** `bba03eb`
**Previous milestone:** Phase 3.4 Storage
**Scope:** In-app notifications, Expo push token registration, server-side delivery seam, preference enforcement, and a thin mobile notification center

## 1. Baseline verification

- Repository: `kranthik10/supastarter-expo`
- Branch: `main`
- Baseline: `bba03eb` is present locally and `origin/main` is aligned.
- Working tree: no unexpected source changes; `.env.development` remains intentionally untracked.
- Phase 3.4 remains implemented and documented at the baseline.
- EAS, Maestro, real R2/S3 upload, scheduled orphan cleanup, email delivery, and distributed rate limiting remain deferred.

## 2. Existing capability inventory

| Area | Current state | Classification |
|---|---|---|
| `devices` table | Exists with `id`, `user_id`, `platform`, optional `app_version`, and `created_at`; FK cascade to users | MATCH; preserve semantics |
| `push_tokens` table | Exists with device/user FKs, unique token, provider default `expo`, and created timestamp | MATCH; add lifecycle/registration semantics |
| `notifications` table | Exists with user, title, nullable body/data, read timestamp, created timestamp, and user index | MATCH; add category/org context and read hot-path index |
| `user_preferences` | Implemented in Phase 3.3 with `invite_emails`, `billing_alerts`, paired `quiet_hours_start/end`, locale, theme, marketing opt-in | MATCH; consume as the only preference source |
| Push mobile helper | Stub only: permission returns false on native and token always null; uses legacy REST `/push/register` | LEGITIMATE CORRECTION; replace with Expo Notifications + tRPC |
| `packages/notifications` | Stub package imports `@repo/api` and exposes no server provider seam | LEGITIMATE CORRECTION; split client-safe and server-only exports |
| Expo Notifications | Not installed in `apps/mobile` | LEGITIMATE ADDITION; add official SDK-57-compatible dependency |
| Expo provider | Not implemented | LEGITIMATE ADDITION; server-side HTTP provider using Expo Push Service |
| Fake/not-configured provider | Not implemented | LEGITIMATE ADDITION; deterministic tests and safe local behavior |
| Notification API | No notification router/procedures found | LEGITIMATE ADDITION; protected tRPC procedures |
| Notification UI | No notification center route/screen found | LEGITIMATE ADDITION; thin list/read screen |
| Deep links | Existing parser supports invite, organization, settings, and billing; unknown paths fall through | LEGITIMATE CORRECTION; add safe notification routes without accepting bearer data |
| Auth context | `ctx.user` is loaded from the current Better Auth session; `ctx.user.id` is authoritative | MATCH |
| Account deletion | Existing Better Auth deletion removes owned rows through FK cascade | MATCH; verify notification/token cleanup |
| Logout | Auth client clears the local session; no notification-token association lifecycle exists | LEGITIMATE ADDITION; best-effort unregister before local sign-out |

## 3. Reconciliation with Phase 3 notification architecture

### 3.1 Preference model

The Phase 3.3 implementation uses the normalized `user_preferences` table, not the draft ADR’s `users.notificationPreferences` JSONB. No second preference system will be introduced. Existing fields are sufficient for V1 category/channel gating:

- `invite_emails` remains an email preference and does not suppress in-app history.
- `billing_alerts` gates billing push delivery while preserving in-app notification rows.
- `quiet_hours_start` and `quiet_hours_end` are stored as strict `HH:MM` pairs.
- No user timezone is currently modeled. Quiet-hours enforcement will therefore remain deferred rather than infer timezone from locale, IP, or server location.

### 3.2 Device and installation semantics

`devices.id` is the application’s device/install association key. The schema does not prove a permanent physical hardware identifier and the implementation will not claim one. Registration will accept a client-generated installation identifier persisted locally by the mobile app. A device record is user-owned; changing users on the same installation must not inherit the previous user’s token association.

### 3.3 Push token lifecycle

The existing global unique token is retained. `push_tokens.invalidated_at` will be added as a nullable lifecycle marker. Registration will be idempotent for the authenticated user/device/token tuple, handle rotation by invalidating or replacing the previous token for that installation, and reject invalid token formats. Delivery will select only rows with `invalidated_at IS NULL` and current user ownership.

### 3.4 Notification data and security

Notification metadata will be constrained to safe routing context, represented as `{ route?: string; orgId?: string }`. Accepted routes are an explicit allowlist of app screens. Raw invitation tokens, password-reset tokens, session tokens, presigned URLs, credentials, and PII-rich payloads are forbidden. Existing invite deep links remain separate and continue to use the authenticated server redemption path.

### 3.5 Organization context

`notifications.organization_id` will be nullable and reference `organizations.id` with `ON DELETE SET NULL`, preserving a user’s notification history if an organization is deleted. Organization context is descriptive and never an authorization grant: list/read operations always scope by `notifications.user_id = ctx.user.id`.

### 3.6 Category model

A small finite server-side category union will be used: `team`, `billing`, `security`, and `system`. The union is shared with mobile as a client-safe type. V1 does not add a large template/catalog system.

### 3.7 Delivery architecture

The notification service will persist the in-app row before attempting push and will never hold a database transaction open across provider I/O. It will return separate persistence, attempt, provider-acceptance, failure, and invalid-token outcomes. Provider acceptance will not be described as device delivery.

The server package boundary will be:

- `@repo/notifications` — client-safe Expo registration/types only.
- `@repo/notifications/server` — server-only provider and delivery types; no mobile import.
- `@repo/notifications/policy` — pure shared validation and safe metadata policy.

No notification provider credentials will be accepted by mobile or returned through API responses. The Expo provider will use server-only configuration when configured; the not-configured provider will fail closed without falsely reporting acceptance. A fake provider will support integration tests.

### 3.8 Provider receipts

Immediate Expo ticket failures will be parsed, including clearly invalid-token responses. A receipt-processing service seam may be provided if it stays small. Scheduled receipt reconciliation and worker infrastructure are deferred. No webhook or background delivery system will be fabricated.

## 4. Proposed schema delta

| Change | Classification | Rationale |
|---|---|---|
| `push_tokens.invalidated_at timestamptz NULL` | LEGITIMATE ADDITION | Prevents invalid tokens from future selection and models token lifecycle |
| `notifications.category text NOT NULL DEFAULT 'system'` | LEGITIMATE ADDITION | Finite category routing with safe migration for existing rows |
| `notifications.organization_id text NULL REFERENCES organizations(id) ON DELETE SET NULL` | LEGITIMATE ADDITION | Preserves org-aware context without requiring org context for personal/security notices |
| `notifications.data` | MATCH | Existing JSONB column retained; API validates a constrained safe shape |
| `notifications` user/read index | LEGITIMATE ADDITION | Supports bounded list, unread count, and mark-all-read queries |
| New preference table/JSONB | REJECT | Phase 3.3 `user_preferences` is already authoritative |
| `devices` permanent hardware identifier | REJECT | Existing schema does not guarantee hardware identity; installation semantics are sufficient |
| `users.notificationPreferences` | REJECT | Conflicts with implemented normalized preference model |
| Notification templates/CMS, email/SMS, job queue | DEFER | Outside V1 milestone scope |

All schema changes will be additive, migration-safe, and reviewed for destructive SQL before application.

## 5. API surface to implement

Protected procedures will derive identity exclusively from `ctx.user.id`:

- `notifications.registerPushToken`
- `notifications.unregisterPushToken`
- `notifications.list` with bounded cursor/limit behavior
- `notifications.getUnreadCount`
- `notifications.markRead`
- `notifications.markAllRead`

Trusted server code will call the notification creation service; no normal mobile procedure will accept arbitrary recipient/title/body and send a push.

## 6. Mobile scope

- Add `expo-notifications` through the Expo SDK-57-compatible official dependency.
- Keep registration contextual: a settings action can request permission and register; startup will not prompt automatically.
- Handle web, simulator, and missing native project configuration without crashing.
- Add a thin notification center with list, unread count, mark read, mark all read, loading/error/empty states, and safe route navigation.
- Add safe notification deep-link routes while preserving the existing invitation token path and never logging or embedding invitation bearer tokens in notification metadata.
- Attempt token unregister on logout before clearing local auth state; failure must not trap logout.

## 7. Validation plan

- Focused Vitest coverage for token format/lifecycle, preference enforcement, safe metadata, provider outcomes, in-app persistence/list/read isolation, pagination bounds, and organization context.
- Real PostgreSQL integration probe for migration constraints, token invalidation/selection, notification ownership isolation, and cascade behavior.
- Full `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and database drift generation check.
- Mobile bundle scan for database imports, server provider code, notification provider secrets, `EXPO_ACCESS_TOKEN`, APNs credentials, and FCM server credentials.
- Real physical-device push remains unverified until EAS/native credentials and a device build exist.

## 8. Explicit deferrals

| Capability | Status at audit |
|---|---|
| In-app notification persistence | To implement |
| Push provider abstraction | To implement |
| Expo push provider | To implement server-side |
| Fake provider | To implement/test |
| Native push registration | To implement; real native execution deferred |
| Real physical-device push | DEFERRED — EAS/APNs/FCM credentials unavailable |
| Push receipts | Immediate ticket parsing may be implemented; full reconciliation deferred |
| Scheduled receipt reconciliation | DEFERRED |
| Quiet-hours storage | IMPLEMENTED in Phase 3.3 |
| Quiet-hours enforcement | DEFERRED — no timezone model |
| Email delivery | DEFERRED |
| Analytics/monitoring | OUT OF SCOPE — Phase 3.6+ |

## 9. Fundamental conflict check

No fundamental architectural conflict was found. The approved dependency direction and Better Auth identity boundary remain intact. The only draft corrections are to use the implemented normalized preferences model, preserve installation rather than hardware identity claims, and split client-safe notification registration from server-only provider code.
