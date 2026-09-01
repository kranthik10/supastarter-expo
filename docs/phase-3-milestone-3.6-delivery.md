# Phase 3 Milestone 3.6 Delivery — Analytics

**Status:** Implementation CI-verified; documentation closure pending
**Baseline:** `7f6be9b`
**Previous milestone:** Phase 3.5 Notifications
**Scope boundary:** Analytics only. Phase 3.7 Monitoring/Sentry was not started.

## Implemented

### Abstraction and provider boundary

- Replaced the console analytics stub with a typed client-safe facade in `@repo/analytics`.
- Added `@repo/analytics/policy` for the central event catalog, runtime event/property validation, safe identify traits, distinct-ID validation, and logical screen-name mapping.
- Added `@repo/analytics/server` as a separate server-only export.
- Added a fetch-based `PostHogAnalyticsProvider` for the client using only the public project key/host.
- Added `PostHogServerAnalyticsProvider` using only private `POSTHOG_SERVER_KEY` when configured.
- Added `FakeAnalyticsProvider` and `NoopAnalyticsProvider`.
- Provider errors are swallowed and never fail or roll back product operations.

### Event and privacy contract

- Naming convention: `lower_snake_case`, product-level `verb_subject` events.
- Catalog includes auth, organization, invitation, notification, push-permission, settings, screen, storage, and billing-intent events.
- Event property keys and scalar values are runtime-validated; arbitrary nested metadata is rejected.
- Raw email tracking: disabled.
- Raw full-name tracking: disabled.
- Distinct ID: authenticated internal Better Auth user ID only.
- Identify traits: `locale`, `theme`, `plan`, `app_variant`, and `app_version` only.
- Forbidden keys include password, token variants, authorization/cookie, secret/API key, signed URL fields, invitation token, email, name, phone, and address.
- Dynamic routes and query strings are sanitized at the Expo Router boundary; `/invite/<token>` becomes `invite`.

### Consent and lifecycle

- Added `user_preferences.analytics_enabled boolean NOT NULL DEFAULT true` through additive migration `0006_high_jazinda.sql`.
- Kept analytics consent distinct from existing `marketing_opt_in`.
- Analytics starts disabled and is enabled only after authenticated server preferences load successfully.
- Disablement makes capture, identify, group, and screen no-ops and resets provider identity.
- Logout and user changes reset identity.
- Added a transient Better Auth auth-event marker so the app root can distinguish successful sign-in/sign-up without coupling the auth package to analytics.
- Added a Settings toggle with localized English/German labels.

### Organization and server-authoritative events

- Active organization is sent through provider-independent `group('organization', organizationId)` context.
- Organization switches update the group and emit only `organization_switched` with an opaque internal organization ID.
- API emits `organization_created` after successful organization creation.
- API emits `invitation_accepted` after successful invitation acceptance.
- Client code does not duplicate those logical server-authoritative events.

### Existing milestone integrations

- Notification opened/read events include category and optional organization context only; notification title/body is not sent.
- Push permission changes emit only `granted`, `denied`, or `unavailable`.
- Settings emits only safe changed field/category events.
- Existing auth analytics calls that used old names and raw email/name were removed or replaced with safe lifecycle handling.

## Verification

- Analytics policy/provider/settings tests: **20 PASS** across catalog, sanitation, identity, screen, fake/no-op, PostHog, consent, and failure isolation behavior.
- Full test suite: **123 PASS** across 20 test files.
- Full typecheck: **26/26 tasks PASS**.
- Full lint: **14/14 tasks PASS**.
- Expo build/export: **PASS** for iOS, Android, and web.
- Real PostgreSQL/tRPC preference probe: **PASS** for default, disable, re-enable, user-scoped readback, and cleanup.
- Migration live readback: **PASS**; `analytics_enabled` is non-null with default `true`.
- Migration safety: **PASS**; migration is one additive `ALTER TABLE ... ADD COLUMN` statement.
- Database generation after migration: **PASS** with no pending schema generation reported.
- Bundle security: **PASS**; zero matches in regenerated mobile bundles for `POSTHOG_SERVER_KEY`, personal/admin PostHog keys, server analytics imports, database/private config identifiers, notification/provider secrets, and hardcoded provider test credentials.
- Existing storage `uploadUrl`/`downloadUrl` strings remain client API response fields; they are not captured by analytics and no signed value is passed to the analytics facade.
- Real PostHog ingestion: **DEFERRED**. Local configuration has no public project key and no private server key; no external delivery is claimed.
- EAS/native device build: **DEFERRED**.
- Maestro: **DEFERRED**.

## Schema and migration

- Schema change: `user_preferences.analytics_enabled` only.
- Migration: `packages/database/drizzle/0006_high_jazinda.sql`.
- No `analytics_events` table.
- No Phase 3.5 tables, columns, authorization boundaries, or provider credentials were redesigned.

## Files

Implementation:

- `packages/analytics/package.json`
- `packages/analytics/src/index.ts`
- `packages/analytics/src/policy.ts`
- `packages/analytics/src/server.ts`
- `packages/analytics/src/index.test.ts`
- `packages/analytics/src/policy.test.ts`
- `packages/analytics/src/server.test.ts`
- `packages/api/package.json`
- `packages/api/src/router.ts`
- `packages/api/src/settings.ts`
- `packages/api/src/settings.test.ts`
- `packages/auth/package.json`
- `packages/auth/src/index.ts`
- `packages/database/src/schema.ts`
- `packages/database/drizzle/0006_high_jazinda.sql`
- `packages/database/drizzle/meta/0006_snapshot.json`
- `packages/database/drizzle/meta/_journal.json`
- `apps/mobile/app/_layout.tsx`
- `apps/mobile/app/(app)/(tabs)/notifications.tsx`
- `apps/mobile/app/(app)/(tabs)/settings.tsx`
- `apps/mobile/lib/analytics/index.ts`
- `apps/mobile/lib/auth-store.ts`
- `apps/mobile/lib/notifications.ts`
- `apps/mobile/lib/i18n/en.ts`
- `apps/mobile/lib/i18n/de.ts`
- `pnpm-lock.yaml`

Documentation:

- `docs/phase-3-milestone-3.6-audit.md`
- `docs/phase-3-milestone-3.6-delivery.md`
- `docs/adr/014-analytics-taxonomy.md`
- `docs/phase-0-technical-decisions.md`
- `docs/phase-3-erd.md`
- `docs/phase-3-saas-product-layer.md`

## Remote checkpoint

- Implementation commit: `60edc0a` — `feat: complete phase 3.6 analytics`
- Implementation CI: `33571591060` — completed/success for head `60edc0ae6139b5c4fdeac1718cd795a9fec090aa`
- Final documentation-closure commit: pending
- Final GitHub Actions run: pending
- Phase 3.7 Monitoring/Sentry: not started
