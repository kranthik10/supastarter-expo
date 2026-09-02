# Phase 3 Milestone 3.9 Audit — Production Hardening

**Status:** PASS WITH WARNINGS — concrete blocker findings corrected; external production prerequisites remain
**Baseline:** `1ae444e06c85a31fda90bdefb5118797e7e7c677`
**Previous milestone:** Phase 3.8 SaaS Dashboard
**Scope:** Production safety corrections only. No new product domain, framework redesign, Phase 3.10 work, EAS build, or Maestro execution.

## 1. Baseline verification

- Repository: `kranthik10/supastarter-expo`
- Branch: `main`
- Local `HEAD`: `1ae444e06c85a31fda90bdefb5118797e7e7c677`
- `origin/main`: same SHA
- Working tree: clean except intentionally untracked `.env.development`
- Phase 3.8 final CI: `33645884660` — success
- No unknown local work was reset, cleaned, stashed, deleted, or overwritten.

## 2. Audit coverage

Inspected the current docs/ADRs, mobile app/auth/session stores, API router/context/server, database schema/migrations/journal, organizations/permissions, billing/entitlements/provider seam, storage policy/provider/service, notifications policy/provider/service, analytics/monitoring boundaries, config/app config/EAS state, package manifests, and GitHub CI workflow. Repo-wide searches covered protected procedures, identifier inputs, auth/session/token handling, billing/provider state, storage/file ownership, notification/push data, analytics/monitoring capture, console logging, CORS, middleware, webhooks, migrations, and bundle-sensitive identifiers.

## 3. Findings and classifications

