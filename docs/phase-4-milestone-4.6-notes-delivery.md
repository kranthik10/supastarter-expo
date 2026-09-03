# Phase 4.6 — Reference CRUD Delivery (Notes)

**Historical implementation baseline:** `ed0fda06fcba125f63d00d0a4c54936e4a544cc3`
**Audit:** `docs/phase-4-milestone-4.6-notes-audit.md`
**Milestone:** 4.6 Organization-scoped reference CRUD
**Status:** IMPLEMENTED, awaiting review + commit + CI

## IMPLEMENTED

- Schema (`@repo/database`): `notes` table — cuid text PK,
  `organization_id` NOT NULL FK `cascade`, `user_id` NOT NULL FK
  `cascade`, title, nullable body, timestamptz stamps, org/user
  indexes. Migration `0008_salty_spyke.sql` is purely additive
  (CREATE TABLE + FKs + indexes); `db:generate` reports no drift.
- Permissions: `notes.read/write/delete` in `@repo/types`;
  read+write all roles, delete owner/admin only (mirrors
  `files.write/delete` split).
- Analytics: `note_created/updated/deleted` with `{ organization_id }`
  only — content fields rejected by the sanitizer (tested); `notes`
  added to `ScreenName` + path mapping.
- Router (`@repo/api`): `notes.list` (cursor pagination, `limit+1`
  probe, `note_cursor_invalid`), `get`, `create`, `update`, `delete`.
  Every procedure gates membership (`organization_forbidden`) +
  `assertCan`; cross-org reads resolve `NOT_FOUND`; server captures
  lifecycle events (no title/body, no PII). Review hardening applied:
  update WHERE is org-scoped, empty update body normalizes to null,
  cursor cap 128 aligned with notifications.
- Mobile: `notes` tab (NotebookPen) + `notes/new` + `notes/[id]`
  (46 static routes in export). List consumes the 4.5 contract:
  debounced `matchesSearchQuery` over title+body, newest/oldest
  toggle (`sortByField`), `useInfiniteQuery` + `flattenPages` +
  load-more, `Screen refreshControl`, `['notes','list',orgId]` keys.
  Detail/edit pre-fills once per note, validates title 1..120 / body
  ≤4000 client-side (server re-validates), destructive delete behind
  `Alert` confirm and an owner/admin presentation gate (server
  re-checks `notes.delete`). Mutations invalidate `['notes']`.
- i18n parity: `tabs.notes` + full `notes` section in en + de
  (`typeof en` enforced by typecheck).

## VERIFIED

- New: `notes.test.ts` (7 caller tests: surface, unauthenticated ×5,
  non-member FORBIDDEN with zero writes, validation BAD_REQUEST ×4,
  member-delete FORBIDDEN vs owner success, scoped create, empty-body
  normalization + org-scoped update write), rbac notes tests,
  analytics note-event + no-content tests.
- Full gate: typecheck 28/28, lint 15/15, tests 39 files/225 pass,
  build 15/15 (46 routes), `db:generate` no drift.
- Typed-route note: `.expo/types/router.d.ts` is gitignored and went
  stale; regenerated via a bounded dev-server run (routes verified in
  export output). No source change needed.

## DEFERRED

- Server-side search params, attachments, cross-org sharing,
  soft-delete, realtime updates, FlatList virtualization (bounded
  reference lists; revisit past ~100 rows).
