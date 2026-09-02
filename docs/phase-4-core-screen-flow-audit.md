# Phase 4 — Core Screen + Flow Audit

**Project:** `supastarter-expo`
**Repository:** `kranthik10/supastarter-expo`
**Audit baseline:** `9ddaf277af5754abf4d8d32a71c79f393d89f3e8`
**Milestone:** Phase 4.1 — Universal App Screen + Flow Audit
**Disposition:** **PASS WITH WARNINGS**
**Code changes:** **NONE**

## Scope and audit rules

This milestone audits the shipped Expo Router mobile surface before any universal UI implementation. The audit does not add product features, redesign working screens, modify backend architecture, add dependencies, run EAS, run Maestro, or begin generic product CRUD.

Evidence was taken from the actual route components, mounted stores/helpers, shared UI primitives, Better Auth configuration, tRPC calls, test inventory, authored Maestro files, the generated web export, and the required local validation commands. Documentation and filenames were not treated as implementation evidence by themselves.

## Baseline verification

| Check | Result |
|---|---|
| `HEAD` | `9ddaf277af5754abf4d8d32a71c79f393d89f3e8` |
| Branch | `main` |
| `origin/main` | Aligned with `HEAD` |
| Working tree | No tracked/uncommitted changes; intentional untracked `.env.development` only |
| Previous Phase 3 status | Closed with release warnings |
| EAS | Not run |
| Maestro | Not run; execution remains deferred |
| Native/simulator validation | Not claimed |

## Executive result

The starter contains a credible universal foundation, but it is not yet a production-quality universal app flow set.

### Strongest implemented surfaces

- Better Auth-backed sign-in and sign-up with persisted session restoration.
- Protected app redirect for routes under `(app)`.
- Multi-step account/profile/organization onboarding at `/onboarding`.
- Server-backed dashboard overview with active organization, role, plan, subscription status, usage, team, storage, and notifications summaries.
- Server-backed Settings surface containing profile, avatar, preferences, password change, sessions, account deletion, push registration, and logout.
- Server-backed team/member/invitation mutations with role-aware controls and destructive confirmation for member removal.
- Cursor-paginated notifications with unread count, mark-read, mark-all-read, empty state, and safe route parsing.
- Consistent shared `Screen`, `Button`, `Card`, `Input`, `Badge`, `Avatar`, `ListRow`, and `SegmentedControl` primitives.

### Highest-priority warnings

1. **Organization switching is not user-facing.** `setActiveOrg` exists in `@repo/organizations`, but no mounted screen calls it. The root only hydrates the persisted organization cache; it does not refresh the server organization list when a user signs in. The cache is also not cleared when a different user signs in. A user switch can therefore leave stale organization names/member data visible until scoped requests fail or refresh. Server authorization remains authoritative, but the client UX/data presentation is not safe enough for a universal production flow.
2. **Invite links do not reliably survive the sign-in boundary.** The direct `/invite/[token]` route sends a logged-out user to `/sign-in` without storing the token. The separate deep-link helper has a pending-link mechanism, but it imports the legacy `apps/mobile/lib/org-store` hydration state, while the app mounts `@repo/organizations`; its pending-link consumption can also discard a pending link when auth is not ready. The authored deep-link Maestro flow is therefore not evidence of a working end-to-end invite flow.
3. **The auth UI contains misleading/broken affordances.** The sign-in screen calls `t('auth.continueWithGithub')`, but the locale resources define `continueWithGoogle`, not `continueWithGithub`. The control also invokes the password `submit()` handler rather than an OAuth operation. The “Demo mode…any email and password works locally” hint is inconsistent with the mounted real Better Auth implementation.
4. **Password recovery is incomplete.** Forgot-password only validates an email locally and switches to a local “reset sent” state. There is no reset-password route, token handling, success route, invalid/expired-token state, or configured Better Auth reset-email callback.
5. **Invalid-session handling is only partial.** `hydrate` and `refreshSession` can clear local state when explicitly called, and protected routes redirect when `useAuth().user` is null. The tRPC/API clients have no global 401/session-expiry handler, so a revoked session can remain mounted while scoped queries fail.
6. **Billing is preview-only.** The billing screen changes a local Zustand plan and displays a success alert. It does not purchase, cancel, downgrade, open a portal, or reflect canonical server/provider subscription state. Real provider checkout/webhooks remain deferred by Phase 3.

