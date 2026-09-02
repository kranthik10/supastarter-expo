# Production Release Checklist

This checklist is intentionally separate from milestone code completion. A green local/CI result does not mean external providers, native signing, operational infrastructure, or legal product requirements are configured.

## CODE COMPLETE

- [x] Better Auth secret is required and no deterministic production fallback remains.
- [x] Development authentication bypass requires `NODE_ENV=development` and `ENABLE_DEV_AUTH=true`; production rejects it.
- [x] Installed Better Auth `sessionToken` response is persisted only through native SecureStore; web uses Better Auth cookies.
- [x] Persisted sessions are server-revalidated before restoration; invalid/revoked sessions clear local state.
- [x] Logout clears local auth state/token even if network sign-out fails.
- [x] Protected organization/API procedures retain server membership and permission checks.
- [x] Client subscription-state mutation cannot write subscription state; provider synchronization is the only production path.
- [x] Subscription-per-organization uniqueness is enforced by `subs_org_uidx`.
- [x] New invitation tokens are SHA-256 digests at rest and bearer tokens are excluded from API projections.
- [x] API identifier/string inputs and list reads have bounded limits.
- [x] Hono CORS uses explicit `CORS_ALLOWED_ORIGINS`; wildcard origin is not used.
- [x] Baseline API security headers are applied; HSTS is production-only.
- [x] Unimplemented webhook routes return non-success `501` instead of acknowledging and dropping events.
- [x] Public `EXPO_PUBLIC_AI_API_KEY` configuration is removed; real assistant providers must be server-side.
- [ ] Real billing webhook ingestion, signature verification, reconciliation, and replay idempotency.
- [ ] Real object-storage provider verification and operational retry/cleanup scheduling.
- [ ] Production distributed abuse-rate limiting.
- [ ] Track Expo SDK 57/Xcode `uuid@7` moderate advisory and adopt the first compatible upstream/framework fix.

## LOCAL VERIFIED

- [x] Full typecheck.
- [x] Full lint.
- [x] Full Vitest suite.
- [x] Expo export for iOS, Android, and web.
- [x] Database schema generation reports no unreviewed drift after applying the corrective migration.
- [x] Real PostgreSQL session/revocation, HTTP boundary, subscription-index, and invitation lifecycle probes.
- [x] Bundle/source scans for private secrets, provider credentials, database identifiers, and server-only imports.
- [ ] EAS native build and install.
- [ ] Physical-device authentication, push, storage, and notification verification.
- [ ] Maestro execution.

## CI VERIFIED

- [ ] This milestone’s implementation commit has a completed successful GitHub Actions run.
- [ ] Documentation closure/final-head CI has a completed successful GitHub Actions run.
- [ ] CI runs `pnpm install --frozen-lockfile`, lint, typecheck, tests, Expo build, and a failing-on-drift `db:generate` comparison.
- [ ] CI secrets/environment are configured in the target repository/environment without printing values.

## EXTERNAL PROVIDER SETUP REQUIRED

- [ ] Production `DATABASE_URL`, SSL/network policy, migrations, backups, restore test, connection limits, and monitoring.
- [ ] Production `BETTER_AUTH_SECRET` (32+ random characters), `BETTER_AUTH_URL`, trusted origin/cookie policy, and session policy.
- [ ] Explicit `CORS_ALLOWED_ORIGINS` for every approved browser origin; do not use `*`.
- [ ] Stripe and/or RevenueCat production account, product/price identifiers, server secret, and verified webhook secret.
- [ ] Billing webhook signature verification, event uniqueness/replay store, ordering/reconciliation, and failure alerting.
- [ ] R2/S3 bucket, endpoint, access key, secret, private-by-default policy, lifecycle rules, CORS, and provider HEAD/presign/delete verification.
- [ ] Resend/email provider, sender/domain verification, invitation delivery monitoring, and bounce/complaint handling if email is advertised.
- [ ] Expo/APNs/FCM push credentials, invalid-token handling, receipt/reconciliation job, and physical-device evidence if push is advertised.
- [ ] PostHog project/key/host and consent/privacy review if product analytics is enabled.
- [ ] Sentry client/server DSNs, auth token/source-map workflow, alert routing, retention/privacy settings, and ingestion verification.
- [ ] Production API custom domain/origin, TLS, DNS, proxy/platform request limits, health checks, and deployment rollback path.
- [ ] Scheduled jobs/worker for expired pending storage cleanup, invitation maintenance, push receipts, and any delayed deletion lifecycle that the product elects to enable.
- [ ] Distributed rate-limiting provider for sign-in/sign-up/password/invitation/upload/push abuse-sensitive routes.
- [ ] Privacy policy, terms, support/contact links, data-retention/deletion language, and store disclosures if required by the product.

## NATIVE RELEASE VALIDATION REQUIRED

- [ ] Set real EAS project linkage; replace the placeholder project ID in `app.config.ts`/environment.
- [ ] Configure Apple bundle identifiers, certificates, provisioning, App Store Connect access, push entitlements, and production secrets.
- [ ] Configure Android package identifiers, signing key, Google Play access, push configuration, and production secrets.
- [ ] Run EAS development/preview/production build as appropriate.
- [ ] Install a native build and validate sign-in, sign-out, session expiry/revocation, password change, account deletion guard, org switching, billing gating, storage quota, avatar, push token rotation, notification deep links, and offline/retry behavior.
- [ ] Run authored Maestro flows against a real development build and update stale selectors/paths only with evidence.
- [ ] Verify release version/runtime version/update channel behavior and rollback.

## DEFERRED ITEM REVIEW

### Required before production release

- Real billing provider configuration and signed webhook processing if subscriptions or paid entitlements are sold.
- Real object storage configuration and external verification if uploads/downloads are advertised.
- Production PostgreSQL, migrations, backup/restore, and operational monitoring.
- Valid Better Auth secret/base URL and explicit production origin/CORS configuration.
- EAS project linkage, Apple/Google signing, native build, and device validation.
- Real email provider if invitation/account email delivery is advertised.
- Real push credentials/device validation if push is advertised.
- Distributed rate limiting before a multi-replica public deployment.
- Required privacy/terms/support/store disclosures.

### Recommended before release

- Scheduled expired-pending-file cleanup and storage orphan reconciliation.
- Scheduled push receipt reconciliation and invalid-token cleanup.
- PostHog/Sentry project setup, ingestion checks, alert routing, retention review, and source-map workflow.
- Production API custom domain/TLS/proxy limits and health/rollback checks.
- Email delivery observability and account/invitation lifecycle verification.
- Delayed hard-delete/grace-period lifecycle if promised by product policy.
- Configured production logging/metrics/alerts that preserve the monitoring privacy boundary.

### Safe post-launch or optional

- Session replay after explicit privacy/legal approval.
- Performance tracing after sampling and data-minimization review.
- Advanced analytics/BI, admin reporting, and other product domains outside Phase 3.
- Further provider SDK adoption if dependency/bundle boundaries remain verified.

## Explicitly not claimed by this repository milestone

- Real R2/S3, Stripe, RevenueCat, email, PostHog, Sentry, APNs, or FCM ingestion/delivery.
- Native crash capture, source maps, performance traces, session replay, EAS builds, or Maestro execution.
- Automatic scheduled cleanup, distributed rate limiting, or production backups.
- Production release readiness solely from Expo export or GitHub CI.
