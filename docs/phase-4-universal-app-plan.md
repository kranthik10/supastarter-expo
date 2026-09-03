# Phase 4 — Universal App Implementation Plan

**Project:** `supastarter-expo`
**Repository:** `kranthik10/supastarter-expo`
**Planning baseline:** `9ddaf277af5754abf4d8d32a71c79f393d89f3e8`
**Source audit:** `docs/phase-4-core-screen-flow-audit.md`
**Plan status:** Proposed after Phase 4.1 audit
**Code changes in this milestone:** None

## Planning principles

1. Preserve the existing Phase 0/3 architecture, package dependency direction, Better Auth authority, server-side RBAC, tRPC API, React Query, Zustand compatibility caches, and Expo Router structure.
2. Do not redesign working Home, Team, Notifications, Settings, or authentication behavior unnecessarily. Extend their proven patterns and correct only audited gaps.
3. Do not add generic product CRUD or new product domains until the universal screen/state foundations are complete.
4. Keep provider-backed behavior truthful. Local billing plan selection, mock AI, fake/no-op providers, and deferred EAS/native flows must remain explicitly labeled as preview/deferred.
5. For every implementation slice, add a focused test first, observe the expected failure, implement the smallest change, then run the full validation gate.
6. Keep mobile free of server secrets, private provider SDKs, database access, and server-only packages.
7. Treat UI state as presentation/cache state. Better Auth, API authorization, organization membership, and canonical billing/provider state remain server-authoritative.

## Evidence-driven priorities

### P0 — Correctness and trust boundaries

- Complete password recovery and reset-token UX without exposing reset tokens.
- Fix auth affordance/content drift: OAuth control, missing translation key, false demo hint, and error-code mapping.
- Make invalid-session handling fail closed at the mobile API/tRPC boundary.
- Add a real organization switcher and replace/clear organization cache on auth changes.
- Preserve invitation deep links across sign-in and validate the authenticated email/organization on the server as already required.

### P1 — Universal UX foundations

- Normalize loading, empty, error/retry, permission-denied, offline/network, and destructive-action behavior.
- Extract reusable list, pagination, search, filter, and sort controls without introducing a new state architecture.
- Establish a list → detail → edit route convention.
- Improve shared accessibility metadata and English/German coverage.

### P2 — Provider-backed and validation surfaces

- Build truthful subscription/upgrade entry only when provider checkout/portal/webhooks are configured and verified.
- Rewrite authored Maestro flows against the actual routes and labels; execute only when the user explicitly permits and a supported native target exists.
- Add component/UI and end-to-end coverage for universal flows.

## Proposed milestone sequence

### 4.1 — Universal Screen + Flow Audit — COMPLETE

**Evidence:** `docs/phase-4-core-screen-flow-audit.md`

- Inventory all 22 mobile route files and 16 canonical screen routes.
- Reconcile screen behavior to Better Auth, tRPC, stores, and shared UI.
- Audit authentication, account, organization, notifications, billing, accessibility, i18n, generic UX patterns, tests, and Maestro files.
- Run typecheck, lint, test, and build.
- Do not implement missing screens in this milestone.

**Exit status:** PASS WITH WARNINGS. No source changes.

### 4.2 — Auth UX Completion — REQUIRED

**Scope:** complete the user-facing authentication lifecycle without changing identity architecture.

- Add reset-password route with safe token parsing, password validation, success, invalid/expired-token, and retry states.
- Wire forgot-password to Better Auth's reset operation. Keep the public result enumeration-safe and delivery-neutral; record an unconfigured server email provider as an explicit release gate rather than claiming “sent.”
- Add real email verification/resend behavior only through configured Better Auth semantics; otherwise remove misleading resend success.
- Correct sign-in error mapping for invalid credentials, duplicate account, validation, not-configured, and network failures.
- Remove, disable, or implement the GitHub/OAuth control; never route it through password submit and never display a missing translation key.
- Replace the false demo hint with environment-accurate copy or a clearly isolated development-only fixture path.
- Preserve pending invite/notification links through auth and restore them only after auth and organization state are hydrated.
- Add focused auth flow tests and route-level UI tests; do not claim native/provider delivery until verified.

