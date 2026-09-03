# Phase 5.2 — Server Module Contract

Baseline: `7d6ef1c`. Status: contract definition (no code).
Reference: `packages/api/src/router.ts` `notes` section (lines ~1015–1110).

## Mandatory procedure shape (IDOR-proof by construction)

```text
protectedProcedure
  → .input(strict zod schema, organizationId: idSchema first)
  → await requireNoteActor(db, input.organizationId, ctx.user.id, '<module>.<action>')
  → every query/update/delete constrained by eq(table.organizationId, input.organizationId)
  → public projection (publicNote-style: no internal columns)
```

`requireNoteActor` resolves organization → verifies membership →
asserts permission, and throws `FORBIDDEN organization_forbidden`
before any resource read. Never fetch-by-id first and hope a later
check catches it: `get`/`update`/`delete` all carry the
`(id, organizationId)` compound in the WHERE clause, and empty
results map to `NOT_FOUND` (never leak cross-org existence).

## Permission pattern

1. Add `<module>.<action>` members to the `Permission` union
   (`packages/types/src/index.ts`).
2. Grant them per role in `packages/permissions/src/index.ts` maps +
   ALL list; extend `rbac.test.ts`.
3. Gate each procedure with the least-privilege action
   (`notes.read` for list/get, `notes.write` for create/update,
   `notes.delete` for delete). Non-CRUD semantics use verbs that
   match the domain (e.g. `transfer`, `publish`) — do not force CRUD.
4. Client role checks are presentation gates only.

## Validation envelope

- `.strict()` schemas; bounded strings (e.g. title 1–120, body ≤4000);
  `idSchema` (cuid) for all IDs; pagination `limit` 1–100 (default 20);
  opaque cursors ≤128 chars (`encodeURIComponent(ISO-timestamp|id)`),
  strict-decode with round-trip ISO validation, or
  `BAD_REQUEST <module>_cursor_invalid`.
- Filters/sorts: allowlisted literals only (z.enum). No arbitrary
  field names, no SQL-like operators. A module with no server-side
  filter/sort states that explicitly (client-side only, like Notes
  search) — absence must be a decision, not an omission.
- Empty-patch updates must be safe (trim; empty string → null where
  the column is nullable).

## Pagination

Limit-plus-one probe, stable `(createdAt, id)` ordering, opaque
`nextCursor` or null. Page size bounded by the same 1–100 rule.

## Errors (use tRPC codes, no parallel system)

`UNAUTHORIZED` (session) · `FORBIDDEN` (membership/permission, never
ends session) · `NOT_FOUND` (scoped miss, incl. cross-org) ·
`BAD_REQUEST` (validation/cursor) · `CONFLICT` · `PRECONDITION_FAILED` ·
`NOT_CONFIGURED` (unconfigured provider seams) · `INTERNAL` (generic,
no diagnostics). Machine-readable `snake_case` messages.

## Analytics / monitoring / audit

- Server events only after successful writes, via the typed catalog
  (`packages/analytics/src/policy.ts`): `{ organization_id }` only.
  Content, emails, tokens, URLs rejected by policy test.
- Provider failures swallowed — never roll back the mutation.
- Expected domain errors (`FORBIDDEN`, `NOT_FOUND`, validation,
  `NOT_CONFIGURED`) are filtered from crash reporting.

## Transactions

Multi-write operations (accept, transfer, webhook upsert) run in one
transaction with idempotency keys + audit rows per ADR-016. Single-row
module CRUD needs no explicit transaction beyond the statement.
