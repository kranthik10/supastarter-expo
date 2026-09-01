# Phase 3 Milestone 3.1 — Delivery

**Date:** 2026-09-01
**Baseline:** `5c1ceba`
**Branch:** `main`
**Status:** IMPLEMENTED — ready for 3.2

---

## Summary

Billing foundation + subscription lifecycle + org-scoped entitlements + server-enforced API with RBAC. All new columns are nullable or defaulted; existing data preserved. Provider abstraction stays behind `packages/billing` — no Stripe/RevenueCat secrets in mobile bundle.

---

## IMPLEMENTED

### Database — `@repo/database`
- `subscriptions` — added `provider_status text`, `trial_ends_at timestamptz`, `grace_ends_at timestamptz`, `cancel_at_period_end boolean default false not null` (migration `0001_spotty_wrecker.sql`, `CREATE TABLE entitlements` + 4 `ADD COLUMN`, `drizzle-kit push --force` applied to `mobile_saas_dev`, seeded demo org `exf9gzl1kxuav1bore7mdney` with 4 free entitlements). Verified `pnpm --filter @repo/database db:generate` → `No schema changes, nothing to migrate`.
- `entitlements` — new table `id pk cuid2`, `organization_id fk cascade`, `feature text`, `limit integer nullable (null=unlimited)`, `enabled boolean default true`, `created_at/updated_at`, `unique(organization_id, feature)`, `index(organization_id)`.
- `.gitignore` — allow `packages/database/drizzle/**` to be tracked; `drizzle/` remains ignored elsewhere. Commit includes `0001_spotty_wrecker.sql`.

### Billing package — `@repo/billing`
- `src/entitlements.ts` — pure, no DB import (mobile-safe): `Feature = projects.limit|members.limit|storage.gb|ai.tokens`, `ALL_FEATURES`, `PLAN_ENTITLEMENTS` (free 3/2/5/1000, pro 50/25/100/100000, enterprise null/unlimited), `isSubscriptionEntitled(sub, now)` (active=true, trialing=trialEndsAt>now, past_due=graceEndsAt>now, else false), `resolveEntitlement({feature,planId,row,subscription})` (row override → subscription gate → plan default; preserves row limit even when disabled).
- `src/entitlements.server.ts` — Node-only: `getEntitlement`, `getFeatureLimit`, `isFeatureEnabled`, `canUseFeature`, `listEntitlements`, `syncEntitlementsForPlan` (onConflictDoNothing → admin override survives plan change), `initEntitlementsForOrg`.
- `src/provider.ts` — `BillingProvider` interface (`getPlans`, `getSubscription`, `createCheckout`, `cancelSubscription`, `restoreSubscription`, `syncSubscription`, `verifyWebhook`), `StubProvider` (throws `Billing not configured` for checkout paths, returns stub for sync), `getBillingProvider()` factory (server reads `BILLING_PROVIDER` env, mobile always stub) — no provider SDK in bundle.
- `src/plans.ts` — unchanged (price/seats seed); entitlement limits live in `PLAN_ENTITLEMENTS`, not duplicated.
- `src/index.ts` — re-exports `plans`, `provider`, pure entitlements types/helpers, `useBilling` (Zustand local cache, in-memory, no `@repo/storage` dep to keep graph acyclic). Mobile tree-shakes `@repo/database` out (database only imported via `entitlements.server` which mobile never imports).
- `package.json` — added `@repo/database`, `@paralleldrive/cuid2`, `drizzle-orm`; exports `./entitlements` + `./entitlements.server` + `./provider`.

### API — `@repo/api`
- `src/router.ts` — added `subscriptions` import + billing helpers via `@repo/billing/entitlements.server`. `organizations.create` now uses `db.transaction` + `syncEntitlementsForPlan(tx, id, 'free')` (atomic, does not fail org creation).
- New `billing` router — all `protectedProcedure` + membership check + `assertCan`:
  - `billing.getSubscription {organizationId}` → `billing.read`, returns row or null
  - `billing.listEntitlements {organizationId}` → `billing.read`, returns `listEntitlements(db, orgId)` (4 features, subscription-gated)
  - `billing.getEntitlement {organizationId, feature}` → `billing.read`, `ALL_FEATURES` enum, `getEntitlement`
  - `billing.updateSubscription {organizationId, planId}` → `billing.manage`, **security-fixed**: only `free` is allowed via this direct mutation; non-free (`pro`/`enterprise`) throws `PRECONDITION_FAILED Billing provider not configured — paid plans require verified provider state` until Stripe/RevenueCat webhook sync is live. For Phase 3.1 without live providers, paid plans are `NOT_CONFIGURED`; internal/test helper `syncEntitlementsForPlan` remains available server-side for entitlement testing without forging provider state. Free plan upserts `subscriptions` (`status active`, `provider stripe`, `currentPeriodEnd +30d`) and syncs entitlements.
