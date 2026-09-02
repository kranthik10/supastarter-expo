# Phase 3 Milestone 3.9 Delivery — Production Hardening

**Status:** COMPLETE WITH RELEASE WARNINGS
**Baseline:** `1ae444e06c85a31fda90bdefb5118797e7e7c677`
**Scope:** Production-safety corrections only. No new product domain, framework upgrade, EAS build, Maestro execution, or Phase 3.10 work.

## Implemented

### Authentication and session security

- Better Auth now fails closed when `BETTER_AUTH_SECRET` is missing or shorter than 32 characters; the deterministic fallback was removed.
- The Better Auth Drizzle adapter receives the repository schema with `usePlural: true`, fixing runtime session-model resolution.
- The installed `@better-auth/client` contract is honored: sign-in/sign-up consume `sessionToken` rather than nonexistent `data.session`.
- Native session tokens are persisted only through `expo-secure-store` under the existing API bearer key. Web secure storage no longer falls back to plaintext AsyncStorage; web sessions use Better Auth cookies.
- Auth client requests use the installed `betterFetchOptions.customFetchImpl` and inject the SecureStore bearer token when present.
- Persisted sessions are revalidated through Better Auth before authenticated state is restored; invalid/expired/revoked sessions clear local state.
- Logout clears local auth state and secure keys in a `finally` path even when network sign-out fails.
- Password changes refresh the authoritative session.
- The development fake-user path requires both `NODE_ENV=development` and `ENABLE_DEV_AUTH=true`; it cannot activate in production.
- API/tRPC requests include credentials for cookie-backed web auth. Server context continues to validate bearer sessions and can validate Better Auth cookies.

### Authorization, billing, and database integrity

- Existing organization membership, permission, resource ownership, and server RBAC checks remain authoritative.
- The public `billing.updateSubscription` mutation no longer writes any subscription state. Paid/free subscription state must come from trusted provider synchronization; no ordinary client can forge plan/status/trial/enterprise state.
- Live PostgreSQL preflight found no duplicate subscriptions per organization.
- Added `subs_org_uidx` through `packages/database/drizzle/0007_workable_frightful_four.sql`; the database now enforces one subscription row per organization.
- Existing owner-transfer, sole-owner removal, account-deletion, storage-lock, invitation-acceptance, and notification ownership boundaries remain transactional/server-side.

### Invitation security

- New invitation bearer tokens are generated with cryptographic randomness and stored as SHA-256 digests in the existing token column.
- `invitations.create` no longer returns the bearer token in its API projection; the raw token exists only in the email-provider transport call needed to deliver the invitation.
- Accept/decline hash the presented token before lookup and preserve authenticated, verified-email binding, lifecycle checks, and transaction semantics.
- Existing legacy plaintext rows have a bounded compatibility lookup; accept/decline migrate the presented value to its digest during terminal transition. Legacy rows must be rotated/retired before production release if any remain.
- Pending invitation uniqueness and normalized email binding remain enforced by the existing partial unique index and API normalization.

### HTTP and configuration hardening

