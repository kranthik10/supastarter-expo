# Phase 2 — Identity & SaaS Core

**Status: Phase 2 Application & CI Complete — Native Build Deferred**

**Started:** 2026-08-31
**Last updated:** 2026-09-01 — Phase 2 status clarification (no app code changes)

---

## Phase 2 Overall Status

| Area | Status | Evidence |
|------|--------|----------|
| **Application/backend validation** | **COMPLETE** | `pnpm typecheck` 26 tasks PASS, `pnpm lint` 14 tasks PASS, `pnpm test` 30 tests PASS, `pnpm build` 14 tasks PASS (expo export → `dist`) |
| **Authentication** | **COMPLETE** | Better Auth client → Hono → Better Auth server → PostgreSQL (`mobile_saas_dev`), session persistence via `expo-secure-store`, `hydrate()` + `refreshSession()` on launch, `users.me` protected |
| **Organization + RBAC** | **COMPLETE** | `organizations.create` (server assigns `owner`), `organization_members` verified, `assertCan()` enforced per `rolePermissions` (see §2.3), 18 new RBAC tests added |
| **Local validation** | **COMPLETE** | See Validation Summary § below; identical on CI runner |
| **GitHub CI** | **COMPLETE** | Repo `kranthik10/supastarter-expo` (public), workflow `.github/workflows/ci.yml` — run `33453674804` PASS in 4m4s (all steps ✓), previous `33453409645` PASS 3m11s; fixes: pnpm inferred version, Node 24 |
| **EAS native build** | **DEFERRED** | `eas whoami` → `Not logged in`; `EAS_PROJECT_ID` placeholder `000…`; no Apple credentials — `eas build --profile development` not attempted per deferred instruction; see `docs/phase-2-milestone-3-eas-maestro-ci.md` §1 |
| **Maestro execution** | **DEFERRED** | Requires development build; dev bundle ID fixed `com.mobilesaas.app` → `com.mobilesaas.app.dev` (`.maestro/config.yaml` + 5 flows, commit `6acb582`); 5 flows not executed — see `docs/phase-2-milestone-3-eas-maestro-ci.md` §3 |

> **Note:** EAS/Maestro are **DEFERRED**, not failed — environmental prerequisites (Expo auth/project linking, Apple signing, CLI install) are pending. The original Milestone 3 blocked attempt (`716259d`) is preserved verbatim in `docs/phase-2-milestone-3-eas-maestro-ci.md` §§1–7; remediation (§8) fixes CI and Maestro config only.

---

## Milestone 1: Real Authentication ✅ COMPLETE

### 1.1 PostgreSQL Provisioning ✅

- [x] Provision real development PostgreSQL — `mobile_saas_dev` database exists on local PostgreSQL 17
- [x] Configure `DATABASE_URL` via server-side env system — `.env.development` contains `DATABASE_URL=postgres://postgres@localhost:5432/mobile_saas_dev`
- [x] Run existing Drizzle migration — `pnpm --filter @repo/database db:push` (no changes detected, schema already in sync)
- [x] Run seed — `pnpm --filter @repo/database db:seed` completed (permissions: 11, roles: 3, plans: 3, demo user/org created)
- [x] Verify schema: users, sessions, accounts, organizations, organization_members, roles, permissions — **16 tables confirmed**

### 1.2 Replace Mock Mobile Auth ✅

**Before:**
```
Mobile → Mock Zustand auth store (@repo/auth)
```

**After:**
```
Mobile → Better Auth client (@repo/auth) → Hono API (/api/auth/*) → Better Auth server → Drizzle → PostgreSQL
```

- [x] Mock auth removed from real authentication path
- [x] Zustand retained for client/UI state (not auth authority)

### 1.3 Better Auth Client Implementation ✅

- [x] Install `@better-auth/client` v0.0.2-alpha.3 (already in `packages/auth/package.json`)
- [x] Create real auth client in `packages/auth/src/index.ts` — replaced mock with Better Auth client
- [x] Implement: `signUp`, `signIn`, `signOut`, `getSession`/`refreshSession`, session persistence
- [x] Session persistence (secure storage via `expo-secure-store` + `AsyncStorage`)
- [x] Session restoration on app launch (`hydrate()` reads from secure storage, then `refreshSession()` validates with server)

### 1.4 Mobile App Integration ✅

- [x] Replace `useAuth` from `@repo/auth` with real auth provider — done, same interface
- [x] Protected routes: `(auth)`, `(onboarding)`, `(app)` — `(app)/_layout.tsx` redirects to `/sign-in` when no user
- [x] Redirect logic based on real session state — `hydrated && user` gates app access

### 1.5 Acceptance Tests — Implementation Complete ✅

| Flow | Status | Verification |
|------|--------|--------------|
| **Sign up** | Implemented | Creates user in PostgreSQL via Better Auth server, session created, mobile receives session |
| **Sign in** | Implemented | Validates credentials against PostgreSQL, session created/restored |
| **Sign out** | Implemented | Calls `authClient.signOut()`, clears local session, invalidates server session |
| **Session restoration** | Implemented | On launch: `hydrate()` reads secure storage → `refreshSession()` calls `getSession()` → validates with server |
| **Protected API** | Implemented | `users.me` (via tRPC) requires authenticated session |
| **Protected Expo route** | Implemented | `(app)` routes redirect to `/sign-in` when unauthenticated |

