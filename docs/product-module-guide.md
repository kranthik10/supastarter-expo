# Product Module Guide — add an org-scoped resource

Reference implementation: Notes (search `notes` in the files below).
Contracts: `docs/phase-5-server-module-contract.md`,
`docs/phase-5-mobile-module-contract.md`.

## Steps (replace `note`/`notes` with your domain)

1. **Schema** — add the table + relations to
   `packages/database/src/schema.ts` (cuid PK, `organizationId` FK with
   cascade, indexes on org (+ user)). Keep columns typed; no JSON blobs.
2. **Migration** — run `pnpm db:generate`, read the SQL (additive only:
   no DROP), confirm `db:generate` re-run shows no drift.
3. **Permissions** — add `<module>.<action>` to the `Permission` union
   (`packages/types/src/index.ts`), grant per role in
   `packages/permissions/src/index.ts` (+ ALL list), extend `rbac.test.ts`.
4. **Validation** — strict zod schemas next to the router: bounded
   strings, `idSchema` IDs, `limit` 1–100, opaque ≤128-char cursors,
   `z.enum` filters/sorts only.
5. **Service/router** — add a `router({…})` section in
   `packages/api/src/router.ts`: `protectedProcedure` → `requireXActor`
   (membership → permission) → org-constrained queries → public
   projection. Writes emit catalog events with `{ organization_id }` only.
6. **API registration** — the section key (e.g. `notes`) is the client
   surface (`trpc.notes.list`). No other registration needed.
7. **Query keys/hooks** — `orgModuleKey('<module>', '<variant>', orgId,
   …)` (`apps/mobile/lib/query-keys.ts`); `enabled: !!org`; orgId from
   `useActiveOrg()`, never from params. Invalidate `['<module>']` on
   create/update/delete.
8. **Routes/screens** — `app/(app)/(tabs)/<module>.tsx` (list),
   `app/(app)/<module>/new.tsx`, `app/(app)/<module>/[id].tsx`
   (detail/edit/delete). Consume `resolveQueryState` + shared states,
   `list-policy` helpers, `Alert` confirm for delete.
9. **Navigation** — tab entry in `(app)/(tabs)/_layout.tsx`; statics +
   bounded `:segment` in `navigation-policy.ts` (tests first).
10. **i18n** — one `<module>` block in `en.ts` + `de.ts` (parity typed).
11. **Analytics** — catalog entries in `packages/analytics/src/policy.ts`
    + allowlist test; IDs only, content rejected.
12. **Tests** — extend `notes.test.ts`-style caller tests (see 5.8 matrix),
    `rbac.test.ts`, policy tests; run full gates.
13. **Isolation/security** — verify: unauthenticated denied, non-member
    denied, cross-org CRUD denied, create stamps caller's org, no bundle
    secrets (`grep` dist), no PII in events.

## Copyable checklist

```text
[ ] Database table + relations + indexes
[ ] Additive migration reviewed, no drift
[ ] Validation: bounds, ids, pagination, cursor, allowlisted enums
[ ] Permissions: union + role maps + ALL + rbac tests
[ ] Procedures: membership → permission → org-scoped query → projection
[ ] Pagination: limit-plus-one, stable order, opaque cursor
[ ] Errors: tRPC codes, scoped NOT_FOUND, finite messages
[ ] Analytics: catalog + allowlist, IDs only
[ ] Routes: tab + new + [id]; nav allowlist + tests
[ ] Keys: orgModuleKey, enabled gating, invalidation rules
[ ] Screens: shared states, refresh, confirm delete, role gates UX-only
[ ] i18n en+de block
[ ] Maestro flow on verified labels
[ ] Isolation matrix green; full suite green; bundle scan clean
[ ] Audit + delivery docs
```

## What NOT to do

New package per module · generic/EAV tables · client-side authority ·
unbounded filters/sorts · mega CRUD component · registry with authority ·
codegen CLI · duplicating auth/org/billing logic.
