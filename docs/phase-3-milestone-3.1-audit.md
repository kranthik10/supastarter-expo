# Phase 3 Milestone 3.1 Audit

**Date:** 2026-09-01
**Baseline commit:** `5c1ceba` (branch `main`, HEAD at `5c1ceba` baseline + local phase-3 docs untracked)
**Repository state:** `git status` had inherited uncommitted Phase 3.1 changes plus `.env.development` (intentional and untracked). The baseline at `5c1ceba` had no Phase 3.1 schema delta and only `drizzle/0000_groovy_the_watchers.sql`.
**Milestone:** 3.1 — Billing + Entitlements
**Proposal source:** `docs/phase-3-erd.md` (additive delta) + `docs/phase-3-saas-product-layer.md` §§12–13 + ADRs 006, 011
**Auditor:** Stage A — exhaustive schema + package inspection

---

## Baseline

- **Validation at 5c1ceba:** `typecheck: PASS` (26 tasks), `lint: PASS` (14), `test: PASS` (4 files, 30 tests — 18 RBAC + 12 baseline), `build: PASS` (expo export), CI `33515816782` PASS on `main` (Node 24, pnpm 11.24).
- **Git:** `5c1ceba docs: clarify phase 2 status — app/ci complete, eas/maestro deferred` → HEAD docs commits `d9fcf2c`, `6acb582`, `4276710`, `854b664`, `716259d`. Schema file at `5c1ceba` == current working tree.
- **Database provisioning:** `packages/database` Drizzle PG, `DATABASE_URL` via `packages/config` private env, `pnpm --filter @repo/database db:push` + `db:seed` pattern. CI validates schema drift by generating and requiring no `packages/database/drizzle` diff.
- **Phase 2 state:** Auth (Better Auth → Hono → PG, SecureStore), org creation (server assigns `owner`), `assertCan()` enforced per org, `pg` 16 tables, no billing provider call.

---

## Existing schema (authoritative — from `packages/database/src/schema.ts` at 5c1ceba)

**Table count:** 16

| # | Table | Columns (count) | Enums / Types |
|---|-------|-----------------|---------------|
| 1 | `users` | `id text pk`, `email text unique`, `emailVerified boolean default false`, `name text`, `image text nullable`, `createdAt timestamptz default now()`, `updatedAt timestamptz default now()` | — |
| 2 | `accounts` | `id pk`, `userId fk users.id cascade`, `provider text`, `providerAccountId text`, `passwordHash text nullable`, `createdAt` | unique(provider, providerAccountId), index(userId) |
| 3 | `sessions` | `id pk`, `userId fk cascade`, `token text unique`, `expiresAt timestamptz`, `ipAddress`, `userAgent`, `createdAt` | unique(token), index(userId) |
| 4 | `organizations` | `id pk`, `name`, `slug unique`, `logoUrl nullable`, `createdAt`, `updatedAt` | unique(slug) |
| 5 | `organization_members` | `id pk`, `organizationId fk cascade`, `userId fk cascade`, `role enum(role) default member`, `createdAt` | unique(orgId,userId), index(userId) |
| 6 | `roles` | `id pk`, `key text unique`, `name` | — |
| 7 | `permissions` | `id pk`, `key unique`, `description` | — |
| 8 | `role_permissions` | `roleId fk cascade`, `permissionId fk cascade` | unique(roleId,permissionId) |
| 9 | `plans` | `id pk` (values `free/pro/enterprise`), `name`, `priceCents integer`, `seats integer`, `provider enum(provider) default stripe`, `providerPriceId text nullable` | — |
| 10 | `subscriptions` | `id pk`, `organizationId fk cascade indexed`, `planId fk plans.id (no action)`, `status enum(subscription_status)`, `provider enum(provider)`, `providerSubscriptionId text nullable`, `currentPeriodEnd timestamptz nullable`, `createdAt`, `updatedAt` | statuses: `active,past_due,canceled,trialing,incomplete`; providers: `apple,google,stripe,revenuecat` |
| 11 | `invitations` | `id pk`, `organizationId fk cascade`, `email`, `role enum(role) default member`, `token unique`, `invitedBy fk users.id (no action)`, `expiresAt`, `createdAt` | — |
| 12 | `devices` | `id pk`, `userId fk cascade`, `platform text`, `appVersion nullable`, `createdAt` | — |
| 13 | `push_tokens` | `id pk`, `deviceId fk devices.id cascade`, `userId fk cascade`, `token unique`, `provider text default expo`, `createdAt` | unique(token) |
| 14 | `files` | `id pk`, `organizationId fk cascade nullable`, `userId fk cascade`, `key unique`, `url`, `contentType nullable`, `size integer nullable`, `createdAt` | — |
| 15 | `notifications` | `id pk`, `userId fk cascade indexed`, `title`, `body nullable`, `data jsonb nullable`, `readAt nullable`, `createdAt` | index(userId) |
| 16 | `audit_logs` | `id pk`, `organizationId fk set null nullable indexed`, `userId fk set null nullable indexed`, `action`, `targetType nullable`, `targetId nullable`, `metadata jsonb nullable`, `createdAt` | — |

