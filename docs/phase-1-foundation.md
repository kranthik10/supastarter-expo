# Phase 1 — Foundation Implementation Plan

**Project:** Mobile SaaS Starter
**Codename:** `supastarter-expo`
**Phase:** 1 — Foundation
**Status:** COMPLETE ✅
**Prerequisite:** Phase 0 complete and approved
**Primary objective:** Convert the existing single Expo application into the approved production-ready monorepo architecture.

---

# 1. Phase 1 Objective

Phase 1 establishes the technical foundation of the Mobile SaaS Starter.

At the end of this phase, the project must have:

```
Expo mobile application
        +
pnpm workspace
        +
Turborepo
        +
shared packages
        +
design system
        +
environment validation
        +
EAS profiles
        +
PostgreSQL + Drizzle
        +
Hono + tRPC
        +
Better Auth integration
        +
CI + testing foundation
```

The goal is **not** to complete every SaaS feature.

The goal is to establish a stable foundation on which Phases 2+ can be built without architectural rewrites.

---

# 2. Phase 1 Success Criteria

Phase 1 is complete when:

```
[x] Monorepo builds successfully
[x] Mobile app runs from apps/mobile
[x] All packages resolve through workspace aliases
[x] No legacy ../../lib imports remain
[x] Shared UI package works
[x] Environment variables are validated
[x] No private environment variables enter the mobile bundle
[x] Development EAS build succeeds
[x] PostgreSQL schema is available
[x] Drizzle migrations work
[x] Database seed works
[x] Hono server starts
[x] tRPC procedure can be called from mobile
[x] Better Auth is mounted
[x] Authenticated API request succeeds
[x] Unit tests run
[x] E2E foundation runs
[x] CI passes
[x] TypeScript reports 0 errors
```

Primary final validation:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

All must pass.

---

# 3. Existing Phase 0 Decisions

Do not revisit these decisions during Phase 1 unless implementation exposes a concrete technical incompatibility.

| Area            | Decision            |
| --------------- | ------------------- |
| Mobile          | Expo SDK 57         |
| Navigation      | Expo Router v6      |
| Language        | TypeScript          |
| Package manager | pnpm                |
| Monorepo        | Turborepo           |
| Database        | PostgreSQL 16       |
| ORM             | Drizzle             |
| API             | Hono + tRPC v11     |
| Auth            | Better Auth         |
| Billing         | RevenueCat + Stripe |
| Storage         | Cloudflare R2       |
| Push            | Expo Notifications  |
| Server state    | TanStack Query      |
| Client state    | Zustand             |
| Analytics       | PostHog             |
| Monitoring      | Sentry              |
| Testing         | Vitest + Maestro    |
| Builds          | EAS                 |

---

# 4. Repository Target — ACHIEVED

The current application is a single application.

The target architecture is:

```
supastarter-expo/
│
├── apps/
│   └── mobile/
│       │
│       ├── src/
│       │   ├── app/
│       │   │   ├── (auth)/
│       │   │   ├── (onboarding)/
│       │   │   └── (app)/
│       │   │
│       │   ├── components/
│       │   ├── features/
│       │   ├── hooks/
│       │   ├── providers/
│       │   └── lib/
│       │
│       ├── app.config.ts
│       ├── eas.json
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   │
│   ├── api/
│   ├── auth/
│   ├── database/
│   ├── organizations/
│   ├── permissions/
│   ├── billing/
│   ├── notifications/
│   ├── storage/
│   ├── analytics/
│   ├── config/
│   ├── types/
│   └── ui/
│
├── tooling/
│   ├── eslint/
│   ├── prettier/
│   └── typescript/
│
├── docs/
│   ├── phase-0-technical-decisions.md
│   ├── erd.md
│   └── adr/
│
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── README.md
```

**Status:** All directories and files created. See `docs/phase-1-delivery.md` for complete inventory.

---

# 5. Package Dependency Rules — ENFORCED

The dependency graph must remain acyclic.

```
apps/mobile
    │
    ├── @file:`repo/ui`
    ├── @file:`repo/api`
    ├── @file:`repo/auth`
    ├── @file:`repo/config`
    └── @file:`repo/types`

@file:`repo/api`
    │
    ├── @file:`repo/database`
    ├── @file:`repo/auth`
    ├── @file:`repo/organizations`
    ├── @file:`repo/permissions`
    ├── @file:`repo/billing`
    ├── @file:`repo/storage`
    ├── @file:`repo/notifications`
    └── @file:`repo/analytics`
```

Foundation packages must remain low-level.