**Exit criteria:** login, signup, logout, restoration, invalid session, forgot password, reset password, and verification states are truthful and testable.

### 4.3 — Account + Profile UX Completion — REQUIRED

**Scope:** strengthen the existing Settings surface rather than creating a parallel account system.

- Keep profile, avatar, locale, theme, password, sessions, deletion, push, and logout in the existing Settings organization unless evidence supports a split.
- Add consistent initial loading, empty sessions, retry, server-error, save-success, and cancel/dirty form behavior.
- Keep email display-only until Better Auth email-change verification is implemented.
- Add explicit accessibility labels/roles for Inputs, Switches, SegmentedControl, ListRow, Cards, and icon-only actions.
- Use shared `Screen` safe-area/keyboard behavior for onboarding/standalone account routes.
- Localize current hard-coded universal strings and map server error codes to English/German messages.
- Preserve the server-side sole-owner deletion guard and immediate-deletion semantics.

**Exit criteria:** profile edit, avatar upload, password change, sessions, account deletion, logout, and preferences provide consistent server-backed UX with no false success states.

### 4.4 — Subscription + Upgrade UX — REQUIRED, PROVIDER-GATED

**Scope:** make billing truthful and complete without letting clients forge entitlements.

- Keep `dashboard.overview` as the canonical read for plan, entitlement, and subscription status.
- Rename/label local plan selection as preview until a provider is configured, or remove the success alert that implies a real plan change.
- Add server-created checkout/portal/cancel entry points only after Stripe/RevenueCat provider setup and signed webhook/reconciliation work are independently verified.
- Expose trial, active, past-due/grace, canceled, incomplete, and not-configured states from canonical server data.
- Add owner/admin/member visibility according to existing `billing.read`/`billing.manage` rules; UI gates are not authorization.
- Add negative tests proving client plan mutations cannot grant paid access.

**Exit criteria:** either the screen is explicitly preview-only with no false success, or a real provider flow is verified end-to-end. Do not claim provider completion from local state.

### 4.5 — Universal List, Search, Filter, Sort — REQUIRED

**Scope:** establish the smallest reusable collection UX before generic product domains.

- Add `SearchField`, filter chip/sheet, and sort-menu primitives to `@repo/ui` with accessibility metadata and English/German labels.
- Add a typed route-level collection state helper for query text, filters, sort, cursor, refresh, loading, empty, and error state.
- Keep small already-loaded lists client-filtered; use server-side validated query inputs for paginated/large lists.
- Standardize cursor pagination and pull-to-refresh around the existing Notifications pattern.
- Apply the pattern first to Notifications and Team only if useful; do not invent a domain to demonstrate it.
- Distinguish user-facing sorting/filtering from database `ORDER BY`.

**Exit criteria:** a future product list can adopt the pattern without copying one-off state logic; no global search index or new backend domain is required.

### 4.6 — Universal Create, Edit, Detail, Delete — REQUIRED

**Scope:** create a reusable route/form/action convention using existing onboarding, Settings, Team, and Notifications evidence.

- Define a shared form state contract: initial loading, dirty state, validation, pending, server error, success feedback, cancel/back, and post-success navigation.
- Define a detail route convention for `list → detail → edit`; replace placeholder organization detail only when a real existing resource is selected, not by inventing generic product data.
- Define a reusable destructive-action confirmation/action component with danger styling, pending, error, cancellation, and post-delete behavior.
- Preserve server authorization and ownership checks for every mutation.
- Include confirmation requirements by risk: account/member deletion versus session/invitation revoke.

**Exit criteria:** future product resources have a clear convention, but no generic tables/API domains are added in this milestone.

### 4.7 — Shared Loading, Empty, Error, Permission, Offline UX — REQUIRED

**Scope:** unify states across existing screens.

