# Phase 3 — SaaS Product Layer Architecture

**Status:** Phase 3.1 + Phase 3.2 + Phase 3.3 + Phase 3.4 implemented; remaining Phase 3 milestones are specification only
**Historical baseline:** `5c1ceba` (Phase 2)
**Phase 3.1 checkpoint:** `c0f54f7`; documentation closure `33daf39`; GitHub Actions `33539998678` PASS
**Phase 3.2 active baseline:** `f7517ae`; GitHub Actions `33544316656` PASS
**Phase 3.3 active implementation:** User Settings recorded in `docs/phase-3-milestone-3.3-delivery.md`
**Phase 3.4 active implementation:** Storage recorded in `docs/phase-3-milestone-3.4-delivery.md`
**Repository:** `kranthik10/supastarter-expo` (public, main)
**Validation at historical baseline:** `typecheck: PASS` (26), `lint: PASS` (14), `test: PASS` (4 files, 30 tests), `build: PASS` (expo export), CI `33453674804` PASS
**Current implementation validation:** Phase 3.1 CI `33539998678` PASS; Phase 3.2 CI `33544316656` PASS; Phase 3.3 local validation is recorded in `docs/phase-3-milestone-3.3-delivery.md`; Phase 3.4 local validation is recorded in `docs/phase-3-milestone-3.4-delivery.md`

> This document is the Phase 3 blueprint. It extends Phase 0 (`docs/phase-0-technical-decisions.md` + `docs/adr/*` + `docs/erd.md`) and Phase 2 (`docs/phase-2-identity-saas-core.md` + `docs/phase-2-milestone-3-eas-maestro-ci.md`) without contradicting them. Where a conflict exists it is called out explicitly instead of silently changing a decision.

---

## 1. Phase objective

Transform the Phase 2 foundation into a reusable mobile SaaS starter **product layer** — the set of primitives every SaaS needs but does not want to rebuild: billing + entitlements, team invitations, user settings, storage, notifications, analytics, monitoring, dashboard shell, and hardening — so that `npx create-mobile-saas my-app` ships a sellable product on day one and the builder spends time on domain features.

Phase 3 delivers **primitives, not a demo app**: typed APIs, server-enforced rules, provider abstractions, and thin mobile screens that compose them. Every SaaS screen delegates to `packages/*`; no screen talks to Stripe, R2, or PostHog directly.

---

## 2. Current baseline

| Area | Status at 5c1ceba | Location |
|------|-------------------|----------|
| Foundation (monorepo, Expo 57, Router v6, pnpm, Turborepo) | COMPLETE | `apps/mobile`, `packages/*`, `tooling/*`, `docs/phase-1-foundation.md` |
| PostgreSQL + Drizzle (16 tables) + Hono + tRPC v11 | COMPLETE | `packages/database/src/schema.ts`, `packages/api/src/router.ts` |
| Auth (Better Auth → Hono → PG, SecureStore, hydrate) | COMPLETE | `packages/auth`, `apps/mobile/app/_layout.tsx` |
| Organizations + members (server assigns `owner`) | COMPLETE | `packages/api/src/router.ts` `organizations.*` |
| RBAC (`owner/admin/member`, `can()/assertCan()`, matrix) | COMPLETE (30 tests, 18 RBAC) | `packages/permissions`, `packages/types` |
| Billing config (local Zustand, `plans` `free/pro/enterprise`) | STUB | `packages/billing` (no provider calls, no webhook) |
| Storage (presigned upload + metadata + private access) | IMPLEMENTED (fake/not-configured provider; real R2 deferred) | `packages/storage`, `packages/api` |
| Notifications (push stub) | STUB | `packages/notifications` |
| Analytics (console provider) | STUB | `packages/analytics` |
| CI (GitHub Actions, Node 24, pnpm 11.24) | COMPLETE | `.github/workflows/ci.yml`, runs `33453674804` PASS |
| EAS (`eas.json` 3 profiles) + Maestro (5 flows, dev `appId` fixed) | DEFERRED | `apps/mobile/eas.json`, `.maestro/*`, `docs/phase-2-milestone-3-eas-maestro-ci.md` |

**What is intentionally deferred in Phase 2 and stays deferred until EAS creds exist:** cloud `eas build --profile development`, simulator install, Maestro execution on device. They must not be fabricated.

**What Phase 3 must not break:** the acyclic dependency graph, the Better Auth session as system-of-record, server-enforced `assertCan()` on every org-scoped procedure, `EXPO_PUBLIC_*` vs private env split, and the Drizzle schema as migration source of truth.

---

## 3. Scope

**In scope (Phase 3):**

- Billing + subscription + entitlement (trial/cancel/grace/webhook, provider abstraction)
- Entitlements / feature gates and limits
- Team invitations lifecycle (create/accept/reject/expire/revoke, role on invite, ownership transfer)
- User settings, organization settings, billing settings (clearly separated)
- Storage authorization + presigned URL + metadata + org scoping + hard limits
- Notifications device registration + preference + deep link + in-app history
- Analytics taxonomy + identity lifecycle
- Monitoring boundaries + release tracking + PII guardrails
- SaaS dashboard shell (Home/Organization/Team/Billing/Settings/Notifications/Profile)
- Production hardening (validation, auth, RBAC, rate limit, webhook HMAC, idempotency, constraints, logging, retry, session expiry)

**Out of scope (explicitly):**

- Building real Stripe/RevenueCat UI before the abstraction is approved (the abstraction ships first)
- Admin dashboard / super-admin panel (deferred to Phase 4, see Phase 0 §2.3)
- Offline mutation queue / sync engine (Phase 0 ADR-009 deferred; Phase 3 only defines retry/idempotency contracts)
- Multi-region, Enterprise SSO / SAML, advanced 2FA/TOTP/passkeys, AI marketplace
- Redesigning Phase 0 ADRs unless a concrete conflict is identified below

---

## 4. Non-scope (anti-goals)

- A fully designed billing page with marketing copy — architecture provides the entitlement; product copy stays in the app.
- A new state library — no migration from Zustand (UI) + TanStack Query (server state).
- A new auth system — Better Auth remains; `AuthClient` seam unchanged.
- A new monorepo layout — `apps/mobile → packages/*` stays; `packages/ui` stays leaf; `packages/api` stays server boundary.
- A schema change without a Drizzle migration and `db:generate` review.
- Any provider secret reaching the mobile bundle (verified by `packages/config` public/private split + CI `db:generate --dry-run` + bundle leak audit).

---