## Canonical route inventory

There are 22 `.tsx` files under `apps/mobile/app`: 16 screen route files and 6 layout files. Expo static export produces 41 paths because route groups and layout aliases are emitted as separate static paths. The table below collapses group aliases to the canonical user-facing paths.

| Route | Screen name | Visibility | Purpose | Status | Backend connected? | Loading | Empty | Error | Accessible navigation path |
|---|---|---|---|---|---|---|---|---|---|
| `/` | Marketing landing | Public | Product overview, pricing preview, sign-in/sign-up entry | Implemented | No | No | No | No | Root entry; links to sign-in/sign-up |
| `/sign-in` | Login | Public | Better Auth email/password sign-in | Implemented + needs UX work | Yes — `useAuth().signIn` → Better Auth | Button loading | N/A | Field error only; errors are over-mapped | Landing, sign-up, forgot-password |
| `/sign-up` | Signup | Public | Better Auth account creation | Implemented + needs UX work | Yes — `useAuth().signUp` → Better Auth | Button loading | N/A | Field error only; duplicate/network errors become generic invalid-email text | Landing, sign-in |
| `/forgot-password` | Forgot password | Public | Email entry for password recovery | Partial / UI-only | No reset request is made | No | N/A | Local email validation | Sign-in → forgot-password; back returns to sign-in |
| `/verify-email` | Verify email | Public | Informational email-verification screen | Partial / UI-only | No verification/resend operation | No | N/A | No invalid/expired-token state | Direct route only; buttons return to sign-in |
| `/reset-password` | Reset password | Public | Password reset with token | Missing | No route or configured reset callback | N/A | N/A | N/A | No route |
| `/welcome` | Legacy onboarding welcome | Authenticated intent, not guarded in component | Welcome card before organization creation | Implemented but duplicate/secondary | No | No | N/A | No | Direct route; main signup flow uses `/onboarding` instead |
| `/create-organization` | Create organization | Authenticated intent, not guarded in component | Create first organization | Implemented + needs UX work | Yes — `organizations.create` | No create loading | N/A | Inline server error | Home no-org state and legacy welcome route |
| `/onboarding` | Combined onboarding | Authenticated intent | Welcome → profile → organization → completion | Implemented + needs UX work | Yes — profile update and organization create | No step mutation loading | N/A | Organization errors handled; profile update errors are not caught | Signup → onboarding → home |
| `/home` | Home / dashboard | Authenticated via `(app)` | Organization dashboard overview | Implemented + needs UX work | Yes — `dashboard.overview` | Inline loading card | No-organization state | Retry button for overview error | First authenticated tab; quick actions to team/billing/notifications/settings |
| `/team` | Team | Authenticated via `(app)` | Members, invitations, roles, removal, ownership transfer | Implemented + needs UX work | Yes — members/invitations/organization mutations | Button/refresh busy states | Pending-invitations empty text; no explicit empty-members state | Alerts; failed refresh retains cached members | Home quick actions and Team tab |
| `/notifications` | Notifications | Authenticated via `(app)` | User-scoped notification list and lifecycle | Implemented + needs UX work | Yes — list, unread count, mark read, mark all read | Inline loading and mutation loading | Explicit empty card | Error text without retry | Notifications tab, Home summary |
| `/billing` | Billing / subscription preview | Authenticated via `(app)` | Plan comparison and local plan selection | Local preview only | No canonical billing mutation | No | N/A | No query/provider error state | Billing tab, Home manage-billing action |
| `/settings` | My Account / Settings | Authenticated via `(app)` | Profile, appearance, language, notifications, security, sessions, delete, logout | Implemented + needs UX work | Yes — settings APIs, Better Auth update/change password, storage avatar, push registration | Mutation loading; query failures alert | Sessions have no explicit empty state | Alerts; raw server messages may surface | Settings tab, Home quick action |
| `/assistant` | Assistant | Authenticated via `(app)` intent | Offline mock assistant conversation | Implemented local mock; not universal navigation | No — `@repo/ai` is explicitly a mock stream | Streaming state | N/A | No user-facing stream error state | Direct route only; no mounted link |
| `/invite/:token` | Invitation acceptance | Public route with authenticated action | Accept/decline server invitation | Partial | Yes — `invitations.accept/decline` | Accept/decline busy states | N/A | Inline raw/local messages | Deep link/direct route; sign-in handoff is incomplete |
| `/organization/:slug` | Organization detail | Public | Displays the supplied slug only | Placeholder | No | No | N/A | No | Deep-link/direct route only; no list/detail data |
| `+not-found` | Generated not-found | Public | Expo Router generated fallback | Generated only | No | No | N/A | Generic generated behavior | Unknown URL |