| Finding | Classification | Evidence / decision |
|---|---|---|
| Better Auth falls back to a deterministic development secret when `BETTER_AUTH_SECRET` is absent | PASS after correction | `getAuthConfig()` now requires a 32+ character secret; production startup cannot use the former deterministic fallback. |
| `Bearer dev-token` returns a fake user without a production gate | PASS after correction | The bypass requires `NODE_ENV=development` and `ENABLE_DEV_AUTH=true`; production rejects it. |
| Auth store hydrates a persisted user/session without immediate server revalidation | PASS after correction | Hydration revalidates through Better Auth before setting active user state and clears invalid/expired/revoked local state. |
| Installed Better Auth client returns `sessionToken`, but auth store expects `data.session`; API `auth.token` is never populated | PASS after correction | Native sign-in/up persist the installed `sessionToken` in SecureStore; the auth client and API/tRPC clients send bearer/cookie credentials; session restoration is server-revalidated. |
| Public `billing.updateSubscription` can write an active free subscription and mutate canonical subscription state | PASS after correction | The client mutation now fails closed for every plan with `subscription_state_provider_only`; only trusted provider synchronization can write subscription state. |
| `subscriptions.organization_id` has only a non-unique index | PASS after correction | Live preflight found zero duplicate organizations; additive `subs_org_uidx` is applied and appears in PostgreSQL. |
| Invitation raw token is stored in `invitations.token`; create helper returns the whole row including the bearer token | PASS after correction with legacy warning | New rows store SHA-256 digests, projections omit the token, and real PostgreSQL acceptance/replay probes pass. Legacy plaintext rows require rotation before production release. |
| `origin: '*'` is used for every Hono response | PASS after correction | Hono uses `CORS_ALLOWED_ORIGINS` with no wildcard; native requests without an Origin header remain supported, and Better Auth receives the same trusted-origin list. |
| `/webhooks/*` always returns `200 { ok: true }` without verification or processing | PASS after correction with release warning | Disabled webhook paths now return `501 webhook_not_configured`; signed provider processing and idempotency remain required before activation. |
| Hono-facing responses lack explicit baseline security headers | PASS after correction | API/web responses include nosniff, no-referrer, frame denial, restrictive CSP/Permissions Policy, and production-only HSTS, including error responses. |
| Several organization/list inputs and list queries are unbounded | PASS after correction | Relevant IDs/strings/MIME/size inputs now have explicit limits; organization/member/invitation/file/session lists are capped at 100. |
| Invitation create/redeem and storage intent use process-local rate limits / no distributed limiter | DEFER | Current code is basic abuse resistance only. Distributed production rate limiting requires deployment infrastructure and remains a release requirement for multi-replica abuse protection. |
| Storage quota reservation uses PostgreSQL organization/file row locks inside a short transaction | PASS | `getOrganizationStorageUsage(..., lock=true)` locks organization and active files; remote presign occurs after commit; the real PostgreSQL integration approach was rerun successfully. |
| Expired pending storage reservations are excluded; cleanup service exists but scheduler is absent | PASS / DEFER | Correct quota semantics pass; scheduled orphan cleanup remains deferred. |
| Storage key, MIME/size, provider HEAD, ownership, signed URL, and deletion ordering | PASS | Server-generated keys, policy allowlist, HEAD confirmation, org/user authorization, short-lived signed URLs, and remote-delete-before-tombstone are present. Path traversal policy tests already exist. |
| Avatar canonical update is server-controlled after ready user-owned avatar confirmation | PASS WITH WARNINGS | `confirmUpload(purpose=avatar)` enforces the user namespace and image type. Better Auth’s generic profile endpoint still permits its standard external image field; the app’s avatar path remains the controlled storage path and this limitation is documented. |
| Notification creation is server-only; reads/marking are user-scoped; token registration checks device/token ownership and invalidates rotations | PASS | No normal client procedure can send arbitrary push to another user. Provider acceptance remains distinct from device delivery. |
| Auth/RBAC/IDOR checks | PASS after representative regression probes | Organization procedures check membership and permissions; resource procedures scope file/notification/session identifiers by authenticated user/org; dashboard checks requested-org membership. New negative tests/probes are required for touched hardening paths. |
| Ownership transfer, last-owner member removal, and account deletion checks are transactional/locked | PASS WITH WARNINGS | Application transactions and row locks protect current invariants. A DB-level singleton-owner constraint is not introduced because transfer temporarily demotes/promotes roles and the existing transaction is the source of truth. Concurrent real-PG probe remains required. |
| Billing paid state | PASS after correction | Existing paid `pro`/`enterprise` and free-plan client forge attempts are rejected before writes; the public mutation now fails closed for all plans. Provider/webhook sync remains deferred. |
| Entitlement source of truth and state semantics | PASS | Canonical plan defaults plus org entitlement rows, subscription status/grace resolution, and disabled-on-expiry behavior exist and are tested. |
| Webhook idempotency/external provider sync | DEFER | No real webhook implementation exists. Dedicated provider-event uniqueness/signed webhook processing is required before selling subscriptions; generic audit logs are not a replay store. |
| Analytics direct calls/privacy/consent | PASS | App calls the typed facade; forbidden properties are sanitized/rejected; user/org identity and opt-out lifecycle are covered. No direct provider use was found outside approved seams. |
| Monitoring direct calls/privacy/expected-error filtering | PASS | Client/server boundaries and sanitization package are centralized; sensitive request data is filtered; expected failures are classified. |
| Environment split/bundle boundary | PASS | Private env names remain server-only, public AI-key configuration was removed, and the fresh Expo bundle scan covered 99 files with zero forbidden groups. |
| Dependency audit | PASS WITH WARNINGS | Drizzle ORM high advisory was fixed by aligning to `^0.45.2`; esbuild and decode-uri advisories were removed with narrow overrides. One moderate `uuid@7` remains in the Expo SDK 57/Xcode build toolchain and is deferred until an upstream/framework-compatible update. |
| Mobile AI provider boundary | PASS after correction | The shipped `@repo/ai` entry point is offline-only; no client API-key option or direct provider endpoint remains in the fresh bundle. Real AI requires a future server-side provider integration. |
| CI schema drift gate | PASS after correction | `.github/workflows/ci.yml` runs `db:generate`, fails on tracked Drizzle diffs, and fails on generated untracked files under `packages/database/drizzle`; no continue-on-error is used. |
| Migration history | PASS | Existing migrations were not edited; the reviewed corrective migration is additive, journaled, applied locally, and regeneration reports no drift. |
| Request size limits | PASS WITH WARNINGS | Presigned uploads keep file bytes off the API and public JSON fields are bounded; infrastructure/proxy body limits remain a deployment requirement. |
| Pagination/N+1 | PASS after correction | Notifications were already bounded and dashboard uses SQL counts/aggregation; member/invitation/file/session/org list reads are now capped at 100. |
| CORS/auth transport | PASS after correction | API uses bearer authorization for tRPC and Better Auth bearer/cookie session transport; CORS and Better Auth trusted origins are explicit and allowlisted. |
| EAS project/signing/native validation | DEFER | `app.config.ts` still has the placeholder EAS project ID unless configured. No login/build/credentials will be performed in 3.9. |
| Maestro execution | DEFER | Authored flows may be audited for staleness, but no native execution will be claimed. |
| External providers, email, real R2/S3, push, PostHog, Sentry, jobs, backups | DEFER | These require real credentials/infrastructure and external evidence. |

