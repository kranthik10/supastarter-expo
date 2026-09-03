# Phase 4.6 — Reference CRUD Audit (Notes)

**Baseline:** `ed0fda06fcba125f63d00d0a4c54936e4a544cc3` (4.5 committed, CI green)
**Goal:** one organization-scoped reference CRUD domain consuming the 4.5
list conventions. No unrelated product domains.

## Existing state

- Schema (`packages/database/src/schema.ts`) has no generic reference
  domain. Closest patterns: `files` (org FK `cascade`, user FK `cascade`,
  cuid text id, timestamptz, org/user/status indexes) and `notifications`
  (cursor pagination, `set null` org FK — not suitable for owned content).
- Router (`packages/api/src/router.ts`): `members.list` establishes the
  org-membership gate (actor lookup → `FORBIDDEN` when absent →
  `requirePermission(actor.role, …)`). `notifications.list` establishes
  cursor pagination (`limit 1..100`, opaque cursor, `limit+1` probe).
- Permissions (`@repo/permissions` + `@repo/types`): finite `Permission`
  union; `assertCan` throws `FORBIDDEN`. `files.write` is granted to all
  roles, `files.delete` to owner/admin only.
- Analytics (`@repo/analytics`): finite `analyticsEventNames` catalog +
  typed properties; server captures via `captureServerEvent(provider,
  name, { organization_id })`; client must not duplicate server events.
- API tests use `appRouter.createCaller` with chained fake DBs
  (`team.test.ts`: procedure surface, UNAUTHENTICATED rejection,
  fail-closed mutation attempts with write counters).
- Mobile 4.5 contract: debounced `matchesSearchQuery`, finite filter
  chips, `sortByField`, `useInfiniteQuery` + `flattenPages` + load-more,
  `Screen refreshControl`, `['domain','list',orgId]` query keys.

## Decisions

| # | CHANGE | WHY | SOURCE | SAFE MIGRATION | AFFECTED PACKAGE | TEST REQUIRED |
|---|--------|-----|--------|----------------|------------------|---------------|
| 1 | `notes` table: id (cuid text PK), organizationId FK `cascade` NOT NULL, userId FK `cascade` NOT NULL, title text NOT NULL, body text NULL, createdAt/updatedAt timestamptz | Org-owned reference content must vanish with the org (MATCH `files` convention, REJECT `notifications` set-null) | files table pattern | New table, additive migration | `@repo/database` | `db:generate` no drift |
| 2 | `notes.read/write/delete` permissions; read+write all roles, delete owner/admin | MATCH `files.write/delete` split; read gated per RBAC preference | permissions matrix | Additive union members | `@repo/types`, `@repo/permissions` | rbac test |
| 3 | `note_created/updated/deleted` analytics events with `{ organization_id }` | Server-authoritative lifecycle, no PII (no title/body) | analytics policy pattern | Additive catalog entries | `@repo/analytics` | policy test |
| 4 | `notes` router: list (cursor), get, create, update, delete; membership + assertCan gates; zod title 1..120, body ≤4000 | MATCH members/notification router patterns | router.ts | No schema change | `@repo/api` | caller tests: surface, auth, validation, cross-org FORBIDDEN, member-delete FORBIDDEN |
| 5 | Mobile `notes/` routes: list (4.5 conventions), detail/edit, delete confirm; `['notes',…]` keys; destructive confirm | 4.6 must consume 4.5 conventions | 4.5 contract | None | mobile | typecheck + i18n parity |

## Non-goals (DEFER)

Server-side search params, attachments, sharing outside the org,
soft-delete, realtime updates, FlatList virtualization (bounded
personal/org reference lists).