Layouts (`_layout.tsx` files) are routing infrastructure rather than standalone screens. The root layout hydrates auth/settings/org/billing stores, mounts QueryClient, monitoring, analytics, notifications, and deep-link listeners. The `(app)` layout redirects when the auth user is absent. The tab layout exposes Home, Team, Billing, Notifications, and Settings.

## Authentication audit

| Capability | Classification | Evidence and gaps |
|---|---|---|
| Login | **IMPLEMENTED + NEEDS UX WORK** | `useAuth().signIn` calls Better Auth `signIn.email`; success persists the session and replaces with `/home`. Button loading and email validation exist. Error mapping reduces most Better Auth errors to `invalidEmail`; OAuth control is broken/mislabelled. |
| Signup | **IMPLEMENTED + NEEDS UX WORK** | `useAuth().signUp` calls Better Auth `signUp.email` with `autoCreateSession: true`, persists the session, and routes to `/onboarding`. Duplicate-account and server errors are not differentiated. |
| Forgot password | **PARTIAL** | Local validation and local success state only; no network operation, loading state, provider email, or reset token. |
| Reset password | **MISSING** | No `/reset-password` route. Current Better Auth config enables email/password but does not configure a reset-email callback or mobile reset operation. |
| Logout | **IMPLEMENTED + WORKING** | Better Auth sign-out is attempted, local auth/session storage is cleared in `finally`, and Settings routes to `/`. |
| Session restoration | **IMPLEMENTED + WORKING logically** | Root waits for auth hydration. `useAuth().hydrate` reads persisted session/token and verifies `authClient.getSession`; invalid/no remote session clears local state. Native/device persistence is not claimed as manually tested. |
| Protected-route redirect | **IMPLEMENTED** | `(app)/_layout.tsx` returns `<Redirect href="/sign-in" />` when hydrated without a user. |
| Invalid-session handling | **PARTIAL** | Explicit hydration/refresh can clear state, but API/tRPC clients do not globally react to HTTP 401 or session expiry. |
| Email verification | **PARTIAL / UI-ONLY** | A verification-information route exists, but sign-up does not route there, resend is a sign-in redirect, and no verification callback is configured. |

### Logical login flow

The source-level path is:

```text
logged out → /sign-in → Better Auth email/password → persisted session → /home
app reload → root hydrate → Better Auth getSession → authenticated route
Settings sign-out → Better Auth signOut + local clear → /
protected `(app)` route without user → /sign-in
```

This is logically implemented. It was not claimed as a native-device or live-provider test. A browser walkthrough was attempted against the local web export but was blocked by Chrome’s remote-debugging permission prompt; no valid credential or successful login was fabricated.

### Account creation flow

The source-level path is:

```text
/sign-up → Better Auth signUp.email(autoCreateSession) → /onboarding
→ profile update → organization create → /home
```

Validation exists for required name/email/password through the auth layer and route error mapping. Loading exists on signup but not on the onboarding mutations. Profile-update exceptions in the combined onboarding route are not caught into the visible error state. Duplicate-account behavior is not differentiated in the UI.

## Password recovery

| State | Result |
|---|---|
| Forgot-password screen | Exists, but local-only |
| Request reset email | Missing from mobile flow |
| Reset-password screen | Missing |
| Success state after real reset | Missing |
| Expired/invalid token state | Missing |
| Better Auth reset-email provider | Not configured |
| Classification | **UI MISSING / BACKEND DELIVERY NOT CONFIGURED** |

## Home / dashboard audit

The Home route uses the authenticated active organization and the server-backed `dashboard.overview` query. When data exists it displays:

- organization name and current role;
- canonical server plan and subscription tone/status;
- cancel-at-period-end messaging;
- team member count, limit, and pending invitation count;
- confirmed storage usage, limit, and pending bytes;
- unread notification count;
- role-derived quick actions.

Loading, no-organization, error, and retry states are present. Home action targets resolve to existing routes: Team, Billing, Notifications, Settings, and Create Organization. The Billing target is a real route but only a local preview, so “manage billing” is not a complete billing flow. There is no active organization switcher in the Home header or any other mounted screen.

