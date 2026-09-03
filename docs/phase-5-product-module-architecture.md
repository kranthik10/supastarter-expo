# Phase 5.1 — Product Module Architecture

Baseline: `7d6ef1c`. Status: architecture definition (no code).

## Decision

A product module is a **vertical slice through the existing
packages**, not a new package. Repository evidence (Notes, Phase 4)
shows every layer already has a home; new packages per domain would
contradict ADR-002 and the audited dependency directions
(`apps/mobile → ui/api/auth/config/types`,
`api → database/auth/organizations/permissions/billing/storage/notifications`).

Rejected: one mega app package (loses server/client boundary) and
one package per screen/resource (20 tiny packages for 1–2 domains).

## Canonical slice (all touchpoints for an org-scoped resource)

```text
packages/database/src/schema.ts      table + relations + indexes (additive migration)
packages/types/src/index.ts          Permission union members (module.action)
packages/permissions/src/index.ts    role → permission maps + ALL list (+ rbac tests)
packages/api/src/router.ts           procedures under one router key (membership → permission → scoped query)
packages/analytics/src/policy.ts     event catalog entries (IDs only, content rejected)
apps/mobile/app/<module>/           Expo Router: list tab + <module>/new + <module>/[id]
apps/mobile/lib/list-policy.ts       reuse pure search/sort/pagination helpers
apps/mobile/lib/query-state.ts       resolveQueryState + shared UI states for all screens
apps/mobile/lib/i18n/en.ts + de.ts  one <module> block (parity via de: typeof en)
apps/mobile/lib/navigation-policy.ts static routes + bounded :segment patterns
.maestro/flows/<module>.yaml      authored flow on verified labels (execution deferred)
docs/                                 audit + delivery records per milestone convention
```

## Public vs internal

- Public (importable by mobile): `@repo/api` (tRPC client), `@repo/auth`
  stores/actions, `@repo/organizations` stores, `@repo/ui` components,
  `@repo/analytics` facade, `@repo/notifications/policy` pure helpers.
- Internal (server-only): `@repo/database`, provider implementations
  (`*/server` subpaths), private config, raw secrets. Mobile must never
  import these (bundle audit gate).

## What is reusable vs domain-local (from Notes audit)

Reusable: `requireOrgActor` shape (membership → permission → scoped
query), strict-zod list envelope (bounded limit/cursor/search),
limit-plus-one `(createdAt,id)` pagination, `resolveQueryState`,
shared states, `normalizeSafeInternalRoute`, i18n block pattern,
finite-error mapping, org-keyed query keys, invalidation rules.

Domain-local: table columns, permission names, validation bounds,
filter/sort dimensions, form fields, event names, copy.

## Conventions vs code

Phases 5.2/5.3 record the server/mobile contracts as documentation
over the proven Notes shape plus two tiny extracted helpers only
where duplication is real (query-key factory, see 5.3/5.6). No
meta-framework, no codegen, no generic resource tables, no
client-side authorization authority.

## Open (owned by later milestones)

- 5.5 inspects whether a module registry is justified (default: no —
  checklist over registry at this module count).
- 5.6 aligns Notes to the final pattern (query-key factory adoption).
- 5.8 defines the mandatory isolation-test matrix.
