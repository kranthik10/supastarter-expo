# Phase 4.5 — List/Search/Filter/Sort/Pagination/Refresh Delivery

**Historical implementation baseline:** `c766c1661b45e75574b5f7a23219f0abe941c963`
**Milestone:** 4.5 Reusable list conventions
**Status:** IMPLEMENTED, awaiting validation + review + commit

## IMPLEMENTED

- `apps/mobile/lib/list-policy.ts` (new): pure, tested list helpers.
  Server remains authoritative for membership, ordering, and pagination
  boundaries; these helpers only present already-returned data.
  - `normalizeSearchQuery` — trim, collapse whitespace, cap 64 chars.
  - `matchesSearchQuery(fields, query)` — case-insensitive substring
    across fields; empty query matches all (clearing restores full list).
  - `sortByField(items, getValue, direction)` — stable, non-mutating,
    nullish-last in both directions; supports string/number/Date.
  - `flattenPages(pages)` — cursor-page `{ items }` flattening.
  - `resolvePageLimit(requested, fallback)` — clamp to server 1..100.
- Team screen consumes search/filter/sort: debounced (250 ms) member
  search over name+email, role filter chips (all/owner/admin/member),
  A–Z/Z–A name sort toggle, no-match empty text. Bounded member list
  (≤100) is fully client-filterable, so filtering is exact.
- Notifications screen consumes pagination/refresh conventions:
  `flattenPages` over `useInfiniteQuery` pages, pull-to-refresh via
  `RefreshControl` (`isRefetching && !isFetchingNextPage`), existing
  cursor load-more retained.
- `Screen` (`@repo/ui`) accepts optional typed
  `refreshControl?: ReactElement<RefreshControlProps>`; passed through
  to the ScrollView. No behavior change when omitted.
- i18n parity: `team.searchMembers/noMatchingMembers/filterAll/sortAZ/sortZA`
  in en + de (de typed as `typeof en`, enforced by typecheck).

## Conventions contract (consumed by 4.6 reference CRUD)

```text
search   normalizeSearchQuery → matchesSearchQuery (debounce ~250 ms in screen)
filter   finite chip set, 'all' default, server enum values verbatim
sort     sortByField, stable, nullish-last, explicit direction toggle
paging   useInfiniteQuery { initialPageParam, getNextPageParam } + flattenPages + load-more
refresh  Screen refreshControl + query refetch; cached rows stay visible on failure
keys     ['domain', 'list', orgId?, ...filters] namespacing for invalidation
```

## VERIFIED

- `apps/mobile/lib/list-policy.test.ts`: 17 tests (red→green; the
  nullish-last-desc case failed first and fixed the comparator).
- Full gate + review + CI: pending.

## DEFERRED

- Server-side search/filter/sort params (no endpoint needs them yet;
  4.6 Notes CRUD reuses these client conventions on bounded lists).
- Virtualized FlatList/FlashList (current lists are bounded; revisit
  when a list can exceed ~100 rows).
