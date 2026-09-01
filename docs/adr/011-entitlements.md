# ADR-011 — Entitlements (org-scoped feature gates)

- **Status:** Proposed
- **Date:** 2026-09-01
- **Context:** Phase 3 billing must gate features (projects, members, storage, AI tokens) per organization, not just reflect `subscriptions.status`. The existing `plans` table is price copy; entitlement must be a runtime object derived from `subscriptions` + per-org overrides, cached on mobile but never trusted from device alone.
- **Decision:** Introduce `entitlements` table `unique(organization_id, feature)` with `limit`/`enabled`; resolve entitlement server-side via `subscriptions` (status + `trial_ends_at`/`grace_ends_at`) joined with `entitlements` rows. Client reads via `trpc.billing.getEntitlement({ feature })` and caches 5m; enforcement is server-side on every gated mutation.
- **Alternatives:** Per-feature flag table without `subscriptions` (rejected — duplicates billing state), device-only entitlements (rejected — spoofable), hardcoding limits in screens (rejected — not reusable).
- **Consequences:** Plan copy stays in `plans` + `packages/billing/src/plans.ts`; per-org overrides are migrations/seed, not screens; B2C is `members.limit=1`, B2B is org-scoped `subscriptions` with many members — same resolver.

