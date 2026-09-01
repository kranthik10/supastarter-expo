# ADR-015 — Monitoring boundaries + PII guardrails

- **Status:** Proposed
- **Date:** 2026-09-01
- **Context:** Phase 0 chose Sentry. Phase 3 must define what is captured and what is never captured, and how user/org context is attached without leaking PII.
- **Decision:** Introduce `packages/monitoring` leaf (RN `@sentry/react-native` + Node `@sentry/node` seam) exposing `initMonitoring`/`captureError`/`setUserContext`/`setOrgContext`/`ErrorBoundary`. Root `app/_layout.tsx` wraps with boundary; API Hono handler maps `TRPCError UNAUTHORIZED/FORBIDDEN` to `info` (not error) and `INTERNAL` to `captureError` with opaque `userIdHash`/`orgId`/`route` breadcrumbs. `release = slug@version`, `environment = appVariant`. PII (`email`, `token`, `pushToken`, `password`) is never set as tag or breadcrumb.
- **Alternatives:** Single Sentry init in app only (rejected — misses API), logging `email` in Sentry (rejected — compliance).
- **Consequences:** Dev variant with dummy `EXPO_PUBLIC_SENTRY_DSN` is no-op; prod sourcemaps via `sentry-expo-plugin` + `eas.json` `postPublish`; `audit_logs` keeps raw email/token hash for compliance, Sentry does not.