- `package.json` — added `@repo/billing` dep; graph acyclic (`storage→api→billing` remains single direction, `billing` no longer depends on `@repo/storage` — cycle broken, `pnpm install` no warn).

### Permissions
- Reused `billing.read` / `billing.manage` (existing matrix: owner both, admin/member read only). No new permission.

### Tests — `pnpm test` 63 PASS (6 files, was 30)
- `packages/billing/src/billing.test.ts` — 3 plans still pass
- `packages/billing/src/entitlements.test.ts` — 17 tests: ALL_FEATURES, plan resolves, enabled/disabled/limited/unlimited/unknown, trialing/past_due/grace/canceled/incomplete, cancel_at_period_end, explicit row limit preserved but enabled gated by subscription, additive mapping
- `packages/api/src/billing.test.ts` — 8 tests: owner can manage, admin/member read-only, billing.read vs manage, org isolation (membership guard, independent limits per org/plan, override per-org, unique constraint per feature)
- Existing RBAC `packages/permissions/src/rbac.test.ts` — 21 tests (owner/admin/member billing.read/manage) still pass
- `packages/config/src/env.test.ts`, `packages/api/src/api.test.ts` unchanged

### Mobile
- No required UI change for 3.1 — existing `apps/mobile/app/(app)/(tabs)/billing.tsx` remains local `useBilling` cache (UI hint). Server billing is reachable via `trpc.billing.*` for future screen; building it is deferred to 3.2 per spec. `apps/mobile/lib/billing` legacy duplicate left untouched.

---

## VERIFIED

| Check | Result | Evidence |
|-------|--------|----------|
| `pnpm typecheck` | PASS | 26 tasks, 26 successful |
| `pnpm lint` | PASS | 14 tasks, 14 successful |
| `pnpm test` | PASS | 6 files, 63 tests passed, 0 failed |
| `pnpm build` | PASS | 14 tasks, expo export → `dist` (billing routes 18KB), no bundle leak |
| `pnpm --filter @repo/database db:generate` | PASS | `No schema changes, nothing to migrate` + migration `0001_spotty_wrecker.sql` tracked |
| `drizzle-kit push --force` | PASS | `Changes applied` + `mobile_saas_dev` has 4 entitlements for demo org |
| RBAC server-enforced | PASS | `assertCan(billing.read/manage)` in every billing procedure, membership check before resolver; negative tests for member/admin manage |
| Org isolation | PASS | `(organization_id, feature)` unique, membership guard, per-org limits verified (free 3 vs enterprise null) |
| Subscription lifecycle | PASS | trialing (future vs past trialEndsAt), active (cancelAtPeriodEnd ignored), past_due grace, canceled/incomplete disabled, thresholds tested pure |
| Secrets not in bundle | PASS | `grep` 0 hits for `DATABASE_URL\|BETTER_AUTH_SECRET\|STRIPE_SECRET\|postgres:\|sk_live\|whsec_` in `apps/mobile/dist` |
| Dependency graph | PASS | acyclic (`api→billing→database`, `api` not → `storage` cycle, `billing` no longer → `storage`, `pnpm install` no cyclic warn) |
| Migration safety | PASS | 4 `ADD COLUMN` nullable/default false + `CREATE TABLE`; existing demo org still valid; `syncEntitlementsForPlan` idempotent via `onConflictDoNothing` |
| Regression | PASS | Phase 1/2 auth/org/RBAC still PASS (30→63, no failure) |

---

## DEFERRED

