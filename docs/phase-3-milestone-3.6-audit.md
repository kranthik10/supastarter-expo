# Phase 3 Milestone 3.6 Audit — Analytics

**Status:** PASS WITH WARNINGS — implementation may proceed
**Baseline:** `7f6be9b`
**Previous milestone:** Phase 3.5 Notifications
**Scope:** Client/server analytics abstraction, PostHog provider seams, typed event catalog, privacy guardrails, consent, lifecycle identity, organization context, screen tracking, and selected product events

## 1. Baseline verification

- Repository: `kranthik10/supastarter-expo`
- Branch: `main`
- Baseline: `7f6be9b` is present locally and `origin/main` is aligned.
- Working tree: no unexpected source changes; `.env.development` remains intentionally untracked.
- Phase 3.1–3.5 implementation and CI checkpoints remain authoritative.
- Phase 3.7 Monitoring/Sentry, EAS, Maestro, and real external provider verification remain out of scope.

## 2. Existing analytics inventory

| Area | Current state | Classification |
|---|---|---|
| `packages/analytics` | One root module with `track`, `screen`, `identify`, console provider, and unrestricted string event names | LEGITIMATE CORRECTION; retain small seam, add typed/runtime-safe catalog |
| `AnalyticsProvider` | No `reset`, `group`, enabled/disabled semantics, or failure isolation | LEGITIMATE ADDITION |
| PostHog client | No provider implementation; public key/host fields already exist in `packages/config` | LEGITIMATE ADDITION |
| PostHog server | `POSTHOG_SERVER_KEY` exists in private env schema, but no server provider or calls | LEGITIMATE ADDITION for server-authoritative events |
| `@repo/auth` | Calls old `sign_in`/`sign_up`/`sign_out`; sign-up sends raw email and name; no reset | LEGITIMATE CORRECTION; remove unsafe/scattered calls and centralize lifecycle in app root |
| Screen tracking | None at Expo Router navigation boundary | LEGITIMATE ADDITION |
| Organization context | `useOrgs.activeOrgId` exists; no analytics group/context updates | LEGITIMATE ADDITION |
| Analytics consent | No field; `marketing_opt_in` exists but is a marketing preference | LEGITIMATE ADDITION to existing preferences row |
| Event catalog | Phase 0 uses lower-snake names while Phase 3 ADR mixes dotted names | LEGITIMATE CORRECTION; choose lower_snake_case consistently |
| Mobile analytics package boundary | Root package has no provider dependency and is shared by auth/mobile; no server subpath | LEGITIMATE CORRECTION; root client-safe, `./server` server-only |
| Analytics database table | None | MATCH; do not add duplicate event storage |

## 3. Architecture decisions

### 3.1 Event naming

Use one convention: **lower_snake_case**, with product-level `verb_subject` names. Initial catalog:

- `user_signed_in`
- `user_signed_out`
- `organization_created`
- `invitation_accepted`
- `notification_opened`
- `notification_marked_read`
- `push_permission_changed`
- `settings_updated`
- `theme_changed`
- `locale_changed`
- `screen_viewed`
- `organization_switched`
- `storage_upload_completed`
- `billing_screen_viewed`
- `plan_selected`
- `checkout_requested`

No arbitrary event strings are accepted by the public facade at runtime, even if a caller bypasses TypeScript.

### 3.2 PII policy

Raw email and raw full name are **disabled**. The analytics distinct ID is the authenticated internal user ID. Allowed identify traits are limited to non-sensitive product metadata such as `locale`, `theme`, and safe plan/context values. Event properties may use opaque internal `organization_id`/`user_id` values where necessary for product analysis, but never credentials or user-entered content.

Forbidden property keys are normalized case-insensitively and include `password`, `token`, `accessToken`, `refreshToken`, `authorization`, `cookie`, `secret`, `apiKey`, `presignedUrl`, `uploadUrl`, `downloadUrl`, `invitationToken`, `email`, `name`, `phone`, and `address`. Events with forbidden, nested, unknown, or unsupported properties are rejected before provider invocation. This guard is a lightweight safety net, not a complete legal/privacy review.

### 3.3 Consent and opt-out

`marketing_opt_in` is not analytics consent. Add `user_preferences.analytics_enabled boolean NOT NULL DEFAULT true` as an additive field on the existing preference model. The app loads this server-authoritative value before identifying/capturing an authenticated user. When disabled, `capture`, `identify`, `group`, and `screen` become no-ops and the provider identity is reset. A failed preference update must not cause a product failure.

If preferences cannot be loaded, analytics remains disabled for that authenticated session rather than silently collecting. No preference-specific analytics event is emitted while transitioning to disabled.

### 3.4 Provider boundary

- `@repo/analytics` root: client-safe policy, typed facade, no-op/fake providers, and fetch-based PostHog client provider using only intentionally public `EXPO_PUBLIC_POSTHOG_KEY`/`EXPO_PUBLIC_POSTHOG_HOST`.
- `@repo/analytics/server`: server-only fetch provider and factory using private `POSTHOG_SERVER_KEY`; no React Native imports, database imports, or client secrets in the root path.
- No PostHog SDK is required; the HTTP capture endpoint keeps the dependency surface small and allows deterministic failure handling.

Provider failures are swallowed by the facade/provider seam and never rollback or fail business operations. Missing client key or server key selects a no-op provider.

### 3.5 Identity and organization lifecycle

The app root owns authenticated analytics lifecycle after preferences load:

```text
anonymous/no-consent → load user_preferences → set enabled
  → identify(internal user id, safe traits)
  → group('organization', activeOrgId) when selected
logout/user switch → disable/reset → next user loads fresh consent
```

