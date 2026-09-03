# Phase 5.3 — Mobile Module Contract

Baseline: `7d6ef1c`. Status: contract + one tiny helper
(`apps/mobile/lib/query-keys.ts`, 4 tests). Reference: Notes screens.

## Routes (Expo Router conventions intact)

```text
app/(app)/(tabs)/<module>.tsx   list (tab entry)
app/(app)/<module>/new.tsx      create
app/(app)/<module>/[id].tsx     detail + edit + delete
```

Tab registration in `(app)/(tabs)/_layout.tsx`; deep-link coverage in
`navigation-policy.ts` (statics + one bounded `:segment` pattern, no
nesting/query); auth required by default (absent from PUBLIC_ROUTES).

## Query keys (mandatory)

`orgModuleKey(module, variant, organizationId, ...params)` →
`[module, variant, organizationId, ...params]`. OrganizationId is
always third. Rationale: org switch = new key space = no stale reuse
by construction (plus invalidate-all on switch in the switcher).
User-scoped queries (settings, notifications) keep ad-hoc keys and
must state why they are not org-scoped.

## Queries / mutations

- `useInfiniteQuery` for lists (limit 20, `getNextPageParam` from
  `nextCursor`), `enabled: !!org` (+ `typeof id === 'string'` for detail).
- `useMutation` with `trpc.<module>.<op>.mutate`, organizationId from
  `useActiveOrg()` — never from navigation params or user input.
- Pre-network client validation mirrors server bounds (TITLE_MAX-style
  constants); server remains authoritative.

## Invalidation (no global clear on normal mutations)

```text
create → invalidate ['<module>'] (list refetches; detail created fresh)
update → invalidate ['<module>'] (detail + lists)
delete → invalidate ['<module>'] + router.back() (detail unmounts)
```

Prefix invalidation (`{ queryKey: ['<module>'] }`) covers list and
detail keys. Global `invalidateQueries()` is reserved for org switch
and sign-out.

## Screens

List: `resolveQueryState` + shared states (`Loading/Empty/Error/
PermissionState`), debounced search input, presentational
filter/sort over loaded pages (server-side only when the contract
requires it), `RefreshControl`, `loadMore` footer. Detail/edit: local
form state hydrated once per resource id (`hydratedFor` pattern),
finite inline error, save/back/danger-delete with `Alert` confirm.
Delete button presentation-gated by role; server enforces.

## Forms

Local `useState` per field, pre-submit bound checks, `error` string
state rendered inline, submit button `loading` from mutation, cancel/
back via `canGoBack()` fallback to list route. No form framework.

## i18n / analytics

One `<module>` block in `en.ts` (+ `de.ts`, parity via
`de: typeof en`). Analytics only via the typed catalog, IDs only
(`organization_id`), one event per successful mutation; screen names
from the central ScreenName map.
