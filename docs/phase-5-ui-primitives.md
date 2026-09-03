# Phase 5.4 — Reusable Product UI Primitives

Baseline: `7d6ef1c`. Status: audit (no new code — everything below
already exists and is tested/consumed).

## Adopted as-is (composable, not configured)

```text
@repo/ui: Screen (+refreshControl) · Card · Button (loading/disabled) ·
  Input (label/error) · ListRow · Badge · Avatar · SegmentedControl ·
  LoadingState · EmptyState · ErrorState (retry, retryable only) ·
  PermissionState (guidance, no retry)
mobile lib: normalizeSearchQuery · matchesSearchQuery · sortByField
  (nullish-last, stable, non-mutating) · flattenPages · resolvePageLimit ·
  resolveQueryState · orgModuleKey
```

## Deliberately NOT built

- `ResourceListScreen` / `ResourceDetailScreen` mega-components: Notes
  list (search + sort toggle + pagination) vs notifications (read
  states, mark-all-read) prove one config object would leak; the
  shared-states + list-policy composition covers the pattern.
- Form framework: two-field Notes forms and profile forms share only
  the error-string + loading-button convention — a framework would be
  larger than the duplication.
- `ConfirmAction` wrapper: `Alert.alert(title, message, [cancel,
  destructive])` is three lines at each of three call sites; an
  RN-Alert wrapper is untestable in node and buys nothing.
- `SearchBar`/`FilterControls`/`SortControls` components: `Input` +
  `Button` rows already standardize this (team screen reference).

## Rule

Extract a primitive only on the third demonstrated use with real
divergence pressure. Until then: compose, don't configure.