**Enums (4):**

- `role: 'owner','admin','member'`
- `plan: 'free','pro','enterprise'` (plan enum exists but `plans.id` is text pk checked against it only via `planEnum` not enforced as fk — `subscriptions.planId` is text)
- `subscription_status: 'active','past_due','canceled','trialing','incomplete'`
- `provider: 'apple','google','stripe','revenuecat'`

**Indexes / FKs / Uniques:** 10 unique indexes (`users_email_uidx`, `accounts_provider_uidx`, `sessions_token_uidx`, `orgs_slug_uidx`, `org_members_org_user_uidx`, `role_perm_uidx`, `invitations_token_unique`, `push_tokens_token_unique`, `files_key_unique`, `roles_key_unique`/`permissions_key_unique`), 5 regular indexes (`accounts_user_idx`, `sessions_user_idx`, `org_members_user_idx`, `subs_org_idx`, `notifs_user_idx`, `audit_org_idx`, `audit_user_idx`), FK `onDelete: cascade` for owned data, `set null` for audit logs.

**Existing billing implementation:**

- `packages/billing/src/plans.ts`: `PlanId = free|pro|enterprise`, `Plan { id, price: number, seats, highlight }`, `plans` constant (`free 0/1, pro 19/10 highlight, enterprise 99/100`), `planOrder`. Price in dollars (app) vs `priceCents` in DB seed — intentional divergence noted.
- `packages/billing/src/index.ts`: re-export `plans`; Zustand `useBilling` with `{ plan: PlanId, setPlan, hydrate }` persisting `billing.v1` via `@repo/storage` (client-only cache, no DB call).
- `packages/billing/src/billing.test.ts`: 2 tests (3 plans, seats/price).
- **No** provider abstraction (`BillingProvider`), no `entitlements` table, no server billing procedures in `packages/api/src/router.ts` (router has `health`, `users.me`, `organizations.{list,create,get,update}`, `members.{list,invite,remove}` only). `packages/api/src/server.ts` webhooks stub returns `{ ok: true }`.
- **Seed:** `packages/database/src/seed.ts` seeds 11 permissions, 3 roles, 3 plans (`free/pro/enterprise` priceCents `0/1900/9900`, provider `stripe`), demo user/org.

**Existing tests related to billing/permissions:** `packages/billing/src/billing.test.ts` (2), `packages/permissions/src/rbac.test.ts` (18 `can` matrix), `packages/api` no billing tests.

**Existing API billing surface:** none; `permissions` `billing.read`/`billing.manage` defined but only enforced nowhere yet (matrix present, no tRPC use).

---

## Phase 3 ERD comparison (proposal at `docs/phase-3-erd.md`)

**Proposal delta (additive, nullable/defaulted):**

| Group | Proposal |
|-------|----------|
| `users` | `avatar_url text nullable`, `deleted_at timestamptz nullable` |
| `user_preferences` (NEW) | `user_id pk/fk cascade`, `locale`, `theme`, `marketing_opt_in`, `invite_emails`, `billing_alerts`, `quiet_hours_start/end`, `updated_at` |
| `subscriptions` | `trial_ends_at`, `grace_ends_at`, `cancel_at_period_end boolean default false`, `provider_status text nullable` |
| `entitlements` (NEW) | `id pk cuid2`, `organization_id fk cascade`, `feature text`, `limit integer nullable`, `enabled boolean default true`, `unique(organization_id, feature)`, `createdAt/updatedAt` |
| `invitations` | `status enum pending/accepted/revoked/expired default pending`, `responded_at nullable`, `code text unique nullable` |
| `files` | `status enum pending/ready/deleted default pending`, `expires_at nullable`, `updatedAt` |
| `push_tokens` | `invalidated_at nullable` |
| `notifications` | `category text nullable`, `organization_id fk set null nullable` |
| `audit_logs` | `idempotency_key text unique nullable` |