## 4. Justified implementation delta

1. Fail closed on Better Auth secret and production configuration; remove the fake-user production path.
2. Align auth client handling with the installed Better Auth `sessionToken` contract, persist only in SecureStore, configure bearer transport, revalidate persisted sessions, and guarantee local logout cleanup even when network sign-out fails.
3. Disable the public subscription-state mutation and add a unique subscription-per-organization constraint after duplicate preflight.
4. Hash new invitation bearer tokens at rest, stop returning them in API rows, hash incoming tokens for redemption, and retain only a bounded legacy compatibility path that can be documented/rotated.
5. Replace wildcard CORS with an environment allowlist, add safe HTTP headers, and make the unimplemented webhook route non-success/not-configured.
6. Add bounded input/list query limits without changing product behavior or introducing pagination UI.
7. Add focused tests and real PostgreSQL probes for auth config/dev gate, billing forge prevention, subscription uniqueness, invitation token behavior, ownership/IDOR representatives, CORS/header/webhook behavior, and bounds.

## 5. Explicit non-changes

- No new product domain, table family, dashboard feature, framework upgrade, auth replacement, Redis/Kubernetes platform, EAS build, Maestro run, or Phase 3.10 audit.
- No historical migration edits.
- No secrets printed, fabricated, committed, or persisted in this repository.
- No claim of real provider ingestion, native crash capture, device push delivery, source-map upload, scheduled cleanup, or distributed rate limiting.

## 6. Release-risk classification

Required before production release: valid server/database/auth configuration, production-only auth bypass removal, session revalidation/transport, real billing provider plus signed idempotent webhooks if subscriptions are sold, real storage/provider verification if file features are advertised, EAS project/signing/native build validation, production database/backups, explicit CORS origins, email provider if invitation email is advertised, and distributed rate limiting for multi-replica public abuse-sensitive endpoints.

Recommended before release: scheduled pending-file cleanup, verified push credentials/device validation if push is advertised, PostHog/Sentry projects and ingestion checks, source maps, production API origin/custom domain, security/privacy/terms links, and a tested operational alert path.

Safe post-launch/optional: session replay, performance tracing, advanced analytics/BI, and other later observability enhancements when their privacy and operational value are established.

## 7. Completion

- Concrete repository blockers were corrected and revalidated.
- Focused hardening tests: `18 PASS`; full suite: `150 PASS` across 29 files.
- Real PostgreSQL/Hono and invitation probes passed.
- Local typecheck, lint, Expo export, migration generation, bundle scan, and diff checks passed.
- GitHub Actions implementation run `33675244650` passed for commit `593ec0e06c936475038adc1c254f9c2b6010f450`.
- Documentation closure commit `503ce8df93a3af08cafb69cf1f1f15a6a835ad8b` and final-head CI run `33675709349` also passed.
- One moderate `uuid@7` advisory remains in the Expo SDK 57/Xcode build toolchain; no framework upgrade was attempted.
- External provider setup, production operations, EAS/native signing, and Maestro remain release prerequisites or explicit deferrals.
- Phase 3.10 Final Audit was not started.