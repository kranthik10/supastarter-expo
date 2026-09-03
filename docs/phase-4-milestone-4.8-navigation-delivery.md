# Phase 4 — Milestone 4.8 Navigation Integration Delivery

Baseline: `8f8880c` (4.7 shared states). Scope: consume actual new
screens/routes in navigation, mount organization switching, prove
cache safety on switch, close deep-link gaps. No schema, router,
auth, or provider changes.

## IMPLEMENTED

- Deep-link/nav allowlist (`navigation-policy.ts`): added `/notes`
  and `/notes/new` statics plus a bounded `/notes/:segment` pattern
  (`SAFE_SEGMENT`, no nesting, no query smuggling; `new` resolves to
  the static create route, never a note id). `routeFromDeepLinkParts`
  inherits the range with no policy change — bare `notes`, `notes/new`,
  and `notes/<id>` links now resolve; credential-bearing note links
  still rejected.
- Auth boundary: `/notes*` requires a session by default (absent from
  `PUBLIC_ROUTES`); no change needed.
- Organization switching (`team.tsx`): mounted `switchWorkspace` Card
  listing all user orgs (name + slug) with a `Current` badge on the
  active org. Shown only when `orgs.length > 1`. Tapping another org
  calls `setActiveOrg` then `queryClient.invalidateQueries()`.
- Cache safety: org-scoped queries (`notes.list`, `billing.subscription`,
  `dashboard.overview`) already key by `org.id`, so key rotation alone
  separates caches; the switch handler additionally invalidates
  everything so no stale list/billing/overview data survives the
  switch. User-scoped keys (settings, notifications) are unaffected by
  org identity. `organization_switched` analytics + monitoring group
  context already follow `activeOrgId` in the root layout — no change.
- i18n (`team`, en/de parity type-enforced): `switchWorkspace`,
  `current`.

## VERIFIED

- Extended `navigation-policy.test.ts` (allow + reject note shapes)
  and `linking.test.ts` (bare note list/new/detail routing,
  credential-bearing rejection). RED observed on both (2 failed, 7
  passed) before the policy fix; GREEN after (9 passed).
- Full gates (this head): typecheck / lint / test / build /
  db:generate — see commit trailer.
- `git diff --check` clean; secret scan clean.

## DEFERRED

- Migrating remaining screens to 4.7 shared states (4.7 doc) — unchanged.
- Native universal links: custom-scheme policy only, per prior gates.

## BLOCKED

- None new. Prior gates (reset-email provider, EAS/Maestro) unchanged.
