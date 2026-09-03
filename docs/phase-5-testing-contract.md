# Phase 5.8 — Testing + Isolation Contract

Baseline: `7d6ef1c`. Status: contract (no new framework; direct
tests stay the pattern). Test command: `pnpm test`
(40 files / 233 passing at Phase 4 close; must grow, never shrink).

## Mandatory server matrix (every org-scoped module)

```text
[ ] unauthenticated denied (all procedures)
[ ] non-member denied, zero writes performed
[ ] member read behavior (scoped list/get)
[ ] permission-denied behavior (role without action → FORBIDDEN)
[ ] Org A cannot read Org B resource
[ ] Org A cannot update Org B resource
[ ] Org A cannot delete Org B resource
[ ] create stamps the caller's organizationId (never client-chosen authority)
[ ] bounded pagination (limit 1–100, limit-plus-one, invalid cursor → BAD_REQUEST)
[ ] invalid sort rejected (z.enum) — or documented N/A when server has no sort
[ ] invalid filter rejected (z.enum) — or documented N/A when server has no filter
[ ] search bounded/safe (length caps, no operator injection)
[ ] validation bounds (title/body limits, strict schemas, empty-patch safe)
[ ] analytics carry IDs only (policy rejection test for content/PII keys)
```

Notes evidence: `packages/api/src/notes.test.ts` (caller tests),
`packages/permissions/src/rbac.test.ts` (25), analytics
`policy.test.ts`. Notes N/A with rationale: server has no sort/filter
params (client-side presentational search/sort over loaded pages),
so sort/filter-rejection rows are satisfied by absence + the
contract rule below.

Rule for new modules: adding a server sort/filter dimension requires
the allowlist AND its rejection tests in the same commit — no
unbounded `orderBy` input, ever. Real PostgreSQL semantics for
isolation (compound `(id, organizationId)` scoping) are asserted
through caller tests; DB-level lock/unique probes only where the
module introduces race-prone invariants.

## Mobile matrix (unit-level, no RN harness)

No snapshot-only suites; no React Native rendering harness (pure
policy tests + authored flows instead):

```text
[ ] resolveQueryState: loading > permission > error > empty > content
[ ] list helpers: search normalize/match, stable nullish-last sort, flatten, limits
[ ] query keys: org-disjoint key spaces (query-keys.test.ts)
[ ] nav policy: statics + bounded :segment, reject nesting/query/credentials/dots
[ ] deep links: route mapping + credential confinement
[ ] permission mapping: FORBIDDEN → PermissionState (no retry, no session end)
[ ] authored Maestro flow on verified labels (execution deferred to device phase)
```

## Conformance

No abstract conformance framework: the reference module's direct
suites ARE the conformance proof. A new module copies the matrix rows
into its own caller/policy tests. Reviewers check the matrix, not a
base class.