- Add shared loading/skeleton or state-card primitives where appropriate.
- Add shared empty-state component with optional action.
- Add shared error/retry component that maps safe error codes and avoids raw server messages.
- Add explicit permission-denied state for authenticated but unauthorized screens.
- Add network/offline detection and read-only/offline copy; do not introduce a mutation queue unless separately approved.
- Add pull-to-refresh where list data supports it.
- Keep provider-not-configured distinct from network failure and authorization failure.

**Exit criteria:** Home, Team, Notifications, Settings, Invite, and future list/form/detail screens use consistent state semantics.

### 4.8 — Navigation, Organization Switch, and Deep-Link Validation — REQUIRED

**Scope:** make route access and organization context deterministic.

- Add a visible organization switcher using the existing `refreshOrganizations` and `setActiveOrg` seams.
- Refresh the server organization list on authenticated-user transitions and replace the cached collection atomically.
- Clear organization/pending-invitation state on logout or user identity change.
- Invalidate dashboard/team/notification queries after switching organizations and ensure Org A data is not shown under Org B.
- Repair deep-link pending storage so invite/notification links survive hydration and sign-in exactly once.
- Add route guards for authenticated intent screens and a safe unknown/invalid deep-link state.
- Verify all Home quick actions, tab routes, invite links, organization links, sign-out, and post-delete navigation.

**Exit criteria:** an explicit Org A → Org B test demonstrates no stale dashboard/team data and invite links resume safely after sign-in.

### 4.9 — Universal E2E Flow Coverage — REQUIRED

**Scope:** make authored flows reflect actual UX; execution remains environment-gated.

- Rewrite Maestro flows for login, signup/onboarding, logout, protected redirect, profile edit, organization switch, invitation acceptance, notifications, and billing entry.
- Use real fixture setup and required password fields; do not rely on old demo-mode assumptions.
- Add component/UI tests for auth, Settings forms, organization switcher, state components, and billing preview/provider-gated states.
- Keep API and PostgreSQL isolation tests separate from UI/E2E claims.
- Do not run Maestro or install tooling in an audit-only milestone. Run only in a later explicitly authorized validation milestone with a supported native target.

**Exit criteria:** authored flows match source labels/routes and each claimed execution has actual device/simulator evidence.

### 4.10 — Final Universal UX Audit — REQUIRED

- Re-run the complete screen/flow inventory.
- Verify all high-priority findings from 4.2–4.9 are closed or explicitly deferred.
- Run typecheck, lint, test, build, database drift checks, bundle security scan, and approved UI/E2E checks.
- Reconcile docs with source and provider status.
- Verify exact GitHub CI for the final commit.
- Produce a Phase 4 closure document.

## Smallest architecture recommendation

No backend architecture redesign is justified by the 4.1 audit.

Preserve:

```text
apps/mobile
  → @repo/ui
  → @repo/api
  → @repo/auth
  → @repo/config
  → @repo/types

@repo/api
  → database / auth / organizations / permissions
  → billing / storage / notifications
```

Recommended additions should be narrow:

- shared state/control primitives in `@repo/ui`;
- route-level typed hooks for collection/form state;
- existing tRPC procedures extended only with validated query inputs where a real list needs server-side search/filter/sort;
- existing organization store corrected to replace server state on identity/switch transitions;
- existing auth/deep-link seams corrected rather than a second navigation/auth system;
- component/UI tests under the mobile test configuration;
- no new product database domain until generic UX conventions are approved.

## Explicit non-goals

- No generic Tasks/CRM/Projects/Chat/Reports/Invoices/Support domain.
- No new billing provider integration in an audit-only change.
- No client-side entitlement authority.
- No duplicate identity/session/password schema.
- No RLS redesign.
- No EAS/signing or native credential work in these UX milestones unless explicitly authorized.
- No Maestro execution in this audit.
- No broad offline mutation queue before its architecture is separately approved.

## Plan conclusion

Phase 4.1 is complete as an audit milestone. The repository is **READY FOR UNIVERSAL UI IMPLEMENTATION**, with the P0/P1 warnings in the audit addressed in order. Phase 4.2 should begin with Auth UX Completion; generic product CRUD should wait until the universal list/form/detail/state conventions are implemented and validated.