---

## Differences — classification

| # | Change | Classification | Rationale |
|---|--------|----------------|-----------|
| 1 | `subscriptions.trial_ends_at` | **LEGITIMATE ADDITION** | Required for `trialing` state machine; existing `subscription_status` already has `trialing` but no timestamp to evaluate expiry. Nullable → safe. |
| 2 | `subscriptions.grace_ends_at` | **LEGITIMATE ADDITION** | Required for `past_due → grace → canceled` (ADR-011). Nullable → safe. |
| 3 | `subscriptions.cancel_at_period_end` | **LEGITIMATE ADDITION** | User-initiated cancel semantics (card copy in §12); boolean default false → safe. |
| 4 | `subscriptions.provider_status` | **LEGITIMATE ADDITION** | Raw provider audit (`stripe.incomplete` etc.) without enum churn; nullable text → safe. |
| 5 | `entitlements` NEW table | **LEGITIMATE ADDITION** | Core of 3.1 — org-scoped feature gates (`projects.limit`, `members.limit`, `storage.gb`, `ai.tokens`); not a duplicate of `plans` which is price/seats only. |
| 6 | `users.avatar_url` | **UNNECESSARY CHANGE** for 3.1 | `users.image` already stores avatar URL (Better Auth `image`). Proposed `avatar_url` duplicates semantics; alias not justified. Deferred to 3.3 if normalization needed. |
| 7 | `users.deleted_at` | **LEGITIMATE ADDITION — but DEFERRED** | Soft delete belongs to 3.3 `settings.deleteAccount`; not required for billing. Accepted as legitimate but out of scope for 3.1. |
| 8 | `user_preferences` NEW | **LEGITIMATE ADDITION — but DEFERRED** | Belongs to 3.3 (profile) / 3.5 (notify prefs). Not needed for billing/entitlements. |
| 9 | `invitations.status/respondedAt/code` | **LEGITIMATE ADDITION — but DEFERRED** | Belongs to 3.2 (Team+Invitations). Do not bundle into 3.1. |
| 10 | `files.status/expiresAt/updatedAt` | **LEGITIMATE ADDITION — but DEFERRED** | Belongs to 3.4 (Storage hardening). |
| 11 | `push_tokens.invalidated_at` | **LEGITIMATE ADDITION — but DEFERRED** | Belongs to 3.5 (Notifications). |
| 12 | `notifications.category/organizationId` | **LEGITIMATE ADDITION — but DEFERRED** | Belongs to 3.5. |
| 13 | `audit_logs.idempotency_key` | **LEGITIMATE ADDITION — but DEFERRED** | Belongs to 3.9 hardening / webhook idempotency; not needed until real webhooks land. Note as future column, don't migrate in 3.1. |
| 14 | `plans` add `features/limits` columns | **UNNECESSARY CHANGE** | `plans` is price/seats seed; entitlements are per-org rows derived from plan, not per-plan JSON. Duplicating limits in `plans` creates two sources of truth. Entitlements table is sufficient. |
| 15 | Replacing `planEnum` with new enum value | **UNNECESSARY** | `free/pro/enterprise` enum matches `plans.id` text ids; no new plan in 3.1. |
| 16 | RLS enablement | **UNNECESSARY CHANGE / CONFLICT** | ADR-016 explicitly says authorization stays in `packages/api` via `assertCan()`; RLS would be a second policy engine and is deferred. |

**Summary:** For Milestone 3.1, **only changes 1–5 are IMPLEMENTED**. Changes 6 is rejected; 7–13 are legitimate but deferred to their owning milestones; 14–16 are rejected as unnecessary/conflicting for 3.1.

---

## Legitimate changes (for 3.1)