## My Account / Settings audit

My Account is one coherent `/settings` screen with sections rather than multiple routes:

- **Profile:** server-loaded name/email, server-backed name update, private-avatar upload/confirmation/download URL path. Email is display-only; email changes are not offered.
- **Appearance:** system/light/dark persisted locally and synchronized to server preferences.
- **Locale:** English/German architecture exists and preferences are server-backed.
- **Notification preferences:** invite email, billing alerts, marketing opt-in, analytics consent, quiet-hours note, and push registration.
- **Security/password:** Better Auth change-password wrapper with current/new password fields.
- **Sessions:** server list, current-session marker, revoke-other-sessions, revoke individual non-current sessions.
- **Account deletion:** confirmation dialog, danger button, server deletion mutation, local clear, and root navigation. Sole-owner protection is server-enforced. The UI describes local-data removal even though the operation is an account deletion flow; delayed hard-delete lifecycle remains deferred.
- **Logout:** server sign-out attempt, push unregister attempt, local clear, and root navigation.

The screen has useful loading flags and query-error alerts, but sessions have no explicit empty state, there is no dirty/cancel form convention, and raw server errors can surface without user-friendly translation.

## Notifications audit

Notifications are the most complete list example:

- user-scoped server list via `useInfiniteQuery`;
- cursor pagination with Load More;
- unread count query and badge text;
- mark one read on open and mark all read;
- explicit loading, empty, and error text;
- safe route parsing before navigation;
- no raw bearer token or notification credential in route data.

Missing or inconsistent pieces:

- no pull-to-refresh;
- error state has no retry button;
- no dedicated Notification Detail route; notification data may route to an existing safe destination;
- pressable notification cards do not declare an accessibility role/label through the shared `Card` primitive;
- no offline/network state.

## Organization, team, and invitation UX

### Organization onboarding

Organization creation is server-backed and creates/activates the organization through `@repo/organizations`. The combined `/onboarding` flow is the normal signup path. A second `/welcome` → `/create-organization` flow also exists and duplicates part of onboarding.

### Organization switching

**MISSING as user-facing UX.** The store has `refreshOrganizations` and `setActiveOrg`, but no mounted route renders an organization picker or invokes `setActiveOrg`. Root hydration reads the persisted cache only. The app therefore cannot perform the requested Org A → Org B user test through current UI.

### Stale organization context risk

`useActiveOrg` reads the cached active organization. `refreshOrganizations` is called after accepting an invitation but not on auth-user transitions or root startup. `signOut` clears auth but does not clear the organization cache. A subsequent user on the same client can briefly see the prior organization/team cache, while subsequent server requests may fail. This is a high-priority Phase 4 remediation because server authorization does not prevent stale client presentation.

### Team

Team reads and mutations are server-backed and role-aware:

- owner/admin can invite; owner can change roles and transfer ownership;
- owner cannot be removed;
- member removal has destructive confirmation;
- pending invitations can be revoked;
- refresh icon explicitly reloads members/invitations;
- empty pending invitation state exists.

There is no pagination, no explicit empty-members state, no visible refresh failure state, and no reusable organization switcher.

### Invitation acceptance

The invitation route calls real accept/decline procedures and shows busy states. It does not expose the bearer token in UI. The logged-out branch only navigates to sign-in and does not retain the route token itself. Deep-link pending storage is not reliably connected to the mounted organization store/auth timing. Accepting a valid invitation refreshes server organizations and navigates Home once the user is already authenticated.

## Subscription and billing audit

| Capability | Classification | Evidence |
|---|---|---|
| Current canonical plan on Home | Server-backed read | `dashboard.overview` returns plan/entitlement/subscription data |
| Plan comparison | Local preview | `/billing` renders static `@repo/billing` plans |
| Upgrade action | Local preview only | `useBilling().setPlan(id)` plus success alert; no purchase |
| Downgrade action | Local preview only | Same local state mutation; no provider/server mutation |
| Cancel | Missing | No cancel control or server/provider operation |
| Trial status | Missing in billing UI | No trial control/status surface |
| Past-due/grace | Missing in billing UI | Home can render server subscription tone, but billing screen does not expose management state |
| Billing portal | Placeholder/deferred | Text says to connect Stripe/Polar; no action/provider session |
| Real checkout | Deferred external provider | Stripe/RevenueCat integration and signed webhook reconciliation remain Phase 3 release deferrals |