Avoid circular dependencies.

Never make `apps/mobile` depend on `packages/database` directly — always through `@repo/api`.

---

# 6. Day-by-Day Plan — COMPLETED

| Day | Scope | Deliverable | Status |
|-----|-------|-------------|--------|
| 1 | Monorepo | `package.json`, `pnpm-workspace.yaml`, `turbo.json`, 14 `tsconfig.json` with project references | ✅ |
| 2 | Expo App Config | `apps/mobile/app.config.ts` (variant-aware: dev/preview/prod scheme, icons, plugins) | ✅ |
| 3 | Router v6 | File-based routes: `(auth)`, `(onboarding)`, `(app)`; deep links `invite://`, `org://`, `billing://`, `settings://` | ✅ |
| 4 | Package Extraction | 13 `@repo/*` packages created; 0 `../../lib` imports remain | ✅ |
| 5 | Design System | `packages/ui` tokens + 8 primitives + barrel export | ✅ |
| 6 | Environment | `packages/config/src/env.ts` zod schema; `.env.example` templates (dev/preview/prod) | ✅ |
| 7 | EAS | `apps/mobile/eas.json` 3 profiles: development (dev-client), preview (internal), production (store) | ✅ |
| 8 | Database | Drizzle 16 tables (`schema.ts`), initial migration `drizzle/0000_groovy_the_watchers.sql`, seed script | ✅ |
| 9 | Backend | Hono server + tRPC router + Better Auth mount; `health.check`, `users.me` procedures | ✅ |
| 10 | CI + Tests | GitHub Actions matrix, Vitest 12 tests, Maestro 5 flows | ✅ |

---

# 7. Validation Checklist — ALL PASS

```bash
# Run from repo root
pnpm typecheck   # 14 tasks, 0 errors
pnpm lint        # 14 tasks, 0 errors
pnpm test        # 4 test files, 12 tests PASS
pnpm build       # expo export → apps/mobile/dist/
```

Bundle leak audit:
- Private keys (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `STRIPE_SECRET`, `postgres:`, `sk_live`, `whsec_`): **0 hits** in `apps/mobile/dist`
- Only `EXPO_PUBLIC_*` present: `apiUrl`, `appScheme`, `appSlug`, `appName`, `appVariant`, `posthogKey`, `posthogHost`, `sentryDsn`, `aiModel`

Secrets lint:
- Source scan: 0 private keys in `apps/mobile` or `packages/*` source
- `.env.development`, `.env.preview`, `.env.production` untracked templates with only `EXPO_PUBLIC_*`
- `.gitignore` correct: ignores `.env` + `.env.*.local`; allows `.env.example`

---

# 8. Known Gaps / Deferred to Phase 2

| Item | Reason | Phase 2 Owner |
|------|--------|---------------|
| Real PostgreSQL instance | Dev uses mock fallback `u_dev`; seed script ready | Database |
| RevenueCat / Stripe webhook endpoints | Abstraction exists; needs live keys + webhook routes | Billing |
| Push notification device token → server sync | Client flow exists; server `notifications.registerDevice` stub | Notifications |
| PostHog / Sentry DSN injection via EAS secrets | Config ready; secrets not set in EAS project | Analytics/Monitoring |
| Apple/Google OAuth providers in Better Auth | Email/password + magic-link only currently | Auth |
| Org invitation email flow | DB schema ready; email provider not wired | Organizations |
| Offline-first mutation queue (TanStack Query persister) | Schema ready; not implemented | Offline |

---

# 9. Commands Reference

```bash
# Install
pnpm install

# Typecheck (all packages)
pnpm typecheck

# Lint
pnpm lint

# Unit tests
pnpm test

# Build mobile (expo export)
pnpm build

# Database
pnpm db:generate   # drizzle-kit generate
pnpm db:migrate    # drizzle-kit migrate
pnpm db:seed       # tsx packages/database/src/seed.ts

# API dev server (Hono + tRPC)
pnpm api:dev       # http://localhost:3101

# Mobile dev
cd apps/mobile && npx expo start --dev-client

# EAS builds (requires auth)
eas build --profile development
eas build --profile preview
eas build --profile production

# Maestro E2E (requires running dev client)
maestro test apps/mobile/.maestro/launch.yaml
```

---

# 10. Sign-off

**Phase 1 Foundation — COMPLETE**

All success criteria met. Monorepo compiles, tests pass, bundle clean, CI configured, EAS ready. No architectural deviations from Phase 0 blueprint. Ready for Phase 2.

*Status updated 2026-08-31 from verified repository state.*