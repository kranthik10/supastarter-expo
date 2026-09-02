# Phase 3 Milestone 3.8 Audit — SaaS Dashboard + Product Surface

**Status:** PASS WITH WARNINGS — implementation may proceed
**Baseline:** `7e08812`
**Previous milestone:** Phase 3.7 Monitoring
**Scope:** Replace the existing Home placeholder with a thin, server-backed SaaS dashboard using completed Phase 3 capabilities. Phase 3.9 Production Hardening was not started.

## 1. Baseline and existing surface

- Repository: `kranthik10/supastarter-expo`
- Branch: `main`
- Baseline `7e08812` is present locally and aligned with `origin/main`.
- Working tree has no unexpected source changes before this milestone; `.env.development` remains intentionally untracked.
- Existing app shell is `apps/mobile/app/_layout.tsx` → `(app)/_layout.tsx` → `(app)/(tabs)/_layout.tsx`.
- The existing `home.tsx` is already the correct logged-in Home route; no second Dashboard tab or competing app shell is needed.
- Existing Home behavior is a placeholder: hard-coded `3` projects, member count from locally cached organization members, local billing-plan state, empty activity card, and an unrelated Assistant action.
- Existing server capabilities include protected organization membership, subscriptions, entitlements, member/invitation data, storage usage, and notification unread counts.
- Existing Phase 3.6 analytics and Phase 3.7 monitoring boundaries must be reused; no response objects or notification contents will be sent to either system.

## 2. Existing API inventory

| Capability | Existing source | Dashboard use |
|---|---|---|
| Active organization list/context | `organizations.list`, `useOrgs`, `useActiveOrg` | Select current org and handle no-org state |
| Membership/role | `organizationMembers`, `members.list` | Server-derived role in overview |
| Subscription | `billing.getSubscription`, `subscriptions` | Plan/status/trial/grace/cancel summary |
| Entitlements | `billing.getEntitlement`, `listEntitlements`, `resolveEntitlement` | Members/storage limits and enabled state |
| Team data | `members.list`, invitation rows | Bounded member and pending-invitation counts |
| Storage usage | `getOrganizationStorageUsage` | Ready bytes plus separately labeled pending bytes |
| Notifications | `notifications.getUnreadCount` | User-scoped unread count |
| UI permissions | existing `owner/admin/member` role union and server permission matrix | UX-only action visibility; server remains authoritative |

No existing dashboard overview procedure exists. Client composition would require several parallel calls and cannot obtain storage usage efficiently without exposing a new usage query. A small aggregation is justified.

## 3. Proposed change classification

| Change | Classification | Rationale |
|---|---|---|
| Enhance existing Home route | LEGITIMATE CORRECTION | Removes placeholder/fake values without creating a second surface |
| Protected `dashboard.overview` query | LEGITIMATE ADDITION | Bounded aggregation avoids client waterfalls and centralizes authoritative summary reads |
| Server membership check in overview | LEGITIMATE ADDITION | Required for organization isolation; input organization ID is never trusted alone |
| Reuse entitlement resolver | MATCH | One source of truth for member/storage limits and subscription effects |
| Reuse storage usage service | MATCH | Ready/pending semantics already exist |
| Bounded unread notification count | MATCH | Existing user-scoped Phase 3.5 procedure/data semantics |
| Local `formatBytes`/`formatUsage`/`formatCount` helpers | LEGITIMATE ADDITION | Consistent human-facing display without a utility framework |
| Role-derived action visibility | MATCH / LEGITIMATE CORRECTION | Uses existing role union only for UX; no second server permission matrix |
| Dashboard analytics events | LEGITIMATE ADDITION | Two product-level events through the Phase 3.6 typed facade |
| Dashboard monitoring calls | REJECT | Existing Phase 3.7 error boundary and server boundary already cover failures |
| Projects/AI usage widgets | REJECT / DEFER | Entitlement keys exist but no corresponding product usage exists |
| Activity feed, CRM, tasks, chat, reports, invoices, support tickets, workflow system | REJECT | New domains explicitly out of scope |
| Dashboard database/table/snapshot | REJECT | Derived read model needs no persistence |
| New visual component library/design system | REJECT | Existing `@repo/ui` primitives are sufficient |
| New Dashboard tab/app shell | REJECT | Existing Home tab is the correct surface |
| Phase 3.9 hardening | DEFER | Explicit next milestone |