### Upgrade trace

```text
Home manage billing → /billing → choose plan → local Zustand plan update → local Alert
```

No money is charged and no canonical subscription is changed. Before production billing, the app needs a truthful provider-backed entry point, authenticated server-created checkout/portal session, verified provider event processing, reconciliation, status/error/grace UI, and tests. Those provider operations are outside this audit and remain deferred.

## Generic product UX audit

| Pattern | Current status | Evidence | Reusable today? |
|---|---|---|---|
| List | **PARTIAL** | `ListRow` plus Team, Sessions, and Notifications compositions | Visual pattern exists; no shared data/state shell |
| Detail | **MISSING** | `/organization/:slug` only prints a slug; no list → detail → edit flow | No |
| Create | **PARTIAL** | Signup, onboarding organization, invitation, avatar upload | Conventions exist but loading/error handling is inconsistent |
| Edit | **PARTIAL** | Settings profile and preferences; Team role action | No shared dirty/cancel/error convention |
| Delete | **PARTIAL** | Account/member confirmation; session/invitation/file actions differ | No shared destructive-action component |
| Search | **MISSING** | No user-facing search control or state | No |
| Filtering | **MISSING** | No user-facing filter control or reusable filter state | No |
| Sorting | **MISSING** | No user-facing sort control; database ordering is not UI sorting | No |
| Pagination | **PARTIAL** | Notifications cursor pagination and Load More only | No shared pagination component |
| Pull-to-refresh | **MISSING** | No `RefreshControl`, `onRefresh`, or equivalent screen pattern | No |
| Loading state | **PARTIAL** | Home inline loading, notification text, mutation button spinners | No shared skeleton/loading shell |
| Empty state | **PARTIAL** | Home no-org, Notifications empty, pending invitations empty | No shared empty-state component |
| Error/retry state | **PARTIAL** | Home retry; other screens use alerts or static error text | No shared error/retry shell |
| Permission-denied state | **MISSING** | Server authorization exists; no dedicated UI state | No |
| Offline/network state | **MISSING** | No network status or offline queue UI | No |

### Required filter/search/sort answer

- **Reusable filtering UI:** **NO**
- **Reusable sorting UI:** **NO**
- **Reusable search UI:** **NO**
- **Should Phase 4 implement them:** **YES**, after the auth/account/org foundations and before generic domain CRUD.

Smallest proposed architecture: add platform-neutral `SearchField`, `FilterChip`/filter sheet, and `SortMenu` primitives to `@repo/ui`; keep query/filter/sort state in a route-level typed hook; use client-side filtering only for already-loaded small lists and server-side query inputs for paginated/large lists. Do not add a new backend domain or global state system merely to support these controls.

## Create/edit/detail/delete conventions

### Create

Existing forms use labeled Inputs, local validation, mutation loading in some screens, server error display, and navigation after success. Signup and invitations have the clearest loading handling. Organization onboarding lacks a mutation loading indicator. The combined onboarding profile mutation is not wrapped in the same visible error convention.

### Edit

Settings loads initial profile/preferences from the server and invalidates queries after mutation. It does not expose a dirty indicator, cancel action, or explicit save-disabled state. Preferences save immediately. Team role edits are immediate with an alert on success.

### Detail

No reusable detail route exists. Notification cards navigate to safe known routes when notification data contains one, but there is no notification detail screen. Organization detail is a placeholder and does not fetch server data.

### Delete/destructive actions

- Account deletion: confirmation, danger styling, busy state, server error, local clear, post-delete root navigation.
- Member removal: confirmation, destructive action, busy state, server error; owner removal is blocked.
- Session revoke: server-backed and busy, but no confirmation.
- Invitation revoke: server-backed and busy, but no confirmation.
- File deletion: no user-facing file-management screen.

The app has examples, not a reusable destructive-action pattern.

## Visual and UX consistency audit

### Positive conventions

- `Screen` applies safe-area padding, keyboard avoidance, scrolling, and theme background.
- Shared Button heights are 44/52 points, with primary/secondary/ghost/danger variants and disabled/loading state.
- Cards, badges, typography, and colors use the shared UI theme.
- Main tab titles and most core copy use i18next.
- Home, Settings, Team, and Notifications use consistent card/list composition.