### CHANGE: `subscriptions.trial_ends_at`
- **WHY:** `subscription_status=trialing` has no horizon to evaluate `trial expired` without it; entitlement resolver needs `trialEndsAt` to gate (§13).
- **SOURCE:** `docs/phase-3-erd.md` subscriptions delta + `phase-3-saas-product-layer.md` §12.3 + ADR-011.
- **SAFE MIGRATION:** `ALTER TABLE subscriptions ADD COLUMN trial_ends_at timestamp with time zone;` nullable, no default needed; existing rows stay valid (null = no trial).
- **AFFECTED PACKAGE:** `@repo/database` schema + seed (optional), `@repo/billing` resolver reads it.
- **TEST REQUIRED:** `subscriptions` trialing with future vs past `trialEndsAt` → enabled/disabled.

### CHANGE: `subscriptions.grace_ends_at`
- **WHY:** `past_due` → grace period before `canceled` (ADR-011, §12.3).
- **SOURCE:** same as above.
- **SAFE MIGRATION:** `ADD COLUMN grace_ends_at timestamptz;` nullable.
- **AFFECTED PACKAGE:** `@repo/database`, `@repo/billing` resolver.
- **TEST REQUIRED:** `past_due` within grace → enabled (grace), after grace → disabled.

### CHANGE: `subscriptions.cancel_at_period_end`
- **WHY:** User-initiated cancel ("keep access until period end") copy + logic.
- **SOURCE:** same.
- **SAFE MIGRATION:** `ADD COLUMN cancel_at_period_end boolean DEFAULT false NOT NULL;` — default covers existing rows (existing drizzle `default(false)` ensures migration default).
- **AFFECTED PACKAGE:** `@repo/database`, `@repo/billing` (exposed via `getSubscription`).
- **TEST REQUIRED:** flag true vs false does not affect enabled unless combined with status.

### CHANGE: `subscriptions.provider_status`
- **WHY:** Raw provider state for audit without enum churn (`stripe.incomplete` etc.).
- **SOURCE:** same.
- **SAFE MIGRATION:** `ADD COLUMN provider_status text;` nullable.
- **AFFECTED PACKAGE:** `@repo/database` only (read by webhook layer later, not resolver).
- **TEST REQUIRED:** storage only; no resolver branch.

### CHANGE: `entitlements` NEW TABLE
- **WHY:** Org-scoped feature gates per ADR-011 and §13; `plans` alone cannot express per-org overrides or usage limits.
- **SOURCE:** `docs/phase-3-erd.md` § entitlements + ADRs 011 + `phase-3-saas-product-layer.md` §13.
- **SAFE MIGRATION:** `CREATE TABLE entitlements (id text pk, organization_id text fk cascade, feature text, limit integer, enabled boolean default true, created_at/updated_at timestamptz default now(), unique(org,feature))` — new table, no data loss.
- **AFFECTED PACKAGE:** `@repo/database` schema, `@repo/billing` entitlements service, `@repo/api` billing router, seed.
- **TEST REQUIRED:** enabled/disabled/limited/unlimited/unknown feature; org isolation; plan→entitlements init.

---

## Rejected changes (for 3.1)

| Change | WHY rejected |
|--------|--------------|
| `users.avatar_url` | Duplicates `users.image` (existing Better Auth `image` = avatar URL). Grep shows `image` already populated via Better Auth and `packages/types User.image`. Second column adds confusion; if normalization desired in 3.3, migrate `image → avatar_url` then — not now. |
| `user_preferences` | Belongs to 3.3; no billing flow reads it. Adding it now couples billing milestone to settings storage. |
| `invitations` delta | Belongs to 3.2; inviting is not billing. |
| `files` delta | Belongs to 3.4; storage presign contract is 3.4. |
| `push_tokens`/`notifications` deltas | Belongs to 3.5. |
| `audit_logs.idempotency_key` | Valid but belongs to 3.9 webhook hardening; real Stripe/RC webhooks not implemented in 3.1 (stub remains). Adding now without webhook handler is premature. |
| `plans` features/limits column | Would duplicate entitlements table; `plans` stays price/seats seed, entitlements encode limits. |
| RLS | Explicitly deferred per AGENTS and ADR-016; API is boundary. |

---

## Ambiguous items

