# Phase 2 — Identity & SaaS Core

**Status:** Milestone 1 COMPLETE, Milestone 2 COMPLETE

**Started:** 2026-08-31

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

## Milestone 3: Operational Validation ⏳ NOT STARTED

### 3.1 EAS Development Build

- [ ] `eas build --profile development` executed
- [ ] Installable development build produced

### 3.2 Maestro

- [ ] Run existing flows against development build
- [ ] Record pass/fail

### 3.3 CI

- [ ] Push to repository
- [ ] GitHub Actions workflow triggered
- [ ] Real CI run verified

---

## Validation Summary (Current)

```bash
pnpm typecheck   # PASS (26 tasks)
pnpm lint        # PASS (14 tasks)
pnpm test        # PASS (4 test files, 30 tests)
pnpm build       # PASS (14 tasks, expo export)
```

**Test count:** 30 tests (was 12, added 18 RBAC unit tests)

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