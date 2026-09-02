# Phase 3 Milestone 3.7 Delivery — Monitoring + Error Observability

**Status:** Implementation CI-verified; documentation closure pending
**Baseline:** `064d475`
**Previous milestone:** Phase 3.6 Analytics
**Scope boundary:** Monitoring/error observability only. Phase 3.8 Dashboard was not started.

## Implemented

### Monitoring abstraction and provider boundary

- Added `@repo/monitoring` with a narrow provider-independent facade for exception/message capture, user context, organization context, and route context.
- Added `@repo/monitoring/policy` for recursive redaction, error-string sanitization, expected-error classification, route sanitization, and server-request allowlisting.
- Added `@repo/monitoring/client` for the React error boundary, public-DSN client factory, and guarded browser/JavaScript-runtime unhandled-error handlers.
- Added `@repo/monitoring/server` for the private-DSN server provider/factory and expected tRPC/business-error filtering.
- Added `SentryMonitoringProvider` and `SentryServerMonitoringProvider` using the Sentry Store API through injected/fetch transports.
- Added `FakeMonitoringProvider` and `NoopMonitoringProvider`.
- Provider failures are swallowed and never affect product flows or database/API outcomes.

### Privacy and redaction

- User context uses Better Auth’s internal user ID only.
- Raw email, full name, phone, address, session data, credentials, payment data, and provider secrets are never sent.
- Forbidden monitoring keys are recursively redacted, including password, token variants, authorization, cookie, secret/API key, database URL, signed upload/download/presigned URLs, invitation/reset tokens, push tokens, request/response bodies, and payment/card/CVV data.
- Error messages/stacks redact bearer tokens, signed query values, JWT-like strings, and tokenized invitation/reset paths.
- Monitoring never receives request bodies, form bodies, authorization headers, cookies, or raw query values.

### Error policy and lifecycle

- Expected `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PRECONDITION_FAILED`, rate-limit, method, and known not-configured outcomes are filtered.
- Unexpected uncaught, database/provider/invariant, render, and unhandled runtime/promise errors are captured.
- Hono `onError` is the single primary uncaught server capture boundary.
- The existing app root now owns a single client monitoring instance with bounded `${appSlug}@${appVersion}` release, environment, and platform metadata.
- `MonitoringErrorBoundary` wraps the existing navigation/query tree and renders a simple retry fallback without exposing diagnostics.
- Client route context reuses the Phase 3.6 logical route strategy; `/invite/<token>` becomes `invite` and query strings are removed.
- User changes/logout clear user, organization, and route context. Organization switching replaces the previous context.

### Server request context

Hono monitoring context is limited to:

- HTTP method
- sanitized route/path
- tRPC procedure name when available
- status/code
- bounded `x-request-id`

No request body, form body, authorization header, cookie, raw query, or input payload is captured.

## Explicit decisions

- User context policy: internal Better Auth ID only; no email/name.
- PII policy: redact raw identity, credentials, tokens, URLs, request bodies, and payment data before provider invocation.
- Expected errors: filtered centrally; unexpected failures captured.
- Client/server boundary: root/policy are client-safe; `client` contains React integration; `server` contains server factory/provider only.
- Route strategy: reuse Phase 3.6 logical screen sanitization and strip query/token values.
- Request strategy: safe method/path/procedure/status/request ID only.
- Failure policy: monitoring is best-effort and non-fatal.
- Performance tracing: deferred; no clear Phase 3.7 requirement for production tracing.
- Session replay: deferred due auth, billing, team, storage, notification, and settings privacy surface.
- Source-map upload: deferred; no `SENTRY_AUTH_TOKEN` configured.
- Real Sentry ingestion: deferred; no client/server DSN configured locally.
- Native crash capture: deferred; no EAS/native development build was run.

## Verification

- Monitoring policy/facade/client/server tests: **14 PASS**.
- Full test suite: **137 PASS** across 24 test files.
- Full typecheck: **28/28 tasks PASS**.
- Full lint: **15/15 tasks PASS**.
- Expo build/export: **PASS** for iOS, Android, and web.
- Database validation: **PASS**; no schema changes, no migration generated, frozen install passed, and database generation reported no changes.
- Migration safety: **NONE REQUIRED**; this milestone does not modify PostgreSQL.
- Bundle security: **PASS**; zero matches in regenerated mobile bundles for `SENTRY_DSN_SERVER`, `SENTRY_AUTH_TOKEN`, server monitoring imports/classes, database/private config identifiers, `POSTHOG_SERVER_KEY`, and provider test credentials.
- Real Sentry ingestion: **DEFERRED**; `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_DSN_SERVER`, and `SENTRY_AUTH_TOKEN` are absent locally.
- Native crash capture: **DEFERRED**.
- Source-map upload: **DEFERRED**.
- Performance tracing: **DEFERRED**.
- Session replay: **DEFERRED**.
- EAS/native build: **DEFERRED**.
- Maestro: **DEFERRED**.

## Schema

- Schema: **NONE**.
- Migration: **NONE**.
- No `errors`, `monitoring_events`, or `sentry_events` table.
- No Phase 3.1–3.6 schema or authorization boundaries were changed.

## Files

Implementation:

- `packages/monitoring/package.json`
- `packages/monitoring/tsconfig.json`
- `packages/monitoring/src/index.ts`
- `packages/monitoring/src/policy.ts`
- `packages/monitoring/src/client.tsx`
- `packages/monitoring/src/server.ts`
- `packages/monitoring/src/index.test.ts`
- `packages/monitoring/src/policy.test.ts`
- `packages/monitoring/src/client.test.ts`
- `packages/monitoring/src/server.test.ts`
- `packages/api/package.json`
- `packages/api/src/server.ts`
- `apps/mobile/package.json`
- `apps/mobile/app/_layout.tsx`
- `tsconfig.json`
- `pnpm-lock.yaml`

Documentation:

- `docs/phase-3-milestone-3.7-audit.md`
- `docs/phase-3-milestone-3.7-delivery.md`
- `docs/adr/015-monitoring.md`
- `docs/phase-0-technical-decisions.md`
- `docs/phase-3-saas-product-layer.md`

## Remote checkpoint

- Implementation commit: `63f859c` — `feat: complete phase 3.7 monitoring`
- Implementation CI: `33574385234` — completed/success for head `63f859c07d19cd37b9ab594864149e0451fac0c5`
- Documentation-closure commit: pending
- Documentation-closure CI: pending
- Final CI documentation update: pending
- Phase 3.8 Dashboard: not started