## 4. Dashboard data contract decision

Use `dashboard.overview({ organizationId })` with server-derived membership and a bounded response:

```text
organization: id, name, role
planId: free | pro | enterprise
subscription: status, trialEndsAt, graceEndsAt, currentPeriodEnd, cancelAtPeriodEnd
entitlements: members.limit/enabled, storage.limitGb/enabled
team: memberCount, pendingInvitationCount
storage: readyBytes, pendingBytes
notifications: unreadCount
```

The response excludes complete user/organization/subscription/entitlement/member/notification/file rows, provider IDs, file keys, signed URLs, notification content, member emails, and raw organization metadata.

The endpoint:

- requires an authenticated Better Auth context;
- verifies the authenticated user is a member of the requested organization;
- returns `FORBIDDEN` for unrelated organizations;
- reuses `listEntitlements` and `getOrganizationStorageUsage`;
- counts accepted members and non-expired pending invitations;
- counts unread notifications only for the authenticated user;
- returns confirmed ready storage for the main usage display and pending reservations separately.

## 5. Client behavior decision

- Home query key is `['dashboard', 'overview', organizationId]`; organization ID prevents cache collisions.
- Active organization changes invalidate/refetch the active overview query; the new query key cannot display Org A data under Org B.
- No organization renders an onboarding/create-organization state instead of assuming an org exists.
- Query loading, error, and retry states are distinct from zero values.
- Plan UI preserves `free`, `trialing`, `active`, `past_due` with/without grace, `canceled`, and `incomplete` distinctions.
- Storage UI shows confirmed ready bytes against the entitlement limit; pending reservation bytes are labeled separately and are not presented as confirmed stored data.
- Team UI displays authoritative member count/limit and pending invitations.
- Notification UI displays only unread count and links to the existing notification center.
- Quick actions navigate only to existing Home/team/billing/settings/notifications/create-organization routes.
- Owner/admin invite/manage-billing actions are hidden for members as UX; API RBAC is unchanged and remains authoritative.
- Existing Home/Team/Billing/Settings/Notifications routes remain in place.
- Existing `en`/`de` i18n is extended; no new locale or design system is added.
- A responsive max-width content wrapper keeps web export usable without creating a desktop admin portal.

## 6. Analytics and monitoring boundary

Add only:

- `dashboard_viewed` with opaque `organization_id`;
- `dashboard_quick_action_selected` with a finite action key.

Do not capture organization names, member lists/emails, notification content, file names/keys/URLs, raw errors, or complete overview objects. Existing Phase 3.7 monitoring receives failures through the root boundary/Hono `onError`; no manual capture calls are added to Home.

## 7. Schema and security decision

- Schema: NONE.
- Migration: NONE.
- No dashboard state is persisted.
- No client-supplied role, plan, entitlement, member count, storage count, or unread count is trusted.
- No existing Phase 3.1–3.7 authorization or provider boundary is weakened.
- Real billing state is displayed from server subscription state; client intent cannot fabricate payment success.
- EAS/Maestro/native manual execution remains deferred.

## 8. Required tests and evidence

- Presentation helper tests for bytes, confirmed/unlimited storage, member limits, subscription states, and role-derived actions.
- Protected dashboard procedure contract test.
- Real PostgreSQL/tRPC probe for own-org overview, plan/entitlement/team/storage/unread data, cross-org denial, and Org A/B isolation.
- Full existing regression suite; no tests removed or weakened.
- Expo export for iOS/Android/web.
- Bundle scan for private config/provider identifiers.
- No-schema database generation/drift check.

## 9. Warnings and manual-check boundary

- The repository has no configured production billing provider; the dashboard reports actual stored subscription/entitlement state and does not claim payment success.
- Physical-device/native manual execution, EAS, and Maestro remain unavailable/deferred.
- The current local check can verify the API contract, build/export, and route structure, but not a real authenticated native-device walkthrough.

## 10. Fundamental conflict check

No fundamental conflict was found. The existing Home route and server capabilities support a thin dashboard. The only new backend surface is a bounded protected read aggregation; no new product domain, table, permission model, or provider infrastructure is introduced.