- Real `StripeProvider`/`RevenueCatProvider` SDK calls, `createCheckout` sheet, App Store/Google Play purchase UI (3.1 ships `BillingProvider` interface + `StubProvider` only; `verifyWebhook` stub returns false, no secret handling)
- Webhook HMAC + `audit_logs.idempotency_key` (3.9 hardening)
- Mobile billing screen server integration (3.2 will replace local `useBilling` with `trpc.billing.*` and build manage portal)
- `invitations`/`files`/`push_tokens`/`notifications`/`audit_logs` deltas from Phase 3 ERD (3.2 storage/notifications 3.4/3.5)
- EAS native build, Maestro execution (still deferred per Phase 2 status)

---

## BLOCKED

None for 3.1 scope. EAS/Maestro remain deferred by design (see `docs/phase-2-milestone-3-eas-maestro-ci.md` §8 and `docs/phase-2-identity-saas-core.md` Overall Status).

---

## Files changed (vs `5c1ceba`)

```
packages/database/src/schema.ts          — 4 columns + entitlements table
packages/database/drizzle/0001_spotty_wrecker.sql — migration (new, tracked)
packages/database/drizzle.meta/          — journal (new)
packages/billing/src/entitlements.ts     — NEW pure resolver
packages/billing/src/entitlements.server.ts — NEW server helpers
packages/billing/src/provider.ts         — NEW abstraction
packages/billing/src/entitlements.test.ts — NEW 17 tests
packages/billing/src/index.ts            — re-export pure helpers, useBilling stub
packages/billing/src/billing.test.ts     — extends 3 tests still pass
packages/billing/package.json            — deps + exports
packages/api/src/router.ts               — organizations.create sync + billing router
packages/api/src/billing.test.ts         — NEW RBAC/isolation 8 tests
packages/api/package.json                — add @repo/billing
.github/workflows/ci.yml                 — db:generate check without --dry-run
.gitignore                               — allow packages/database/drizzle/**
pnpm-lock.yaml                           — workspace deps
```

Untracked docs (not yet committed per instruction): `docs/phase-3-milestone-3.1-audit.md`, this file, `docs/phase-3-erd.md`, `docs/phase-3-saas-product-layer.md` (no app code change in those, audit already written), ADRs 011-016 (already untracked).

---

## Security notes

- No `STRIPE_SECRET_KEY`, `REVENUECAT_SECRET_KEY`, `DATABASE_URL`, `BETTER_AUTH_SECRET`, `R2_*` in `apps/mobile` or `packages/billing/src/index.ts` (mobile path). Server secrets stay in `packages/config` private env and `packages/api` server routes only.
- `BillingProvider` methods that would need secrets throw `Billing not configured` unless `BILLING_PROVIDER` set server-side; webhook verification deferred to 3.9 with HMAC fail-closed.
- All `organizationId` from client validated via `organizationMembers` membership + `assertCan` before any DB read/write. Org A cannot read Org B entitlements (tested).
- **Correction before commit (2026-09-01):** `billing.updateSubscription` previously allowed a `billing.manage` client to forge `pro`/`enterprise` by directly writing `subscriptions.status=active`. Fixed to allow only `free` via this client mutation; paid plans now throw `PRECONDITION_FAILED` until verified provider state (BillingProvider → Stripe/RevenueCat → webhook → server sync) is present. Tests use server helper `syncEntitlementsForPlan` directly, not the client procedure, so paid entitlement behavior remains testable without forging provider state.

---

## Risks & limitations documented

- `users.avatar_url` / `deleted_at` / `user_preferences` not introduced (deferred to 3.3)
- `audit_logs.idempotency_key` deferred (no real webhooks yet)
- `entitlements.limit` `null` = unlimited, `0` = none — documented, enforced in `canUseFeature`
- Plan sync is `onConflictDoNothing` — admin manual row survives plan change but subscription `canceled` still gates `enabled=false` (limit preserved). No versioned entitlement history in V1 (per audit ambiguous item).

---

## Next action

Ready for **Milestone 3.2 — Teams + Invitations** (invitations.status/code, member removal/role change/ownership transfer, gated by `members.limit` via `canUseFeature`).

Commit: NOT COMMITTED (per instruction — run `git status`/`git diff --stat` shows 9 modified + 9 untracked + 1 migration, `.env.development` intentionally untracked)