| Item | Ambiguity | Resolution |
|------|-----------|------------|
| `plans.price` (dollars, in `packages/billing/src/plans.ts`) vs `plans.priceCents` (integer, DB seed) | App price is dollars, DB is cents — 19 vs 1900. | Not a conflict — keep both accurate: app `price` is display, DB `priceCents` is billing source. No migration. Resolver must not mix them. Documented in B5 note. |
| `subscriptions.provider` enum `apple/google/stripe/revenuecat` vs seed only `stripe` | Seed uses `stripe` only; RC/Apple rows not yet present. | No ambiguity — provider is a column, seed can remain stripe-only. Billing abstraction will support both; resolver is provider-agnostic. |
| Entitlement scope `organization` vs `subscription` vs `user` | Phase 3 ERD says org-scoped; subscription is child of org, plan is template. | Affirmed org-scoped (ADR-011). Entitlements FK is `organization_id`, not `subscription_id` — keeps gates stable across subscription rotation. |
| Per-organization override semantics after plan change | The Phase 3 specification does not define an override source or lifecycle. | Deferred. In 3.1, entitlement rows are materialized plan defaults and plan changes refresh them. A future override capability requires an explicit source/lifecycle design before it can preserve overrides safely. |
| `billing.manage` vs new `billing.*` perms | Should entitlements introduce `billing.manage_entitlements`? | No — reuse existing `billing.read`/`billing.manage` (Phase 0 matrix). No new permission in 3.1. |

---

## Billing architecture assessment

**Existing:** Zustand `useBilling` (client cache only, `billing.v1` key), `plans` constant, 2 tests, no provider. `packages/api` has no billing routes, `packages/billing/package.json` depends only on `@repo/storage @repo/types`.

**Phase 0 decision (ADR-006):** `packages/billing` abstraction behind `BillingProvider` (`getProducts/purchase/restore/getSubscription`) with backends `RevenueCat` (IAP) + `Stripe` (web/seats), webhooks at `/api/rest/webhooks/{stripe,revenuecat}` writing to `subscriptions`, enforcement org-scoped server-checked.

**Assessment:**

- **Do not bypass abstraction:** provider logic must never be in `apps/mobile`, `packages/api`, or `packages/database`. New code in `packages/billing/src/*` only (provider interface + entitlements service), consumed by `packages/api/src/router.ts` billing procedures.
- **Mobile stays ignorant:** screens call `trpc.billing.*` (tRPC) which delegates to server-side `getEntitlement`/`getSubscription`; no `STRIPE_SECRET_KEY` in bundle (private env stays in `packages/config` private, `packages/api` server).
- **Provider implementations deferred:** real `RevenueCatProvider`/`StripeProvider` classes are stubs behind `BillingProvider` interface in 3.1. Webhooks remain handlers with HMAC verification deferred to 3.9 (add interface, not fake insecure handler). This milestones ships the **abstraction + DB state + resolver + RBAC**, not the App Store sheet.
- **Package deps minimal:** `packages/billing` gains `@repo/database` (server resolver) but only via server import path (tRPC server imports it). Mobile path (`@repo/billing` client) must not import `better-auth` or `R2_*`. Verified by dependency graph §6 of Phase 3 spec — acyclic.

---

## Entitlement architecture assessment

**Decision:** Org-scoped per ADR-011. Feature strings are `feature = 'projects.limit' | 'members.limit' | 'storage.gb' | 'ai.tokens'` (central `Feature` union, additive). Resolver signature:

```ts
isFeatureEnabled(orgId, feature) -> boolean
getFeatureLimit(orgId, feature) -> number | null   // null = unlimited
canUseFeature(orgId, feature, usage) -> boolean    // usage < limit
getEntitlement(orgId, feature) -> { enabled, limit, plan, status }
```

**Enforcement:** Server-side only. Client `useCan`/billing badge is UX; every gated mutation (`members.invite` limited by `members.limit`, storage by `storage.gb`) will call `canUseFeature` before write in its procedure. This milestone ships `billing.getEntitlement` + `getSubscription` as proof; full gating of other domains is 3.2+ but helper is ready.

**Plan → entitlements sync:** On `organizations.create`, the organization, owner membership, and free-plan entitlement rows are written atomically. On `billing.updateSubscription`, `syncEntitlementsForPlan` upserts plan defaults so the effective limits change with the plan. Per-organization override management is deferred.