### Actionable issues

- The standalone onboarding routes use `View` rather than the shared `Screen`; they do not receive the same safe-area and keyboard-avoidance behavior as auth/settings screens.
- Loading behavior is inconsistent: Home has a full state card, Notifications has text, Team relies on refresh/mutation busy flags, and Settings often waits for query errors/blank values without an inline initial-state shell.
- Error behavior is inconsistent: Home has retry, Notifications has static error text, Team/Settings use alerts, and Invite displays raw/local strings.
- There is no shared empty/error/permission/offline state component.
- The billing screen’s success copy asserts a plan change even though only local preview state changed.
- The app has duplicate onboarding routes with different conventions, increasing navigation ambiguity.
- Back navigation is implicit on tab screens and incomplete on invite/verification routes; there is no universal navigation/deep-link validation evidence.

No pixel-perfect visual or native safe-area certification is claimed because the browser walkthrough was blocked and no native device/simulator run was performed.

## Accessibility audit

### Present

- Shared `Button` sets `accessibilityRole="button"` and disabled state.
- Team refresh and icon-only remove controls have explicit labels.
- Button touch heights are intentional and generally meet mobile touch-target intent.
- Inputs visibly render labels and inline error text.

### Gaps

- `Card` with `onPress` does not set an accessibility role/label; notification cards use this path.
- `ListRow` does not set an accessibility role/label when used as an interactive row.
- `SegmentedControl` buttons do not expose selected state or role metadata.
- `Input` renders a visual label but does not bind it as a native accessibility label/description.
- The assistant send icon has a button role but no accessibility label.
- Settings `Switch` controls have no explicit accessibility label/value description.
- Contrast is theme-token based but has not undergone WCAG/native accessibility certification.

This is an obvious-issues audit, not WCAG or platform accessibility certification.

## i18n audit

The architecture includes English and German resources, persisted locale preferences, and root/settings synchronization. Most auth, Home, Team, Notifications, Billing, and Settings labels use translation keys.

Hard-coded or incomplete core-surface strings include:

- `auth.continueWithGithub` is requested by the screen but is absent from both locale resources; `continueWithGoogle` exists instead.
- Verify-email English fallback strings are embedded in the component.
- Invitation title, sign-in guidance, Accept, Decline, invalid-link, and result/error messages are hard-coded English.
- Organization detail `Organization: {slug}` is hard-coded English.
- Assistant title, greeting, placeholder, fallback text, and user label are hard-coded English; the route is also a mock.
- Root monitoring fallback (`Something went wrong`, `Try again`) is hard-coded English.
- Marketing badge/footer and onboarding emoji copy include hard-coded presentation strings.
- Settings locale option labels (`English`, `Deutsch`) are intentionally literal language names.
- Server error messages displayed through alerts are not mapped to localized user-facing errors.

German support is therefore structurally present but incomplete across universal/deep-link/mock routes.

## Test inventory

The repository currently contains **29 test files** and **151 passing tests**. There are no component/UI test files under `apps/mobile/app`; the three mobile test files cover dashboard/storage/notification helper behavior. Existing API/package tests are not full user-flow tests.