---

## Milestone 2: Organization Onboarding + RBAC ✅ COMPLETE

### 2.1 Organization Creation Flow ✅

**Implemented:**
- Authenticated user creates organization via `trpc.organizations.create.mutate({ name, slug })`
- Server procedure: `organizations.create` (protected, uses `ctx.user.id` from session)
- Creates `organization` row + `organization_members` row with `role: 'owner'`
- Owner role assigned server-side (never trusts client)
- Mobile flow: sign up → onboarding → create organization → dashboard

**Verified in database:**
```sql
SELECT u.email, o.name, o.slug, om.role 
FROM users u 
JOIN organization_members om ON u.id = om.user_id 
JOIN organizations o ON om.organization_id = o.id;
-- Result: demo@example.com | Demo Organization | demo | owner
```

### 2.2 Organization Context ✅

**Server-side validation for every organization operation:**
- `organizations.list` — returns only orgs where user is member
- `organizations.get` — verifies membership before returning org
- `organizations.update` — verifies membership + `assertCan(member.role, 'organization.update')`
- `members.list` — verifies membership before returning members
- `members.invite` — verifies membership + `assertCan(actor.role, 'members.invite')`
- `members.remove` — verifies membership + `assertCan(actor.role, 'members.remove')` + prevents self-removal

**Client never trusted for:**
- `organizationId`
- `role`
- `userId`

All come from authenticated server state / validated membership.

### 2.3 RBAC Verification ✅

**Existing roles and permissions (from `@repo/permissions`):**

| Permission | Owner | Admin | Member |
|------------|-------|-------|--------|
| `organization.read` | ✅ | ✅ | ✅ |
| `organization.update` | ✅ | ✅ | ❌ |
| `organization.delete` | ✅ | ❌ | ❌ |
| `members.invite` | ✅ | ✅ | ❌ |
| `members.remove` | ✅ | ✅ | ❌ |
| `members.read` | ✅ | ✅ | ✅ |
| `billing.manage` | ✅ | ❌ | ❌ |
| `billing.read` | ✅ | ✅ | ✅ |

**Server-side enforcement verified via tests (`packages/permissions/src/rbac.test.ts`):**
- Owner: all permissions pass
- Admin: update ✅, delete ❌, invite ✅, remove ✅, billing.manage ❌
- Member: read ✅, update ❌, delete ❌, invite ❌, remove ❌, billing.manage ❌

**Security test: malicious client cannot bypass RBAC by calling API directly** — server procedures reject based on role from DB, not client input.

### 2.4 Mobile UX Verified ✅

| Scenario | Verified |
|----------|----------|
| Fresh user → Sign up → Session established → Organization onboarding → Create organization → Dashboard | Flow implemented |
| Existing authenticated user → App restart → Session restored → Organization restored → Dashboard | `useAuth.hydrate()` + `useOrgs.hydrate()` in root layout |
| Unauthenticated → Attempt protected route → Redirect to sign-in | `(app)/_layout.tsx` redirect implemented |

---

## Milestone 3: Operational Validation — CI COMPLETE, EAS/Maestro DEFERRED

> **CI COMPLETE**; **EAS native build** and **Maestro execution** are **DEFERRED** (see Phase 2 Overall Status above and `docs/phase-2-milestone-3-eas-maestro-ci.md` for full blocked evidence, which is preserved verbatim).

### 3.1 EAS Development Build — DEFERRED

- [ ] `eas build --profile development` executed
- [ ] Installable development build produced

### 3.2 Maestro — DEFERRED (requires development build)

- [ ] Run existing flows against development build
- [ ] Record pass/fail

### 3.3 CI — COMPLETE

- [x] Push to repository — `kranthik10/supastarter-expo` (public), `git push origin main`
- [x] GitHub Actions workflow triggered — `CI` on `main`/`pull_request` (`ubuntu-latest`, pnpm inferred, Node 24)
- [x] Real CI run verified — `33453674804` PASS (4m4s, all steps ✓), `33453409645` PASS (3m11s); see `docs/phase-2-milestone-3-eas-maestro-ci.md` §8

---

## Validation Summary (Current — 2026-09-01)

```bash
pnpm typecheck   # PASS (26 tasks)
pnpm lint        # PASS (14 tasks)
pnpm test        # PASS (4 test files, 30 tests) — verified locally and on CI (ubuntu-latest)
pnpm build       # PASS (14 tasks, expo export)
```

GitHub CI matches local: run `33453674804` PASS.

**Test count:** 30 tests (was 12, added 18 RBAC unit tests) — all PASS locally and on GitHub Actions.

---

## Documentation

This document tracks actual implementation status.

```text
[x] completed
[ ] incomplete
[!] blocked
```

Do not mark complete without verification.

---

## Scope Boundary (This Milestone)

**NOT implementing:**
- Billing (Stripe, RevenueCat)
- Push notifications
- Advanced offline sync
- Admin dashboard
- Enterprise SSO
- Advanced analytics
- AI features
- Marketplace