**Security:** No entitlement decision trusted from client; `organizationId` from client is validated via membership + `assertCan(billing.read)` before resolver runs. Org A cannot read org B entitlements (checked by membership). Tests required per §B9.

---

## Migration safety assessment

- All 5 changes are `ADD COLUMN nullable` or `ADD COLUMN default false not null` or `CREATE TABLE` — no `DROP`, no `RENAME`, no `alter column nullable→not null` without default, no `unique` addition that conflicts existing rows (entitlements unique is on new table only).
- Existing rows: `subscriptions` rows (demo org currently has none; seed creates no subscription) remain valid; new columns are null/false.
- `entitlements` FK `organization_id → organizations.id cascade` — owned data pattern consistent with `organization_members` & `files`.
- `pnpm --filter @repo/database db:generate` will emit one SQL file with `ADD COLUMN`/`CREATE TABLE`/`CREATE UNIQUE INDEX entitlements_org_feature_uidx` only.
- Rollback is `DROP TABLE entitlements` + `DROP COLUMN` — not executed, but safe because no data migration.
- No `citext` or `pgcrypto` needed.
- CI generates and checks that `packages/database/drizzle` remains unchanged after a committed migration (no drift).

---

## Implementation plan (for Stage B)

1. **DB schema** (`packages/database/src/schema.ts`): add `entitlements` table + 4 `subscriptions` columns. Export them. Generate migration via `pnpm --filter @repo/database db:generate`.
2. **Billing package** (`packages/billing`):
   - `src/plans.ts` unchanged except export `planEntitlements: Record<PlanId, { feature: Feature, limit: number|null, enabled: boolean }[]>` mapping tiers to defaults.
   - `src/entitlements.ts` NEW — `Feature` union, resolver (`getEntitlement`, `isFeatureEnabled`, `getFeatureLimit`, `canUseFeature`), sync helper `syncEntitlementsForPlan(orgId, planId)` + `initEntitlementsForOrg(orgId, planId)`.
   - `src/provider.ts` NEW — `BillingProvider` interface stub + `getBillingProvider()` factory (returns `StripeStubProvider` now), no secret import in mobile path.
   - `src/index.ts` re-export new files; keep `useBilling` Zustand cache (not used for authz).
   - `src/entitlements.test.ts` NEW — enabled/disabled/limited/unlimited/unknown, org isolation (mock DB), plan→init, trialing/past_due/grace lifecycle.
3. **API** (`packages/api/src/router.ts`): add `billing` router with `getSubscription` (billing.read), `getEntitlement` (billing.read), `listEntitlements` (billing.read), `updateSubscription` (billing.manage, plan change → `syncEntitlementsForPlan`). All `protectedProcedure` + membership + `assertCan`.
4. **Organizations hook** (`packages/api/src/router.ts` `organizations.create`): after creating `organizations` + `owner` membership, also call `syncEntitlementsForPlan(orgId, 'free')` (default plan) inside same logical flow (transaction where possible).
5. **RBAC:** Reuse `billing.read`/`billing.manage`; no new permission.
6. **Tests:** billing package tests + `packages/api` `router.test.ts` style (in-process caller) for billing RBAC/isolation (see B9).
7. **Validation:** `pnpm --filter @repo/database db:generate` followed by `git diff --exit-code -- packages/database/drizzle`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.

---

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `lib/billing/plans.ts` vs DB `plans.priceCents` confusion | High | Medium — price mismatch | Keep app `price` (dollars) separate; server reads `priceCents`; no conversion in resolver; doc note in code. |
| `entitlements.limit` null vs 0 ambiguity | Medium | Medium — unlimited vs none | Type `number \| null` where null = unlimited; 0 = none; validated in helper, not in DB check. |
| Future override semantics | Medium | Low — a future manual override needs a source/lifecycle | 3.1 has no override management; sync refreshes materialized plan defaults. Design the override model before exposing admin edits. |
| `organizationId` from client bypasses org check | Low | Critical — data leak | Every billing procedure does membership fetch before entitlement read — tested with org-A vs org-B negative. |
| Webhook prematurely trusted | Low | High — fake premium | Webhooks deferred; if any handler ships in 3.1 it must be HMAC-gated behind env check or not mounted; stub remains `{ ok:true }` if provider not configured. |