## 5. Architecture overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Mobile (Expo 57, Router v6)  apps/mobile                                │
│  (marketing) → (auth) → (onboarding) → (app)                             │
│  Home / Organization / Team / Billing / Settings / Notifications / Profile│
│     │                                                                     │
│     ├── Zustand: UI state (theme, locale, activeOrgId, billing plan cache)│
│     ├── TanStack Query: server state (tRPC queries, cache, retry)         │
│     └── Thin screens — no provider SDKs                                  │
│           ↕ tRPC (superjson, httpBatchLink, Bearer session)               │
│           ↕ REST only for webhooks/health (Hono)                          │
├─────────────────────────────────────────────────────────────────────────┤
│ API (Hono + tRPC v11)  packages/api                                      │
│  /trpc/*  (protectedProcedure + enforce(permission) middleware)           │
│  /api/rest/webhooks/{stripe,revenuecat,posthog} (HMAC, idempotency)      │
│  /api/rest/health, /api/auth/* (Better Auth mount)                       │
│     │→ packages/organizations, permissions, billing, storage, notifications│
├─────────────────────────────────────────────────────────────────────────┤
│ Auth  packages/auth  — Better Auth, SecureStore, AuthClient seam          │
│ DB    packages/database — Drizzle schema, migrations, seed, ctx.db        │
│ Types packages/types — PlanId, Role, Permission, Org, Member             │
│ Config packages/config — public vs private env (zod)                      │
│ UI    packages/ui — design tokens + primitives                            │
├─────────────────────────────────────────────────────────────────────────┤
│ Storage   R2 / S3 presigned PUT    (packages/storage)                     │
│ Push      Expo Push → APNs/FCM     (packages/notifications)               │
│ Analytics PostHog abstraction      (packages/analytics)                     │
│ Errors    Sentry RN+Node           (packages/monitoring — new)             │
│ Billing   RevenueCat (IAP) + Stripe (web/seats) behind abstraction          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Invariant:** every org-scoped mutation is `protectedProcedure` → load `organizationMembers` → `assertCan(role, permission)` → transaction → `audit_logs` write (when applicable) — in that order.

---

## 6. Package architecture

```
apps/mobile
  → @repo/ui, @repo/types, @repo/config, @repo/analytics
  → @repo/auth       (client helpers, hydrate, SecureStore)
  → @repo/api        (tRPC client only — never @repo/database directly)
  → @repo/billing    (client abstraction: getProducts/purchase/restore/getEntitlement)
  → @repo/storage    (presign helpers — no secrets)
  → @repo/notifications (registerDevice/getPushToken — no expo-notifications direct)
  → @repo/organizations (helpers, to be thinned — server is source of truth)

packages/api (server)
  → @repo/database, @repo/auth, @repo/organizations, @repo/permissions
  → @repo/billing, @repo/storage, @repo/notifications, @repo/analytics
  → @repo/config, @repo/types

packages/billing     → @repo/database, @repo/config, @repo/types
packages/storage     → @repo/config
packages/notifications → @repo/database, @repo/config (future: expo-server-sdk server only)
packages/analytics   → @repo/config
packages/monitoring  → @repo/config         (new, leaf — RN + Node entrypoints)
packages/organizations → @repo/database, @repo/permissions
packages/permissions → @repo/types (pure, no DB)
packages/auth        → @repo/database, @repo/config
packages/ui, types, config — leaves (no internal deps)
```

**No new upward edges:** `packages/*` must never import `apps/mobile`. New package `monitoring` follows `analytics` pattern (provider seam, console fallback).

**Existing rule preserved:** acyclic graph is enforced via `eslint-plugin-import` + `depcheck` (see ADR-002).

---

## 7. Dependency graph

```
                        apps/mobile
  ┌──────────┬───────────┼──────────┬──────────┬──────────┐
  │          │           │          │          │          │
@repo/ui @repo/auth @repo/api  @repo/billing @repo/storage @repo/notifications
             │          │ client           │            │
             │     @repo/config           │            │
             │          │   @repo/types    │            │
             │          │          │       │            │
             └──────────┼──────────┴───────┘            │
                        │                               │
                  packages/api (server)
   ┌─────────┬───────────┼──────────┬──────────┬─────────┤
   │         │           │          │          │         │
@repo/database @repo/organizations @repo/permissions @repo/billing @repo/storage ...
   │         │                       │
@repo/auth  └→ RBAC pure             └→ plans, entitlements
```

All Phase 3 packages respect this DAG. New edges (`monitoring`) are leaves.

---

## 8. Database model changes

### 8.1 No breaking change to Phase 0/2 tables

The 16 tables from `packages/database/src/schema.ts` at `5c1ceba` remain exactly as shipped. Changes are **additive** via new migrations; column renames/deletions are forbidden without an ADR.

### 8.2 Required additive changes (behind feature flags, reviewed via `db:generate`)

| Area | Table / Column | DDL | Rationale |
|------|----------------|-----|-----------|
| Billing | `subscriptions.trial_ends_at` `timestamptz nullable` | `addColumn` | Trial window |
| Billing | `subscriptions.grace_ends_at` `timestamptz nullable` | `addColumn` | Past-due grace |
| Billing | `subscriptions.cancel_at_period_end boolean default false` | `addColumn` | User-initiated cancel |
| Billing | `subscriptions.provider_status text nullable` | `addColumn` | Raw provider status for audit (e.g. `stripe.incomplete`) |
| Billing | `entitlements` (new) | `createTable` | Per-org feature gates (see §13) |
| Invites | `invitations.status enum('pending','accepted','revoked','expired')` + `responded_at` | `addColumn`/`pgEnum` | Lifecycle beyond token expiry |
| Invites | `invitations.code text unique` (short 6-char join code, nullable) | `addColumn + unique` | Mobile-friendly alternative to token URL |
| Audit | `audit_logs.idempotency_key text unique nullable` | `addColumn` | Webhook idempotency |
| Storage | `files.status enum('pending','ready','deleted') default 'pending'` | `addColumn` | Implemented in migration `0004_real_boomerang.sql`; presign→HEAD-confirm→delete lifecycle |
| Storage | `files.expires_at timestamptz nullable` + `files.updated_at timestamptz not null default now()` | `addColumn` | Pending reservation/orphan cleanup and lifecycle timestamps |
| Storage | `files.user_id`, `files.organization_id`, `files.status` indexes | `createIndex` | File metadata/quota hot paths |
| Notifications | `notifications.category text nullable` | `addColumn` | Category routing |
| Notifications | `push_tokens.invalidated_at timestamptz nullable` | `addColumn` | Token lifecycle |
| Users | `users.avatar_url text nullable` (alias of `image`, normalized) | **REJECTED** | Existing `users.image` is canonical; private avatar upload stores an opaque key there |
| Users | `users.deleted_at timestamptz nullable` | **DEFERRED** | Auth-aware soft-delete/grace lifecycle not implemented |
| Users | `user_preferences` (new) | `createTable` | Implemented in Phase 3.3 for user preferences |

**Example migration (illustrative, not executed in spec phase):**

```sql
-- generated by drizzle-kit generate — review required
ALTER TABLE "subscriptions" ADD COLUMN "trial_ends_at" timestamp with time zone;
ALTER TABLE "subscriptions" ADD COLUMN "grace_ends_at" timestamp with time zone;
ALTER TABLE "subscriptions" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;
CREATE TYPE "invitation_status" AS ENUM ('pending','accepted','revoked','expired');
ALTER TABLE "invitations" ADD COLUMN "status" "invitation_status" DEFAULT 'pending' NOT NULL;
CREATE TABLE "entitlements" (
  "id" text PRIMARY KEY,
  "organization_id" text NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "feature" text NOT NULL,
  "limit" integer,
  "enabled" boolean DEFAULT true NOT NULL
);
CREATE UNIQUE INDEX "entitlements_org_feature_uidx" ON "entitlements" ("organization_id","feature");
```

**Constraints that must be added (already implicit, now explicit):**

- `unique(entitlements.organizationId, entitlements.feature)`
- `check (subscriptions.status in ('active','past_due','canceled','trialing','incomplete') and not (status='trialing' and trial_ends_at is null))` — application-level check preferred to avoid PG enum churn
- `invitations(token unique, code unique where not null)` — one active invite per `(organization_id, email)` via partial index

### 8.3 Seed updates

- `packages/database/src/seed.ts` adds: 3 `entitlements` rows per org (one per plan tier), no billing provider call.

---

## 9. API architecture

**Stack unchanged:** Hono mounts `@better-auth` at `/api/auth/*`; tRPC at `/trpc/*`; REST at `/api/rest/*` exclusively for webhooks + `health`.

**Context (unchanged contract):**

```ts
type ApiContext = {
  req: Request;
  db: DrizzleDB;          // ctx.db ?? getDb()
  user: User | null;      // from Better Auth session (cookie or Authorization: Bearer)
  orgIdFromHeader?: string; // x-organization-id (client's activeOrgId)
};
```

**Router split (existing + Phase 3 additive):**

```
packages/api/src/
  router.ts            — appRouter (health, users, organizations, members, invitations)
  procedures/
    organizations.ts   — list/create/get/update/delete (+ ownership transfer in §14)
    members.ts         — list/invite/accept/revoke/remove/updateRole
    billing.ts         — getEntitlement, createCheckoutSession, createPortalSession, webhook
    storage.ts         — createPresignedUrl, confirmUpload, deleteFile
    notifications.ts   — registerDevice, updatePreferences, list/history, markRead
    settings.ts        — getProfile/updateProfile, updatePreferences, deleteAccount
    analytics.ts       — (no tRPC; server just forwards PostHog server events)
  rest/
    webhooks/stripe.ts, webhooks/revenuecat.ts
    health.ts
```

**tRPC conventions (enforced):**

- **Input validation:** `zod` on every `input(...)`; `z.string().min(2)`-style messages return `BAD_REQUEST` with `issues[]`.
- **Authz:** `protectedProcedure` → membership fetch → `assertCan(role, permission)` → business logic. Never trust `role` or `organizationId` from client alone; re-derive `role` from `organizationMembers`.
- **Errors:** `TRPCError({ code: 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'BAD_REQUEST' | 'CONFLICT' | 'PRECONDITION_FAILED' | 'TOO_MANY_REQUESTS' })`. Client maps to `ApiError` with stable `code` for `lib/api/client.ts`.
- **Batching + superjson:** `httpBatchLink` + `superjson` already wired — no change.
- **REST fallback:** only Stripe/RevenueCat webhooks and `GET /api/rest/health` need REST because providers cannot speak tRPC.

---

## 10. Authentication integration

**No change to Better Auth as system of record.** Phase 3 reuses the Phase 2 flow exactly:

```
Sign up/in → Better Auth handler (Hono → DB sessions) → Set-Cookie / Bearer
          → SecureStore (mobile) → hydrate() on launch → refreshSession() → ctx.user
          → tRPC Bearer → ctx.user hydrated per request
```

**What Phase 3.3 adds (implemented, thin):**

- **Profile:** `settings.getProfile` / `settings.updateProfile` read/write only the authenticated user's `users.name` and validated remote `users.image` reference. `users.image` remains canonical; no `avatar_url` or R2 upload. Direct email change is rejected/deferred to Better Auth verification flow.
- **Preferences:** `settings.getPreferences` / `updatePreferences` lazily persist `user_preferences` with finite `en|de` locale, `system|light|dark` theme, notification preference flags, and paired strict `HH:MM` quiet hours.
- **Password/security:** Better Auth 1.7.2's official `changePassword` endpoint is wrapped by the mobile auth client; no password SQL/hash handling is added. Existing session rows are exposed through user-scoped settings wrappers without returning tokens.
- **Session/device management:** `settings.listSessions`, `revokeSession`, and `revokeOtherSessions` operate on Better Auth's existing `sessions` table, filter by `ctx.user.id`, and omit tokens. Devices/Expo push remain Phase 3.5.
- **Account deletion:** `settings.deleteAccount` performs immediate, ownership-guarded deletion through the existing Better Auth Drizzle tables after deleting sessions. A sole owner receives `PRECONDITION_FAILED: ownership_transfer_required`; delayed soft-delete/hard-delete grace processing is deferred.

**Guardrail:** `apps/mobile/app/(app)/_layout.tsx` gate (`hydrated && user`) stays; no route bypasses it.

---

## 11. Authorization integration

**Server is the only enforcer.** Client `useCan(permission)` is UX only.

**Matrix (unchanged from Phase 0, enforced):**

| Permission | owner | admin | member |
|-----------|:-----:|:-----:|:------:|
| `organization.read` / `members.read` / `billing.read` | ✓ | ✓ | ✓ |
| `organization.update` / `members.invite` / `members.remove` | ✓ | ✓ |  |
| `organization.delete` / `members.update` / `billing.manage` | ✓ |  |  |
| `files.write` | ✓ | ✓ | ✓ |
| `files.delete` | ✓ | ✓ |  |

**Phase 3 additions (permissions added via `packages/permissions`, additive only):**

- `invitations.manage` (alias of `members.invite` semantics, or map to existing `members.invite` — prefer reuse to avoid permission sprawl)
- `settings.manage` (org preferences) — default owner/admin, member read-only
- No new `*` wildcard; least-privilege default stays.

**Enforcement helper:**

```ts
const actor = await getMembership(ctx.user.id, input.organizationId); // from DB
assertCan(actor.role, 'members.invite'); // throws TRPCError FORBIDDEN before insert
// ... then write + auditLogs.insert
```

Every Phase 3 procedure that touches multiple rows does so inside a Drizzle transaction and writes one `audit_logs` row on success (see §20).

---

## 12. Billing architecture

### 12.1 SaaS model

**Supported model:** **B2C + B2B (org-scoped)** — the default starter is B2B-capable but usable as B2C (a single member's org). Pricing copy distinguishes:

- **B2C:** one user ↔ one org ↔ one subscription. Seat = 1.
- **B2B:** one org ↔ many members ↔ one subscription (org billed). Seats = plan `seats`.
- **B2C+B2B:** both simultaneously — creator picks personal vs team org at `create-organization`.

No separate `user_subscriptions` table in V1; per-user billing is modeled as a single-member org and a future `user_subscriptions` migration is noted as optional (no schema added now).

**Plan decision (unchanged):** `free` / `pro` / `enterprise` (`price 0/19/99`, seats `1/10/100`). `plans` is seed-configured; price copy lives in DB and `packages/billing/src/plans.ts`.

### 12.2 Provider abstraction (Phase 0 ADR-006 preserved)

```ts
// packages/billing/src/abstraction.ts (spec)
export type BillingProvider = {
  name: 'stripe' | 'revenuecat';
  getProducts(): Promise<Plan[]>;
  createCheckoutSession(orgId: string, planId: PlanId): Promise<{ url: string }>;
  createPortalSession(orgId: string): Promise<{ url: string }>;
  // webhooks are server-only: /api/rest/webhooks/{stripe,revenuecat}
  getSubscription(orgId: string): Promise<Subscription | null>;
};
export type BillingClient = {
  purchase(planId: PlanId): Promise<void>;      // mobile — delegates to provider via Hono
  restore(): Promise<void>;                      // IAP restore
  getEntitlement(): Promise<Entitlement>;       // feature → { enabled, limit, usage }
};
```

- **RevenueCat path (mobile IAP):** `BillingClient.purchase` → Hono `billing.createCheckoutSession` → provider returns StoreKit sheet / Paywall → on-device purchase → App Store webhook → `/api/rest/webhooks/revenuecat` (HMAC) → upsert `subscriptions` → client `restore()` confirms.
- **Stripe path (web/seats):** `BillingClient.purchase` → `billing.createCheckoutSession` returns `stripe.checkout.Session.url` → `expo-web-browser` opens → Stripe webhook → `/api/rest/webhooks/stripe` → upsert `subscriptions`.

**Mobile never contains `STRIPE_SECRET_KEY`, `REVENUECAT_SECRET_KEY`, or webhook secrets.** Those are private env consumed only in `packages/api/src/rest/webhooks/*.ts` (see §20).

### 12.3 Subscription + webhook processing

**`subscriptions` lifecycle (status enum):** `trialing` → `active` → `past_due` → `canceled` | `incomplete`.

**Additional states modeled via columns, not enum churn:**

- `trial_ends_at`, `grace_ends_at`, `cancel_at_period_end`.

**Webhook handler contract (both providers):**

1. Verify HMAC (`stripe.webhooks.constructEvent` / RevenueCat auth header) — if invalid, `401` before any write.
2. Extract `idempotency_key` from provider event id (`evt_…` / `rc_…`) → `select` on `audit_logs.idempotency_key` unique — if exists, `200` dedup.
3. `transaction`: upsert `subscriptions` (by `provider_subscription_id`), update `updatedAt`/`status`/`currentPeriodEnd`, write `audit_logs` with `idempotency_key`.
4. Never trust provider `email`; join via `organizationId` derived from `client_reference_id` / `app_user_id` (which is `organizations.id`).

**Client polling:** `billing.getEntitlement` reads `subscriptions` + `entitlements` (no provider call). Entitlement is cached via TanStack Query with 5-min stale time.

---

## 13. Entitlement architecture

**Source of truth:** `subscriptions` (status + plan) joined with `entitlements` (per-org overrides). No entitlement is derived on device without server confirmation; mobile cache is `stale-while-revalidate`.

**Table `entitlements` (new):**

```
id pk (cuid2)
organization_id fk organizations.id cascade, indexed
feature text (e.g. 'projects.limit', 'members.limit', 'ai.tokens', 'storage.gb')
limit integer nullable (null = unlimited)
enabled boolean default true
unique(organization_id, feature)
```

**Resolution:**

```ts
function resolveEntitlement(sub: Subscription, plan: Plan, rows: Entitlement[]): Resolved {
  // plan defaults from packages/billing/src/plans.ts (single source of plan copy)
  // overridden by entitlements rows (admin-toggled)
  // status gates:
  if (sub.status === 'canceled' && now() > sub.graceEndsAt) return { enabled: false };
  if (sub.status === 'trialing' && now() > sub.trialEndsAt) return { enabled: false, reason: 'trial_expired' };
  return { enabled: true, limit: effectiveLimit };
}
```

**Mobile usage:**

```ts
const { data: ent } = trpc.billing.getEntitlement.useQuery({ feature: 'projects.limit' });
if (!ent.enabled) return <Paywall feature="projects" />;
```

**Phase 3 starter features (seed):** `projects.limit`, `members.limit`, `storage.gb`. AI tokens (`ai.tokens`) noted but not implemented (schema supports it).

---

## 14. Team/invitation architecture

### 14.1 Roles (unchanged)

`owner` → full, `admin` → invite/remove/update org (not delete, not billing), `member` → read + `files.write`. No new role; no custom roles in Phase 3.

### 14.2 Invitation lifecycle (implemented in Milestone 3.2)

```
create  → pending (token, expires 7d; email delivery reported separately)
        → accepted (creates organization_members, consumed)
        → revoked (organization member or invited-user decline)
        → expired (lazy transition on list/accept/decline/revoke)
```

**Implemented columns:** `status enum`, `respondedAt`; no plaintext/code column. The secure token is the only redemption credential. New tokens are generated server-side with 32 random bytes and existing tokens remain valid. API normalizes email by trim + lowercase before membership/pending-invite checks.

**tRPC procedures (server-enforced):**

| Procedure | Permission / identity | Effect |
|-----------|----------------------|--------|
| `invitations.create` | `members.invite` | Insert pending invitation, write `invitation.created` audit with SHA-256 token hash, call safe email provider seam, return `emailDelivered`/`emailStatus` separately |
| `members.invite` | `members.invite` | Compatibility alias for `invitations.create` |
| `invitations.list` | `members.read` | Lazy-expire stale rows, then list pending invitations without tokens |
| `invitations.revoke` | `members.invite` | Pending-only org-scoped revoke; writes `invitation.revoked` |
| `invitations.accept` | authenticated + verified email match | Validate token/status/expiry, enforce `members.limit`, insert membership and mark accepted in one transaction |
| `invitations.decline` | authenticated + verified email match | Mark pending invitation revoked with `reason=declined`; writes distinct `invitation.declined` audit |
| `members.list` | `members.read` | Return organization-scoped safe user profile fields, role, and joined timestamp |
| `members.updateRole` | `members.update` (owner in current matrix) | Update only admin/member; owner changes require transfer |
| `members.remove` | `members.remove` | Transactional removal; rejects self/owner invariant violations; writes `member.removed` |

**Accept via deep link:** existing `/invite/[token]` route calls `invitations.accept` after the user signs in. The route never displays or logs the token as a diagnostic; app scheme remains the variant from `app.config.ts` (`mobile-saas-dev`, `mobile-saas-preview`, or `mobile-saas`).

**Ownership transfer (implemented):**

- `organizations.transferOwnership` is owner-only, validates the target is an existing non-owner member, and atomically updates old owner → admin and target → owner. It writes `organization.ownership_transferred`; exactly one owner is preserved.

**Audit/security:** lifecycle and team mutations write `audit_logs`; token metadata uses SHA-256, never the raw token. Invite persistence does not depend on email delivery. Current email implementation is a no-op provider returning `not_configured` until a server-side provider is supplied. Invitation create and redemption use a process-local interim rate limiter; distributed enforcement remains a hardening milestone requirement.

---

## 15. Storage architecture

**Status:** Implemented in Milestone 3.4, with real external provider upload deferred until server credentials are configured.

**Invariant:** no `R2_*`/`S3_*` secret reaches the bundle. All bucket access is server-mediated presigning; storage is private by default.

**Flow:**

```
Mobile — uploadAvatar()/storage helper
  1. trpc.storage.createUploadIntent({ organizationId?, filename, contentType, size, purpose? })
       → server: derive user → validate MIME/size → check membership/RBAC
                  → lock organization/quota rows → count ready + non-expired pending bytes
                  → create files row status='pending', server key, expiresAt
                  → sign PUT with server-only R2/S3 provider → return { fileId, uploadUrl, key, requiredHeaders, expiresAt }
  2. PUT file bytes directly to uploadUrl with required headers (no provider credentials)
  3. trpc.storage.confirmUpload({ fileId, purpose? })
       → server loads owned metadata → provider HEAD verifies existence, size, content type
       → set files.status='ready'; avatar purpose also updates users.image to the opaque key
  4. trpc.storage.getDownloadUrl({ fileId })
       → server authorizes private/org scope and ready status → return 5-minute signed GET
  5. trpc.storage.deleteFile({ fileId })
       → authorize → remote delete → set files.status='deleted'; audit org operations
```

**Authorization:** organization uploads require membership + `assertCan(role, 'files.write')`; organization downloads require membership + `organization.read`; organization deletion requires `files.delete`. Personal files force `organizationId = null` and require exact `file.userId == ctx.user.id`. File id/key knowledge alone never grants access.

**MIME + size validation (server, never client trust):**

- Allowlist: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.
- Size: positive integer up to 10 MiB per file; avatar purpose must use an image MIME.
- Filename sanitization: strip path separators, `..`, controls, and unsafe characters; object uniqueness comes from server-generated cuid2.

**Quota:** organization `entitlements.storage.gb` is enforced server-side. Usage is ready bytes + non-expired pending reservation bytes + requested bytes; organization-row/file-row locks serialize concurrent intent requests. Deleted rows and expired pending reservations do not count. Free/pro/enterprise defaults are 5/100/unlimited GiB.

**File metadata:** `organizationId nullable` (private when null), required `userId`, unique server key, compatibility `url` opaque reference, `contentType`, `size`, `status`, `expiresAt`, `updatedAt`. Migration `0004_real_boomerang.sql` adds `file_status`, lifecycle timestamps, and user/org/status indexes.

**Private/public files:** objects are private by default. The existing `url` column stores the opaque key/reference for compatibility, not a permanent public URL. Reads use short-lived provider-signed GETs. Avatar keys use `user/<userId>/avatar/` and `users.image` remains the canonical profile field.

**Provider:** `packages/storage/src/server.ts` exposes the provider interface and AWS S3-compatible R2/S3 adapter; `NotConfiguredStorageProvider` and fake-provider seam cover absent credentials. Provider SDK code is not imported into mobile.

**Orphan cleanup:** `identifyExpiredPendingFiles` and `cleanupExpiredFiles` handle `pending` rows whose `expiresAt` has passed. Scheduled cron/worker execution is deferred.


---

## 16. Notification architecture

**Stack (Phase 0 ADR-007 preserved):** `expo-notifications` (device) → `expo` provider → `push_tokens` + `devices` + `notifications` tables → `Expo Push Service → APNs/FCM`. No Firebase direct.

**Registration:**

```
requestPermissions() → getPushToken() (expo-notifications) → registerDevice({ token, platform, appVersion })
  server: upsert devices(userId, platform), upsert pushTokens(deviceId, userId, token, provider='expo'),
          invalidate any pushTokens for same user with same deviceId but different token (set invalidatedAt)
```

**Token lifecycle:**

- `push_tokens(token unique)` dedups reinstall.
- `invalidatedAt` marks replaced tokens; scheduled sender skips invalidated.
- On `Expo` provider `DeviceNotRegistered` error, server sets `invalidatedAt=now()` for that token (lazy).

**Preferences (`user_preferences` + org override optional):**

```
userPreferences: { marketing: boolean, teamInvites: boolean, billingAlerts: boolean, quietHours: null }
```

Toggled via `notifications.updatePreferences`; server checks preferences before writing `notifications` rows or sending push.

**Categories (server `notifications.category`):**

- `invite.received`, `invite.accepted`, `member.removed`, `billing.trial_ending`, `billing.past_due`, `storage.ready` (future), etc.

**Deep links:**

- Every push payload `data: { route: '/(app)/team' | '/(app)/billing' | '/invite/<token>' }` → `useDeepLinks()` in `apps/mobile/app/_layout.tsx` routes via `expo-linking` scheme `supastarter` / variant schemes.

**Foreground/background behavior (Expo managed):**

- Foreground: `addNotificationReceivedListener` shows in-app banner (`useToast` + `notifications.list` unread count); no system alert unless `shouldShowAlert: true`.
- Background/killed: system tray. Tap → `addNotificationResponseReceivedListener` → deep link.

**In-app history:** `notifications.list` (protected, index `userId`) + `notifications.markRead`. Unread badge in `(app)/(tabs)` header.

**Organization scoping:** push is user-scoped (`notifications.userId`), but server fans out org-wide events by querying `organizationMembers(userId in org)`.

---

## 17. Analytics architecture

**Abstraction preserved:** `packages/analytics` exposes `track/screen/identify/reset` only. No screen imports PostHog directly. Provider is swapped via `setAnalyticsProvider()` at app boot from `EXPO_PUBLIC_POSTHOG_KEY`.

```ts
// packages/analytics — no new API in Phase 3, taxonomy defined below
analytics.track(name, props);   // props: AnalyticsEvent (string|number|boolean|undefined only)
analytics.screen(name, props);
analytics.identify(userId, traits);
```

**Event naming convention (lower_snake, verb_subject):**

```
auth.signed_up, auth.signed_in, auth.signed_out
org.created, org.updated, org.deleted, org.ownership_transferred
invitation.created, invitation.accepted, invitation.revoked
member.removed, member.role_updated
billing.checkout_started, billing.checkout_completed, billing.portal_opened, billing.trial_started
storage.upload_started, storage.upload_confirmed, storage.delete
notifications.registered, notifications.preference_updated
settings.profile_updated, settings.preferences_updated, settings.account_deleted
```

**Common props:** `user_id` (hashed in provider, not raw email), `organization_id`, `plan`, `role`, `platform`, `app_variant`, `app_version`. No free-form `metadata` blob; each event's props are declared.

**Identity lifecycle:**

- `anonymous → authenticated`: on `signed_up`/`signed_in`, call `identify(user.id, { email, name })` and `analytics.identify` for PostHog person; attach `organization_id` after `org.created`/`invite.accepted`.
- `organization_id` is set via `analytics.identify(userId, { organization_id: activeOrgId })` or `analytics.track(..., { organization_id })` — not trusted from client storage alone.
- `reset()` on `signed_out`.

**Privacy:**

- Never track raw `token`, `passwordHash`, `provider_token`, or full email in props (hash or omit).
- `emailVerified` is boolean, not email string in analytics.
- Dev: console provider; prod: PostHog host `EXPO_PUBLIC_POSTHOG_HOST` (default `us.posthog.com`), key via env. `track` is no-op if key missing.

---

## 18. Monitoring architecture

**New package `packages/monitoring`** (leaf, mirrors `analytics` seam) — RN (`@sentry/react-native`) + Node (`@sentry/node` on API).

```ts
// packages/monitoring/src/index.ts (spec)
export function initMonitoring(env: { dsn?: string; variant: string; version: string; }): void;
export function captureError(err: unknown, ctx?: { userId?: string; orgId?: string; route?: string }): void;
export function setUserContext(userId: string | null): void;
export function setOrgContext(orgId: string | null): void;
export const ErrorBoundary: React.FC<{ fallback?: React.ReactNode }>;
```

**Error boundaries:**

- Root `apps/mobile/app/_layout.tsx` wraps with `ErrorBoundary` (Sentry). Fallback shows "Something went wrong — retry" without leaking stack to user in production; dev shows stack.
- API `packages/api` wraps Hono error handler — `TRPCError` codes map to Sentry `level: warning` vs `error`; unexpected exceptions are `captureError` with `level: error`.

**API errors vs auth failures:**

- `UNAUTHORIZED`/`FORBIDDEN` are not Sentry errors — they are logged as `info` with `action` + `userId` hash (no PII) to avoid alert fatigue.
- `INTERNAL_SERVER_ERROR` / provider `5xx` are captured with `orgId`/`route` breadcrumbs.

**Organization + user context:** `setUserContext(user.id)` after `hydrate()`; `setOrgContext(activeOrgId)` after org hydration. Cleared on `signOut`. No email/raw PII in Sentry tags; use opaque IDs.

**Release / env separation:**

- `release = ${EXPO_PUBLIC_APP_SLUG}@${version}` (from `app.config.ts`), `environment = EXPO_PUBLIC_APP_VARIANT` (`development`/`preview`/`production`), `dsn = EXPO_PUBLIC_SENTRY_DSN`.
- Source maps via `sentry-expo-plugin` + EAS `postPublish` in `eas.json` (already present path; Phase 3 only wires `initMonitoring`).
- Dev variant never sends to prod project; dummy DSN (`""`) is no-op.

**PII considerations:**

- No `token`, `password`, `email`, or `pushToken` in Sentry breadcrumbs/tags.
- `audit_logs` and server logs may contain email for compliance but are not Sentry contexts.

---

## 19. Mobile architecture

**Route groups (unchanged):**

```
app/(marketing)/index.tsx       → public landing
app/(auth)/{sign-in,sign-up,forgot-password,verify-email}.tsx
app/onboarding/{index,create-organization}.tsx? → welcome,create-organization
app/(app)/_layout.tsx           → gate: hydrated && user → (app) else → /sign-in
app/(app)/(tabs)/{home,team,billing,settings}.tsx
app/(app)/assistant.tsx, organization/[slug].tsx
```

**Phase 3 screen additions (thin, primitives in `packages/ui`):**

| Tab / Route | Purpose | Data |
|-------------|---------|------|
| `Home` | Org summary + entitlement badge | `organizations.get`, `billing.getEntitlement`, `audit_logs` recent |
| `Organization` (`/organization/[slug]`) | Org settings (name, logo via R2) | `organizations.update` (gated `organization.update`) |
| `Team` (`/(app)/(tabs)/team`) | Member list, invite form, role chips, revoke/remove | `members.list`, `invitations.list/create/revoke`, `members.remove` |
| `Billing` (`/(app)/(tabs)/billing`) | Plan cards, current entitlement, checkout/portal buttons | `plans` (local), `billing.getEntitlement`, `createCheckoutSession/PortalSession` |
| `Settings` (`/(app)/(tabs)/settings`) | Profile, avatar, preferences, delete account | `settings.getProfile/updateProfile`, `user_preferences` |
| `Notifications` (header badge + screen) | In-app list, unread count, mark read | `notifications.list/markRead` |
| `Profile` (within Settings) | Name/avatar/email/security | `settings.updateProfile`, Better Auth `changePassword` |

**State mapping:**

- **Device/UI:** Zustand — `useAuth` (hydrate, SecureStore), `useOrgs` (activeOrgId, hydrate), `useBilling` (plan cache), `useSettings` (locale, isDark). No Zustand for server lists — those are TanStack Query.
- **Server:** TanStack Query over `trpc.*.useQuery/useMutation` — keys `['organizations', …]`, `['members', orgId]`, etc. Stale 5m, retry 2, offline cache handled by `persistQueryClient` optional (see §22).
- **Deep links:** already via `useDeepLinks` → `expo-linking` schemes per variant (`supastarter` prod, per `EXPO_PUBLIC_APP_SCHEME` else variant).

**No provider SDK ever imported in a screen:** billing is `useBilling().purchase`, storage is `uploadAvatar()`/`trpc.storage.*` through the storage helper, notifications is `registerPushToken`, analytics is `analytics.track`.

---

## 20. Security model

| Control | Existing (Phase 2) | Phase 3 additive |
|---------|--------------------|------------------|
| **Auth** | Better Auth session as SoR, `protectedProcedure` checks `ctx.user`, gate in `(app)/_layout` | `settings.deleteAccount` deletes sessions before the Better Auth user row and blocks sole-owner deletion; `listSessions/revokeSession` wrappers are user-scoped; session expiry → `(app)` gate → `/sign-in` |
| **Authz** | `assertCan(role, perm)` per org, role from DB not client | User settings derive `ctx.user.id` and need no organization permission; org/team procedures retain membership + `assertCan` |
| **Input validation** | `zod` on every tRPC input; `users(email unique)` | All Phase 3 inputs `zod`-validated; file `key`/`url` never client-controlled; avatar via `confirmUpload` HEAD check |
| **Rate limiting** | None yet | In-memory leaky bucket (Node) per `(userId, procedure)` (e.g. `invitations.create` 5/min, `storage.createPresignedUrl` 20/min) — Vercel/Cloudflare layer optional via ADR-012 |
| **Webhook verification** | No webhook yet | `stripe.webhooks.constructEvent` with `STRIPE_WEBHOOK_SECRET`; RevenueCat HMAC compare (constant-time); fail-closed `401` before write; `idempotency_key` dedup |
| **Idempotency** | No | `audit_logs.idempotency_key unique` for every webhook; tRPC mutations accept optional `idempotencyKey` header → dedup in transaction |
| **DB constraints** | Unique indexes already | Partial unique `(orgId,email) where status='pending'` for invites; `check` on status+`trial_ends_at`; `entitlements.unique(org,feature)` |
| **Transactions** | Single inserts | Every multi-write (`accept`, `transferOwnership`, webhook upsert) in a single Drizzle transaction + `audit_logs` |
| **Secrets** | Public/private split in `packages/config` | No new secret reaches bundle; `R2_*`, `STRIPE_SECRET_KEY`, `REVENUECAT_SECRET_KEY`, webhook secrets server-only; CI `db:generate --dry-run` guards migration drift |
| **PII** | `emailVerified` pattern | Sentry never tags raw email/token; audit logs keep token hash; analytics props hash IDs |

**Hardest invariant:** the mobile `userId`/`role`/`organizationId` is *never* trusted. Server re-derives membership per request.

---

## 21. Error handling

**API error contract (tRPC, stable `code`):**

```ts
// lib/api/client.ts maps TRPCError codes
type ApiErrorCode =
  | 'UNAUTHORIZED'        // 401 — session missing/expired → redirect /sign-in
  | 'FORBIDDEN'           // 403 — missing permission → toast + hide UI
  | 'NOT_FOUND'           // 404 — org/invite/file not found → empty state
  | 'BAD_REQUEST'         // 400 — zod issues[] — field errors rendered inline
  | 'CONFLICT'            // 409 — already member, already invited, single owner edge
  | 'PRECONDITION_FAILED' // 412 — entitlements limit hit, trial expired
  | 'TOO_MANY_REQUESTS'   // 429 — rate limit — retry-after header honored
  | 'INTERNAL_SERVER_ERROR' // 500 — captured via monitoring, generic message to client
```

**Mobile handling:**

- `401` anywhere → `useAuth().signOut()` → `router.replace('/sign-in')` → `reset()` analytics + Sentry user null — no partial authenticated state.
- `403` → `Toast` + optional `useCan()` gate (UI already hid control; server still enforces).
- `429` → exponential backoff (`500ms, 1s, 2s`, capped 3 retries) via TanStack Query `retry` override; `Retry-After` respected when present.
- Validation errors (`BAD_REQUEST`) → inline field messages from `issues[]`, not generic alert.

**Server logging:**

- Every `TRPCError` is logged with `{ code, path, userIdHash, orgId, durationMs }` — never raw email/token. `INTERNAL` includes `captureError(err, { userId, orgId, route })` when monitoring initialized.

---

## 22. Offline considerations

**Phase 0 ADR-009 remains deferred:** no full mutation queue/sync engine in Phase 3. What Phase 3 does is make offline *safe* and *honest*:

- **No optimistic writes that survive app kill:** every Phase 3 mutation is `network-only` (no optimistic patch). Query cache may be persisted (`createPersister` for TanStack Query with `AsyncStorage`) for *reads* only — stale data shown with "offline" badge, not written back on reconnect without user action.
- **Retry:** TanStack Query `retry: 2` with exponential backoff for `networkError`; no retry for `FORBIDDEN`/`BAD_REQUEST`.
- **Idempotency:** optional `idempotencyKey: createId()` header on every mutation (mobile generates once perTap). Server honors `audit_logs.idempotency_key` unique; retry storms dedup.
- **Session expiry offline:** on any `401` after reconnect, the gate clears `SecureStore` and forces sign-in — no silent reauth loop.
- **Storage uploads:** presigned PUTs are idempotent by `key`; if `confirmUpload` fails offline, mobile retries only after `status='pending'` still within `expiresAt` window. No resume chunking in V1.

Full queue (`@tanstack/query-persist-client` + `mutationCache` + background sync) is Phase 4.

---

## 23. Testing strategy

**Existing:** Vitest (`vitest run --passWithNoTests`), 30 tests (12 baseline + 18 RBAC). `turbo run test` per package.

**Phase 3 additive (no new infra, just more tests; all run via `pnpm test` and CI):**

| Layer | Tool | What | Where |
|-------|------|------|-------|
| Unit | Vitest | `permissions.can()` matrix, `entitlement` resolver, invite token expiry, storage MIME/size validator, analytics event prop typing | `packages/{permissions,billing,storage,analytics}/*.test.ts` |
| API | Vitest (tRPC caller) | `protectedProcedure` + `assertCan` negative tests: `member → organization.delete → FORBIDDEN`, `member → billing.manage → FORBIDDEN`, invite `pending → accepted → revoked → expired` flows, `transferOwnership` only by `owner`, `createPresignedUrl` 403 when not member | `packages/api/src/*.test.ts` (in-process router caller, no HTTP) |
| DB | Vitest + ephemeral PG (or mocked `ctx.db` with Drizzle in-memory) | Unique constraint clashes (`org_members`, `invitations(token)`), idempotency dedup on webhook | `packages/database/*.test.ts` |
| Integration | Vitest + `hono` fetch | REST webhook HMAC verification (`401` on bad sig), health check | `packages/api/src/rest/*.test.ts` |
| Mobile | Vitest (RN) | Hooks `useCan()` gates render; `useBilling` cache; storage flow happy path (mocked tRPC) | `apps/mobile/lib/*.test.ts` |
| E2E | Maestro (deferred) | 5 existing flows (`appLaunch`, `auth`, `deepLink`, `onboarding`, `protected`) plus 2 new flows when build exists: `inviteAccept`, `billingEntitlementGated` — all deferred until dev build | `.maestro/flows/*.yaml` (appId `com.mobilesaas.app.dev`) |
| Contract | `pnpm typecheck` + `pnpm lint` | Types between `packages/types` ↔ `packages/api` ↔ `apps/mobile` | CI + local gate |
| Bundle leak | `pnpm build` + grep | `0` hits for `DATABASE_URL|BETTER_AUTH_SECRET|STRIPE_SECRET|whsec_|sk_live|R2_SECRET` in `apps/mobile/dist`, only `EXPO_PUBLIC_*` present | CI post-build check |

**Execution:** `turbo run test` parallel. CI runs `pnpm test` after `pnpm install --frozen-lockfile` on Node 24 (proven at `33515816782`). Maestro remains deferred — `docs/phase-2-milestone-3-eas-maestro-ci.md` §8 stays accurate.

---

## 24. CI strategy

**Workflow unchanged from Phase 2 remediation** (`.github/workflows/ci.yml` at `5c1ceba` after commits `854b664`/`4276710`):

```yaml
on: { push: { branches: [main] }, pull_request: { branches: [main] } }
concurrency: ci-${{ github.ref }}, cancel-in-progress: true
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4           # inherits pnpm@11.24.0 from packageManager
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint          # 14 tasks — must pass
      - run: pnpm typecheck     # 26 tasks — must pass
      - run: pnpm test          # expect ≥30 (grows with Phase 3 tests)
      - run: pnpm build         # expo export + all packages
      - run: pnpm --filter @repo/database db:generate --dry-run  # continue-on-error (drift detector)
```

**Branching:** `main` is protected; every Phase 3 milestone lands as a single squashed commit after the above checks pass locally and on the branch run.

**EAS:** no EAS job in CI (credentials are not in GH Actions). `eas build --profile development` stays a developer-local step (`eas whoami` shows `Not logged in` expected at `5c1ceba`; creds are `DEFERRED`).

**Caching:** `turbo` remote cache not yet wired; `pnpm` cache via `actions/setup-node` is already effective.

---

## 25. Milestone dependency graph

```
Phase 2 baseline (5c1ceba)
      │
      ├─► 3.2 Team + Invitations  ──────┐
      │         ▲                       │
      │         │ blocks                │ blocks
      │    orgMembers is SoR            │
      │                                 │
      ├─► 3.3 User Settings  ───────────┤
      │         ▲                       │
      │         │                       │
      ├─► 3.1 Billing + Entitlements ───┼─► 3.8 SaaS Dashboard (shell + entitlements + team + billing + settings wiring)
      │         ▲                       │         ▲
      │         │ subscribes            │         │
      ├─► 3.4 Storage  ─────────────────┤         │
      │         ▲ (entitlement gate)   │         │
      ├─► 3.5 Notifications ────────────┘         │
      │         ▲ (preferences)                  │
      ├─► 3.6 Analytics / 3.7 Monitoring ─────────┘ (cross-cutting, parallelizable)
      │            ▲                             │
      └────────────┴─► 3.9 Production Hardening ──┘
                          ▲
                          │
                     3.10 Phase 3 Audit (typecheck/lint/unit+API+E2E/build/CI/security)
```

**Critical path:** `3.2 → 3.1 → 3.8 → 3.9 → 3.10`. Analytics/Monitoring can run in parallel once `3.2` lands.

**EAS/Maestro remain off the critical path** (deferred) — they gate only the native-build audit, not the product-layer audit.

---

## 26. Definition of Done

Phase 3 is Done when **all** of the following are true on `main` at a single checkpoint commit:

- [ ] `pnpm typecheck` — 26+ tasks, 0 errors
- [ ] `pnpm lint` — 14 tasks, 0 errors
- [ ] `pnpm test` — all suites PASS (≥30 at baseline, grows to ~60+ with Phase 3 suites; no skipped)
- [ ] `pnpm build` — `expo export` succeeds; bundle leak check shows 0 private keys
- [ ] CI (`.github/workflows/ci.yml`) — latest `main` push shows `completed success` (all 5 steps green); history preserved (no force-push to fake)
- [ ] DB — new migrations reviewed via `db:generate` (drift detector green), constraints/indexes present per §8, seed passes
- [ ] API — every new org-scoped tRPC procedure has a negative `assertCan` test; invite lifecycle + storage presign + billing webhook handlers have idempotency tests
- [ ] Analytics — every new user-visible flow emits a typed event (no raw vendor call)
- [ ] Monitoring — `ErrorBoundary` at root + API `captureError` with user/org context (hashed IDs)
- [ ] Dashboard — `Home/Organization/Team/Billing/Settings/Notifications` screens present and gated by `useCan()`, with server as source of truth
- [ ] Hardening — rate limit, webhook HMAC, idempotency, soft-delete respected; no secret in bundle (CI verifies)
- [ ] Docs — this file + `docs/phase-3-erd.md` + new ADRs up to date; Phase 0 decisions not silently changed
- [ ] `git status` — CLEAN except intentionally untracked `.env.development`
- [ ] **EAS/Maestro explicitly allowed to be `DEFERRED`** — they are not counted as incomplete; they must remain accurately reported as `DEFERRED` until creds exist

---

## 27. Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Billing webhook divergence** (Stripe vs RevenueCat fields) | Medium | High — entitlements wrong | Single `subscriptions` upsert path; exhaustive webhook fixture tests; idempotency_key prevents double-billing |
| **Invite token leakage** (email interception, brute force `code`) | Low | High — unauthorized org access | 48-hex `token` is cryptographic (`cuid2`); 6-char `code` rate-limited (5/min) + expires 7d + consumed on accept; audit log token hash only |
| **Permission sprawl** (new perm per feature) | High | Medium — maintenance, bugs | Reuse existing 11 permissions; only add when `billing.manage`/`members.invite` truly insufficient; ADR review for each new perm |
| **R2 secret leak** via bundle or logs | Low | Critical | Confirmed via `EXPO_PUBLIC_*` allowlist + post-build grep; server logs redaction for `key` in presign payload |
| **Entitlement race** (webhook delayed, client stale) | Medium | Medium — feature flicker | Entitlement is server-read; client cache 5m but `billing.getEntitlement` refetches on `(app)` focus; webhook upsert is transactional |
| **Notification fatigue** | Medium | Low — churn | Per-user `user_preferences` checked before push; categories batched; quiet-hours respected; in-app badge vs push preference separated |
| **Sentry PII leak** | Low | High — compliance | `captureError` types forbid `email`/`token`; review via ESLint `no-pii` annotation when added |
| **EAS remains blocked** | High (until creds) | Low for Phase 3 — non-blocking | Documented as `DEFERRED`; no code depends on native build; `expo export` proves bundle health |
| **Maestro drift** (`appId` vs variant) | Medium | Low | Fixed at `6acb582` (`com.mobilesaas.app.dev`); flows gated on dev build; CI does not run Maestro so no false green |

---

## 28. ADR list

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| ADR-001 | Why Expo | Accepted | 2026-08-31 |
| ADR-002 | Monorepo (pnpm + Turborepo) | Accepted | 2026-08-31 |
| ADR-003 | PostgreSQL | Accepted | 2026-08-31 |
| ADR-004 | API (Hono + tRPC v11) | Accepted | 2026-08-31 |
| ADR-005 | Auth (Better Auth) | Accepted | 2026-08-31 |
| ADR-006 | Billing abstraction (RevenueCat + Stripe) | Accepted | 2026-08-31 |
| ADR-007 | Push (Expo Notifications) | Accepted | 2026-08-31 |
| ADR-008 | Storage (R2 / S3 presigned) | Accepted | 2026-08-31 |
| ADR-009 | Offline (deferred queue) | Deferred | 2026-08-31 |
| ADR-010 | EAS (3 profiles) | Accepted | 2026-08-31 |
| ADR-011 | Entitlements (org-scoped feature gates) | Proposed (Phase 3) | 2026-09-01 |
| ADR-012 | Invitations lifecycle + ownership transfer | Proposed (Phase 3) | 2026-09-01 |
| ADR-013 | Storage hardening (scoped presign + confirm) | Proposed (Phase 3) | 2026-09-01 |
| ADR-014 | Analytics taxonomy + identity lifecycle | Proposed (Phase 3) | 2026-09-01 |
| ADR-015 | Monitoring boundaries + PII guardrails | Proposed (Phase 3) | 2026-09-01 |
| ADR-016 | Production hardening (rate limit + idempotency + webhook HMAC) | Proposed (Phase 3) | 2026-09-01 |

*ADR-001–010 are existing (unchanged). ADR-011–016 are new Phase 3 decisions — stubs created in `docs/adr/011-*.md` … `016-*.md` with context/decision/consequences; full text is normative once approved.*

---

## Appendix A — B2C / B2B / B2C+B2B determination

**This starter supports B2C+B2B by being org-scoped with a sensible B2C default:**

- Every billing row, entitlement row, and invitation is `organizationId`-scoped.
- A B2C builder creates one org with `seats=1` and never shows the Team tab (entitlement `members.limit=1` hides invite).
- A B2B builder creates one org with `seats>1` and the Team + Billing tabs are entitlement-gated.
- A hybrid builder lets the *user* choose (personal vs team org) at onboarding — the schema needs no fork.

No `user_subscriptions` table is needed in V1; if a B2C-only fork is desired, it is a one-migration additive (`user_subscriptions`) that coexists with org subscriptions behind the same entitlement resolver.

---

## Appendix B — SaaS model file map (what changes in Phase 3 vs what does not)

| File / Package | Phase 3 change | Why |
|---------------|----------------|-----|
| `packages/database/src/schema.ts` | Additive columns/tables per §8 only | Product layer needs entitlements, invite status, prefs, storage status |
| `packages/api/src/router.ts` + `procedures/*` + `rest/webhooks/*` | New procedures + HMAC + rate limit | Server is the enforcer |
| `packages/billing/*` | `BillingProvider` abstraction + entitlement resolver | Keep provider SDKs off device |
| `packages/storage/*` | Presign + confirm (scoped, validated) | No secret in bundle |
| `packages/notifications/*` | Register + prefs + badge | Device lifecycle |
| `packages/analytics/*` | Taxonomy doc, no new API | Avoid scatter |
| `packages/monitoring/*` | **New package** | Sentry seam (RN + Node) |
| `packages/permissions/*` | Additive perms only if justified | Preserve matrix |
| `apps/mobile/*` | Thin screens per §19 | Consumers of packages |
| `packages/auth`, `packages/types`, `packages/config`, `packages/ui` | No structural change (types grow additively) | Preserve seams |
| `apps/mobile/eas.json`, `.github/workflows/ci.yml` | No change in Phase 3 | CI already fixed; EAS stays deferred |

---

## Appendix C — Explicit non-conflicts with Phase 0

| Phase 0 decision | Phase 3 stance | Conflict? |
|-----------------|----------------|-----------|
| Expo 57 + Router v6 | Unchanged | None |
| pnpm + Turborepo | Unchanged, DAG acyclic | None |
| PostgreSQL 16 + Drizzle | Additive only (§8) | None — flagged if any rename/deletion proposed |
| Hono + tRPC v11 | Unchanged; REST only for webhooks | None |
| Better Auth primary | Unchanged; seam preserved | None |
| RevenueCat + Stripe behind abstraction | Preserved, §12 formalizes it | None |
| R2 presigned | Preserved, §15 hardens it | None |
| Expo Push → APNs/FCM | Preserved, §16 formalizes lifecycle | None |
| PostHog abstraction | Preserved, §17 adds taxonomy | None |
| Sentry | Preserved, §18 extracts `packages/monitoring` leaf | None — new leaf does not replace vendor, just seams it |
| Zustand (UI) + TanStack Query (server) | Preserved, §19 maps each | None |
| EAS 3 profiles | Unchanged, documented `DEFERRED` | None |
