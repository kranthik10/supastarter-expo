# Phase 3 Milestone 3.7 Audit — Monitoring + Error Observability

**Status:** PASS WITH WARNINGS — implementation may proceed
**Baseline:** `064d475`
**Previous milestone:** Phase 3.6 Analytics
**Scope:** Error monitoring and observability only. Phase 3.8 Dashboard was not started.

## 1. Baseline and existing state

- Repository: `kranthik10/supastarter-expo`
- Branch: `main`
- Baseline `064d475` is present locally and aligned with `origin/main`.
- Working tree has no unexpected source changes; `.env.development` remains intentionally untracked.
- Existing Phase 3.1–3.6 implementation and CI checkpoints remain authoritative.
- No `packages/monitoring` directory exists.
- `packages/config` already defines public `EXPO_PUBLIC_SENTRY_DSN` and private `SENTRY_DSN_SERVER`; no Sentry credentials are configured locally.
- `packages/api/src/server.ts` uses Hono’s request logger and has no centralized `onError` monitoring capture. No request body/header logging path was found.
- `apps/mobile/app/_layout.tsx` has no monitoring initialization, error boundary, or global unhandled-error integration.
- `packages/analytics` is implemented separately; it must not be used as an error-monitoring event sink.
- `docs/adr/015-monitoring.md` is a proposed draft and must be reconciled with the actual package boundary and privacy policy.

## 2. Proposed change classification

| Area | Existing state | Classification |
|---|---|---|
| `packages/monitoring` | Missing | LEGITIMATE ADDITION |
| Shared monitoring interface | Missing | LEGITIMATE ADDITION |
| Client/server package boundary | Missing | LEGITIMATE ADDITION |
| Sentry client provider | Missing; public DSN config exists | LEGITIMATE ADDITION |
| Sentry server provider | Missing; private DSN config exists | LEGITIMATE ADDITION |
| Fake/no-op provider | Missing | LEGITIMATE ADDITION |
| Redaction/sanitization | Missing | LEGITIMATE ADDITION |
| Client error boundary | Missing | LEGITIMATE ADDITION |
| Client unhandled errors | Missing | LEGITIMATE ADDITION; guarded web/JS-runtime hooks only |
| Hono global error capture | Missing | LEGITIMATE ADDITION |
| Expected tRPC error filtering | Missing | LEGITIMATE ADDITION |
| Safe user/org/route context | Missing | LEGITIMATE ADDITION |
| Hono request logger | Existing method/path/status logger | MATCH; do not replace with a logging framework; monitoring will never receive bodies/headers |
| Analytics events in monitoring | Not present | REJECT; analytics and monitoring remain separate |
| Monitoring database table | Not present | REJECT; Sentry is external and no replay/audit requirement exists |
| Session replay | Not present | DEFER |
| Full performance tracing | Not present | DEFER; no Phase 3.7 need established |
| Sentry native crash SDK/EAS native verification | Not configured | DEFER; Expo export compatibility can be verified, native crash capture cannot |
| Source-map upload | Requires Sentry auth credentials absent locally | DEFER |
| Phase 3.8 Dashboard | Not started | DEFER / OUT OF SCOPE |

## 3. Architecture decisions

### 3.1 Package boundary

Use explicit subpaths:

```text
@repo/monitoring
  client-safe interface, policy, no-op/fake provider, fetch-based Sentry provider
@repo/monitoring/policy
  pure redaction, error classification, route/request sanitization
@repo/monitoring/client
  React error boundary and guarded client unhandled-error installation
@repo/monitoring/server
  server provider/factory and server exception filtering
```

The root and policy exports contain no React Native, Node-only, database, or private configuration imports. Mobile imports only the root/client paths. API imports only the root/server paths.

A fetch-based Sentry Store API provider is sufficient for this foundation and avoids pulling a native SDK or Node SDK into the shared graph. The provider is still Sentry-specific and accepts public client DSNs or private server DSNs through separate factories.

### 3.2 User and organization context

- User context uses Better Auth’s internal `user.id` only.
- Raw email, name, phone, address, session IDs/tokens, and credentials are never sent.
- Organization context uses opaque `organization_id`, plus only bounded role/plan metadata when explicitly supplied.
- Active organization changes replace the previous context.
- Logout clears user and organization context.

### 3.3 Redaction policy

Normalize keys case-insensitively and redact at any nesting depth. Forbidden keys include:

