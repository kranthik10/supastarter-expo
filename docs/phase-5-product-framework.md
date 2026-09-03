# Phase 5 — Product Framework

## What is a product module?

A vertical slice through the existing packages reusing shared
foundations — not a new package per domain, not a mega-app package.

## Where does it live?

```text
packages/database/src/schema.ts      table + indexes + RLS-safe org FK
packages/api/src/router.ts           router({…}) section (central file)
apps/mobile/app/<module>/            list / new / [id] routes
apps/mobile/features/<module>/       query keys, hooks, form schema
packages/ui                          shared states only (no domain widgets)
```

Canonical shape, permission pattern, and routing rules:
`docs/phase-5-product-module-architecture.md`.

## How does it expose server APIs?

`protectedProcedure` → strict zod input (organizationId first) →
`requireNoteActor`-shaped guard → org-constrained queries →
public projection. Full contract:
`docs/phase-5-server-module-contract.md`.

## How does it declare permissions?

`<module>.<action>` strings (e.g. `notes.read`), server-asserted via
`assertCan`; client role checks UX-only.

## How does it enforce organization scope?

membership → permission → `eq(table.organizationId)` on every
operation. IDOR-by-construction; cross-org reads/updates/deletes denied.

## How does mobile consume it?

`orgModuleKey(module, variant, orgId, …params)` keys
(`[module, variant, orgId, …]`), `useInfiniteQuery` + `flattenPages`,
targeted invalidation (list on create/update/delete, detail on
update/delete). Full contract:
`docs/phase-5-mobile-module-contract.md`.

## How does routing work?

Expo Router stays authoritative: list at `/<module>`, create at
`/<module>/new` (static-first), detail at `/<module>/[id]` with
`SAFE_SEGMENT` single-segment gating; deep links via
`normalizeSafeInternalRoute` allowlist. No client registry —
registration is the 5-file checklist in
`docs/phase-5-module-registration.md`.

## How do search/filter/sort work?

Server: bounded `search` (≤128) + `z.enum` filters/sorts only, or
documented N/A. Client: `normalizeSearchQuery` / `matchesSearchQuery` /
`sortByField` (stable, nullish-last) over loaded pages.

## How are errors represented?

Finite tRPC codes (`UNAUTHORIZED FORBIDDEN NOT_FOUND CONFLICT
VALIDATION RATE_LIMIT NOT_CONFIGURED INTERNAL`), localized keys,
`resolveQueryState` → Loading/Empty/Error/Permission states.

## How are analytics/monitoring integrated?

Catalog events with `{ organization_id }` only — content/PII rejected
by policy test. Expected domain errors never reported as crashes.

## How is a module tested?

Matrix in `docs/phase-5-testing-contract.md`: unauth/non-member/cross-org
denial, org-stamped creates, pagination/sort/filter bounds, mobile
state/key/nav tests, authored Maestro flow. Reference suites are the
conformance proof — no abstract framework.

## How do I add a new module?

Follow `docs/product-module-guide.md` (12 steps) + the checklist.
Read Notes as the worked example.

## What is NOT abstracted?

Central router file, Expo Router, no generic service base, no registry
with authority, no form/list mega-components, no codegen, no generic
resource tables. See "Deliberately not built" in the architecture doc.