Active organization changes update the group context and emit only safe `organization_switched` data. Group is provider-independent at the facade; PostHog maps it to a group call, while fake/no-op providers retain the same interface.

Server-authoritative `organization_created` and `invitation_accepted` events are emitted from trusted API operations only. Client code does not duplicate those same logical events. Client-observed notification/settings/screen events remain client-owned.

### 3.6 Screen and deep-link privacy

Screen tracking is attached at the Expo Router boundary. Route names are converted to a finite logical screen union (`home`, `team`, `billing`, `settings`, `notifications`, `organization`, `invite`, `auth`, `onboarding`, `assistant`, `unknown`). Dynamic invite tokens and query parameters are discarded. No raw pathname, query string, invitation token, or presigned URL is sent.

### 3.7 Product event property policy

Event properties are declared per catalog entry and remain scalar values only. Examples:

- `notification_opened`: category and optional opaque organization ID; never title/body.
- `storage_upload_completed`: user/org scope, MIME category, and size bucket; never object key or signed URL.
- `settings_updated`: changed safe field name only; never the complete preference object.
- `push_permission_changed`: coarse permission status only.
- `plan_selected`/`checkout_requested`: plan and organization context only; no payment details or provider IDs.

### 3.8 Database scope

No `analytics_events` table is justified. PostHog is the external analytics system; application database writes must not be coupled to provider ingestion. The only schema addition is the explicit user consent field on the existing `user_preferences` table.

## 4. Proposed change classification

| Change | Classification | Rationale |
|---|---|---|
| Typed finite event catalog | LEGITIMATE ADDITION | Prevents ad-hoc names and documents event contracts |
| Lower-snake naming correction | LEGITIMATE CORRECTION | Resolves Phase 0/Phase 3 inconsistency |
| `AnalyticsProvider.reset`/`group`/enabled seam | LEGITIMATE ADDITION | Required lifecycle and org context |
| Client PostHog provider | LEGITIMATE ADDITION | Phase 0 selected PostHog; public project key is client-safe by design |
| Server PostHog provider | LEGITIMATE ADDITION | Small server-authoritative event seam for trusted operations |
| `user_preferences.analytics_enabled` | LEGITIMATE ADDITION | Distinct from marketing consent; server-authoritative opt-out |
| Analytics database event table | REJECT | Duplicates external event storage without a demonstrated requirement |
| Raw email/name identify traits | REJECT | Conflicts with explicit PII guardrail and no need for V1 funnels |
| Raw route/path/query tracking | REJECT | Risks invitation-token and signed-URL leakage |
| Direct PostHog calls from screens | REJECT | Violates provider abstraction |
| PostHog personal/admin key in mobile | REJECT | Private credential must remain server-only |
| Sentry/monitoring/error capture | DEFER | Phase 3.7 |
| ETL, warehouse, attribution, experimentation, feature flags | DEFER | Out of scope |

## 5. Trusted event ownership

| Event family | Owner | Reason |
|---|---|---|
| `organization_created` | Server | Database/RBAC operation is authoritative |
| `invitation_accepted` | Server | Transactional membership acceptance is authoritative |
| `user_signed_in` | Client root lifecycle | Observes authenticated session without sending credentials |
| `user_signed_out` | Client root lifecycle | Must reset local provider identity |
| `screen_viewed` | Client navigation boundary | Router observes logical screen |
| Notification open/read/permission | Client | Device interaction and permission status are local observations |
| Settings/theme/locale | Client | User interaction and local rendering state |
| Storage upload completion | Client helper | User-visible completion, with safe bucketed metadata only |
| Billing intent events | Client | Intent only; no payment-success claims |

No event is duplicated across client/server unless the names intentionally represent different observations.

## 6. Validation plan

- TDD policy tests for catalog names, property allowlists, forbidden keys, scalar-only values, route sanitization, opt-out behavior, and provider failure isolation.
- Provider tests for fake/no-op/PostHog payload shape and missing/failing configuration without network success claims.
- Auth/API tests ensuring no raw email/name analytics traits and server event seams remain non-fatal.
- Real local preference migration/readback for `analytics_enabled` and existing preference preservation.
- Full `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, frozen install, and migration drift check.
- Mobile bundle scan for `POSTHOG_SERVER_KEY`, personal/admin key names, database/private config imports, and forbidden test secrets.
- Real PostHog ingestion remains separately reported and deferred if no project key is configured.

## 7. Explicit deferrals

| Capability | Status at audit |
|---|---|
| Client analytics abstraction | To implement |
| Client PostHog provider | To implement; external ingestion may be deferred |
| Server analytics abstraction | To implement for selected trusted events |
| Fake provider | To implement/test |
| No-op provider | To implement/test |
| Analytics opt-out storage | Legitimate additive field |
| Analytics opt-out enforcement | To implement |
| Screen tracking | To implement at router boundary |
| Organization/group context | To implement |
| Raw email tracking | REJECTED/DISABLED |
| Raw name tracking | REJECTED/DISABLED |
| Real PostHog ingestion | DEFERRED until configured key/project is safely available |
| Phase 3.7 Monitoring/Sentry | DEFERRED / OUT OF SCOPE |

## 8. Fundamental conflict check

No fundamental architectural conflict was found. The approved PostHog decision remains compatible with the existing monorepo. The required corrections are to replace the console/untyped/PII-leaking stub, resolve event naming, add an explicit analytics consent field to the existing preferences row, and separate client-safe and server-only provider exports.
