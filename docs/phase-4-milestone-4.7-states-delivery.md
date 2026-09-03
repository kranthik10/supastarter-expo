# Phase 4 — Milestone 4.7 Shared States Delivery

Baseline: `07e9fe4` (4.6 notes CRUD). Scope: standardize
loading/empty/retryable-error/permission-denied UX; document
offline/network and destructive-action conventions. No schema,
router, or auth changes.

## IMPLEMENTED

- Pure resolver (`apps/mobile/lib/query-state.ts`): `resolveQueryState`
  maps `{isPending, isError, error, isEmpty}` to one finite state:
  `loading | permission | error | empty | content`. FORBIDDEN never
  maps to retryable error — retrying with the same credentials cannot
  succeed, so callers render `PermissionState` (no retry button).
  Depth-bounded code scan mirrors `transport-policy.ts` semantics.
- Transport (`@repo/api`): `isForbiddenError` exported from
  `transport-policy.ts`; UNAUTHORIZED still the only session-ending
  signal, FORBIDDEN never triggers `onUnauthorized`.
- Shared states (`@repo/ui`): `LoadingState` (spinner + message),
  `EmptyState` (optional icon + message), `ErrorState` (danger message
  + caller-supplied retry button), `PermissionState` (guidance, no
  retry). All built on `Card`/`Text`/`Button` with a shared
  `stateCard` style.
- i18n (`common`, en/de parity type-enforced): added `retry` and
  `permissionDenied`. Side-effect fix: `billing.tsx` already referenced
  `t('common.retry')`, which did not exist until this milestone — now
  resolves in both locales.
- Consumer (`notes.tsx`): list states replaced ad hoc
  `isLoading`/danger-Card/`home.refresh` blocks with
  `resolveQueryState` + shared states; `home.refresh` misuse replaced
  with `common.retry`. Search-no-match stays a content-substate
  (`content` + zero visible items → `EmptyState noMatchingNotes`).
- Conventions documented (no code change, verified present):
  offline/network → `ErrorState` with retry (network failures are
  retryable; `auth.networkError` copy unchanged); destructive actions
  → `Alert` confirm dialog (`notes/[id].tsx confirmDelete`) with
  server-side permission enforcement; action/mutation failures →
  `Alert` (`showError`), query failures → inline `ErrorState`.

## VERIFIED

- New: `query-state.test.ts` (5 tests: loading precedence, forbidden
  → permission, non-forbidden/Error → error, empty, content).
- Extended: `transport-policy.test.ts` (forbidden detection, 6 tests
  total with existing unauthorized suite).
- Full gates (this head): typecheck / lint / test / build /
  db:generate — see commit trailer.
- `git diff --check` clean; secret scan clean (no credentials,
  tokens, or private URLs in added lines).

## DEFERRED

- Migrating home/billing/team/notifications screens to shared states:
  mechanical follow-up; convention + reference consumer established
  here. Owners should adopt `resolveQueryState` when next touching
  those screens.
- Native offline banner (NetInfo): no new dependency in this slice;
  pull-to-refresh + retry covers the web-export verification boundary.

## BLOCKED

- None new. Prior gates (reset-email provider, EAS/Maestro) unchanged.