- CORS no longer uses `origin: '*'`. Browser origins must be listed in `CORS_ALLOWED_ORIGINS`; native requests without an Origin header remain supported.
- Credentialed CORS is enabled only with the explicit origin resolver.
- API responses receive `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, restrictive CSP, and a restrictive Permissions Policy. HSTS is applied only when `NODE_ENV=production`.
- The placeholder `/webhooks/*` route now returns `501 webhook_not_configured` instead of acknowledging and silently dropping events.
- `DATABASE_URL` no longer silently falls back through `getDb()`; Drizzle schema generation retains only a credential-free local URL needed to load config without connecting.
- `EXPO_PUBLIC_AI_API_KEY` was removed from public configuration; the existing assistant fallback no longer tells users to put provider credentials in the mobile environment.
- Organization/name/slug/email/token/file/session identifiers and MIME strings received bounded validation; organization/member/invitation/file/session lists are capped at 100 rows. Notifications were already capped.

## Audited and intentionally unchanged

- Better Auth remains the identity/session authority; Zustand mirrors UI state only.
- Existing RBAC and IDOR checks remain server-side. The new dashboard endpoint continues to verify requested-organization membership.
- Storage keys remain server-generated; MIME/size allowlists, path traversal sanitation, PostgreSQL quota reservation locks, pending expiry exclusion, provider HEAD confirmation, signed download expiry, user/org scope, and remote-delete-before-tombstone ordering remain in force.
- Notification creation remains trusted server logic; tokens are validated/rotated/invalidation-scoped and provider acceptance is not represented as device delivery.
- Analytics and monitoring continue through their existing sanitized seams; no raw dashboard/auth/provider payloads are added.
- CI now runs `db:generate`, fails on tracked Drizzle diffs, and fails on generated untracked files under `packages/database/drizzle`; no continue-on-error is used.
- Historical migrations were not edited. The corrective migration is additive and reviewed.

## Validation evidence

- Baseline full suite before changes: `142 PASS` across 26 files.
- Focused auth/API/config/invitation/database tests: `18 PASS`.
- Database configuration test: `PASS`.
- Full local validation: typecheck `28/28` tasks PASS; lint `15/15` tasks PASS; tests `150 PASS` across 29 files; Expo export PASS for iOS/Android/web with 41 static routes; `db:generate` PASS with no drift; `git diff --check` PASS.
- Real PostgreSQL/Hono probe `/tmp/phase-3-9-server-probe.ts`: `PASS` for bearer session validation, revoked-session rejection, explicit CORS allowlist, hostile-origin rejection, security headers, webhook non-acknowledgement, and unique subscription index.
- Real PostgreSQL invitation probe `/tmp/phase-3-9-invitation-probe.ts`: `PASS` for digest-at-rest storage, token-free response, email-bound acceptance, successful acceptance, and replay rejection.
- Live subscription duplicate preflight: zero duplicate organizations before index creation.
- Corrective migration applied locally; generated SQL is a single `CREATE UNIQUE INDEX` statement.
- Fresh post-export bundle scan: `99` files, `0` forbidden-match groups; private config, provider credentials, bearer literals, removed public AI-key surface, and direct AI provider endpoint are absent.
- `pnpm audit --prod`: Drizzle ORM high advisory resolved via `^0.45.2`; esbuild/decode-uri advisories resolved by narrow overrides; one moderate Expo SDK 57/Xcode `uuid@7` toolchain advisory remains deferred.

## Provider failure semantics

| Area | Current behavior | Production note |
|---|---|---|
| Billing | Client plan mutation fails closed; no verified provider sync exists | Paid subscriptions cannot be sold until signed webhook/provider reconciliation is implemented |
| Storage | Missing/unavailable provider returns safe not-configured/provider errors; confirmation requires provider HEAD; deletion marks DB only after remote delete | Real R2/S3 and operational retry/cleanup remain required if storage is advertised |
| Notifications | In-app notification persistence can remain successful when push is unavailable; provider status distinguishes accepted/failed/invalid/not-configured | Accepted is not device delivery; real credentials/receipts/device validation remain required |
| Analytics | Provider failures are isolated; product operation continues | Real ingestion/configuration remains deferred |
| Monitoring | Provider failures are isolated; server returns generic errors | Real Sentry ingestion/source maps/alerts remain deferred |
| Webhooks | Unimplemented route returns `501` and does not acknowledge | Real signed, idempotent handlers are required before provider activation |

## Release status and inherited deferrals

### Required before production release

- Production `DATABASE_URL`, migrations, SSL/network policy, backups, restore testing, connection limits, and monitoring.
- Strong `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, trusted-origin/cookie policy, and explicit `CORS_ALLOWED_ORIGINS`.
- Real Stripe/RevenueCat provider configuration, server secrets, signed webhook verification, replay idempotency, reconciliation, and failure alerting if subscriptions/paid entitlements are sold.
- Real R2/S3 credentials, private bucket policy, external HEAD/presign/delete validation, lifecycle/cleanup policy, and operational retry if file features are advertised.
- EAS project linkage replacing the placeholder project ID, Apple/Google signing, native build, and device validation.
- Real email provider/domain if invitation/account email delivery is advertised.
- Real push credentials and physical-device validation if push is advertised.
- Distributed rate limiting before multi-replica public deployment.
- Required privacy, terms, support/contact, retention, deletion, and store disclosures.

### Recommended before release

- Scheduled orphan cleanup for expired pending storage rows and remote objects.
- Scheduled push receipt reconciliation and invalid-token cleanup.
- PostHog/Sentry projects, ingestion/alert/retention checks, and source-map workflow.
- Production API custom domain/TLS/proxy body limits/health checks/rollback.
- Email delivery observability, bounce handling, and email-change verification.
- Delayed hard-delete/grace-period lifecycle if promised by product policy.
- Legacy plaintext invitation-token rotation/retirement verification.

### Safe post-launch or optional

- Session replay after explicit privacy/legal approval.
- Performance tracing after sampling and data-minimization review.
- Advanced analytics/BI, admin reporting, and all later product domains.

## Explicitly not performed

- No EAS login/build or Apple/Google credential operation.
- No Maestro execution or native/physical-device run.
- No real billing, R2/S3, email, push, PostHog, or Sentry external ingestion.
- No scheduled job deployment, distributed limiter, provider webhook replay store, or production backup setup.
- No Phase 3.10 Final Audit.

## Checkpoint

Implementation commit and CI evidence will be recorded after the final validation/review checkpoint. Documentation closure may be a separate commit. `.env.development`, build output, logs, and temporary probes remain unstaged.