```text
password, token, accessToken, refreshToken, authorization, cookie,
secret, apiKey, databaseUrl, presignedUrl, uploadUrl, downloadUrl,
invitationToken, session, requestBody, rawBody, responseBody,
payment, cardNumber, cvv, providerSecret
```

Sanitize error messages/stacks for bearer tokens, invitation/reset paths, and signed URL query strings. Preserve useful error type/message/stack structure where safe. Limit depth, key count, and string length.

### 3.4 Expected vs unexpected errors

Do not capture expected product outcomes such as validation failures, authentication failures, authorization denials, not-found responses, conflicts, quota/precondition failures, rate limits, and known not-configured provider results.

Capture unexpected uncaught exceptions, database failures, provider contract/invariant failures, and unhandled client render/runtime errors. The server’s Hono `onError` boundary is the primary uncaught-server capture point so the same error is not captured from multiple business procedures.

### 3.5 Route and request context

- Reuse the Phase 3.6 logical route strategy for mobile screen context; `/invite/<token>` becomes `invite` and query strings are removed.
- Server context contains only HTTP method, route/procedure template, bounded status/error category, request ID if supplied, environment, and platform.
- Never capture authorization headers, cookies, query values, request bodies, form bodies, or raw tokenized URLs.

### 3.6 Release and environment

Use existing bounded `config.appVariant` values (`development`, `preview`, `production`) and the app slug/version for release metadata. Do not fabricate git/release identifiers. Server/client DSNs are optional; missing DSN selects no-op.

### 3.7 Failure isolation

All provider calls are best-effort and swallow transport/provider failures. Monitoring must not alter API response semantics, roll back database operations, or crash the error fallback.

## 4. Required implementation changes

| Change | Why | Source | Safe migration | Affected package | Test required |
|---|---|---|---|---|---|
| Add monitoring root/policy/client/server modules | Establish reusable seam | Phase 0 §9.6; ADR-015 | NONE | `packages/monitoring` | Provider/policy tests |
| Add redaction and expected-error policy | Prevent sensitive diagnostic leakage/noise | Phase 3.6 privacy posture; objective §4/§13 | NONE | `packages/monitoring` | Nested forbidden-key, URL, error-code tests |
| Add fetch-based Sentry client/server providers | Implement Sentry without cross-boundary SDK leakage | Existing public/private config | NONE | `packages/monitoring` | Payload/no-op/failure tests |
| Add root client boundary/unhandled integration | Capture render/runtime failures | ADR-015; objective §15–16 | NONE | `apps/mobile`, monitoring client | Boundary/fallback tests where practical |
| Add Hono `onError` capture | Capture uncaught server failures once | Objective §17 | NONE | `packages/api` | Expected filtering/request sanitization tests |
| Add user/org context lifecycle | Diagnose failures without PII/stale context | Objective §6/31 | NONE | `apps/mobile`, monitoring | Fake provider context tests |
| Update ADR/product docs/delivery report | Record accepted privacy/operational decisions | Documentation contract | NONE | `docs` | Diff/check review |

## 5. Explicit non-changes

- No PostgreSQL schema/table/migration.
- No analytics event duplication.
- No Sentry session replay.
- No default 100% performance tracing.
- No database-backed log/event store.
- No Sentry auth token in the mobile bundle.
- No source-map upload claim without `SENTRY_AUTH_TOKEN`.
- No EAS/native crash-capture claim.
- No Phase 3.8 Dashboard work.

## 6. Warnings and deferred verification

- Local configuration has `EXPO_PUBLIC_SENTRY_DSN` and `SENTRY_DSN_SERVER` absent; real Sentry ingestion is therefore deferred.
- Client DSN is intentionally public if configured; `SENTRY_AUTH_TOKEN` and release-upload credentials remain server/CI-only.
- Expo export can verify JavaScript bundle compatibility, not native crash capture or source-map symbolication.
- The existing Hono logger remains a narrow method/path/status logger; a future logging milestone may revisit operational log routing separately.

## 7. Fundamental conflict check

No fundamental conflict was found. ADR-015 is compatible after correcting its proposed SDK/package details to the actual safe fetch-based implementation, explicitly separating client/server exports, and making the redaction/expected-error policy authoritative. Phase 3.7 may proceed without changing the approved identity, authorization, analytics, notification, storage, or billing architecture.