| Flow | Unit/policy test | API integration/contract | PostgreSQL integration | Component/UI test | Maestro authored | Manual check |
|---|---|---|---|---|---|---|
| Login | No dedicated mobile login test | No full Better Auth UI/API flow test | No dedicated login probe | No | Partial/stale `auth.yaml` | Partial; browser blocked |
| Signup | No dedicated mobile signup test | Auth server config only; no full signup flow | No dedicated signup probe | No | Partial/stale `onboarding.yaml` | Partial; browser blocked |
| Logout | Auth security helpers cover session parsing | No full UI logout flow | No dedicated logout probe | No | Partial/stale `auth.yaml` | Not executed |
| Session restoration | Auth security tests cover persisted-token parsing | No full app reload test | No dedicated reload probe | No | No dedicated flow | Not executed |
| Invalid session / protected redirect | No dedicated UI test | Protected procedure tests exist, not router redirect | No dedicated UI probe | No | `protected.yaml` is authored but stale | Not executed |
| Forgot/reset password | No | No reset route/provider test | No | No | No flow | Not executed |
| Edit profile | Settings API tests cover protected profile contract | API procedure evidence exists | Phase 3 probe covered profile boundaries, not UI | No | No flow | Not executed |
| Change password | No mobile UI test | Better Auth wrapper exists; no full UI flow | No dedicated UI probe | No | No flow | Not executed |
| Sessions/revoke | No mobile UI test | Settings API contract tests | Phase 3 session boundary evidence | No | No flow | Not executed |
| Delete account | No mobile UI test | Settings/account-deletion API tests | Phase 3 ownership probe | No | No flow | Not executed |
| Create organization | Dashboard/helper tests are not UI tests | Organization/team API tests | Phase 3 organization probe | No | Partial/stale `onboarding.yaml` | Not executed |
| Switch organization | No | Organization list/set store exists; no UI flow | No UI switch probe | No | No flow | Not executable; no UI |
| Team/invite | Team API/security tests | Team/invitation contracts | Phase 3 invitation/isolation probe | No | No dedicated current flow | Not executed |
| Accept invitation | Invitation policy/API tests | Accept/decline procedures | Phase 3 invitation probe | No | `deepLink.yaml` is stale | Not executed |
| Notifications | Mobile notification helper + policy tests | Notifications lifecycle/API tests | Phase 3 notification probe | No | No current flow | Not executed |
| Billing/upgrade | Billing policy/API tests | Billing contracts/RBAC | Phase 3 billing integrity probe | No | `auth` only; no upgrade flow | Not executed |
| Search/filter/sort | No | No | No | No | No | Not applicable; missing UI |
| Generic create/edit/detail/delete | Package/API examples only | Domain-specific existing APIs | No generic resource probe | No | No | Not applicable; no generic domain |

## Maestro audit

Maestro was not run, installed, or claimed. Five authored flow files exist:

- `appLaunch.yaml`
- `auth.yaml`
- `onboarding.yaml`
- `protected.yaml`
- `deepLink.yaml`

They are **PARTIAL / stale authored coverage**, not executable evidence:

- `auth.yaml` and `onboarding.yaml` do not provide a password even though the mounted sign-in screen requires one.
- They tap `Continue`, while the current sign-in button is the translated sign-in label and the onboarding flow uses the combined `/onboarding` route.
- `protected.yaml` taps Home after clearing state without performing authentication.
- `deepLink.yaml` assumes sign-in will preserve and later resolve the invite but the current direct invite route does not retain the token.
- No authored flows cover profile edit, organization switch, notifications, or billing entry/upgrade.

Required future flow coverage should be rewritten against actual labels and test fixtures before execution is considered.

## Manual local testing

Status: **MANUAL WALKTHROUGH PARTIAL**.

- `pnpm build` successfully generated the web export and 41 static routes.
- A local static server was started and then stopped after the readiness check did not return an HTTP response in this environment.
- Browser automation was attempted, but Chrome blocked the session on the “Allow remote debugging?” permission prompt. The permission was not bypassed.
- No valid credentials were guessed or fabricated, no test account was created, and no native/device/EAS/Maestro result is claimed.

The audit therefore uses source-level logical flow evidence and automated repository validation, not an interactive PASS claim.

## Required Phase 4 work identified by this audit

### Missing high-priority screens

- Reset Password.
- User-facing Organization Switcher.
- A truthful provider-backed Billing/Upgrade surface once external billing is configured.
- Optional dedicated Notification Detail if notification payloads require detail beyond safe destination routing.
- Storage/Files management UI if files are part of the product promise.
- Shared Permission Denied, Offline/Network Failure, and reusable Error/Retry state surfaces.

### Missing high-priority flows

- End-to-end forgot-password → reset-password → success/invalid-token flow.
- Corrected invalid-session expiry handling and redirect.
- Organization list refresh, switch, cache replacement, and cross-user cache clearing.
- Invite deep-link persistence through sign-in and safe post-auth acceptance.
- Real provider-backed upgrade/portal/cancel/status flow; do not fake it with local plan state.
- Reusable loading/empty/error/retry/permission/offline behavior.
- Current, executable E2E flows for auth, onboarding, profile, org switching, invitations, notifications, and billing entry.

## Audit conclusion

**PASS WITH WARNINGS.** The starter already contains the core backend-connected app foundation and several reusable UI conventions. It does not yet contain the universal screen and flow set expected of a production-quality mobile SaaS application. The next milestone may implement the audited gaps in the sequence recorded in `docs/phase-4-universal-app-plan.md`; this audit itself made no code changes and did not start generic product CRUD.
