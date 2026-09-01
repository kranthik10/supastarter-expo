# Phase 3 Milestone 3.2 Audit

**Date:** 2026-09-01
**Active baseline:** `33daf39` (Phase 3.1 feature checkpoint `c0f54f7` plus verified documentation closure)
**Historical Phase 2 baseline:** `5c1ceba`
**Scope:** Team + Invitations only
**Result:** PASS — no blocking architectural conflict found

## Baseline

- Repository: `kranthik10/supastarter-expo`, branch `main`.
- Phase 3.1 is committed as `c0f54f7`; its documentation/CI record was closed in `33daf39`.
- Phase 3.1 CI run `33539998678` completed successfully. The new active baseline for 3.2 is `33daf39`.
- Existing validation before 3.2: 63 tests, typecheck/lint/build pass; EAS and Maestro remain deferred.
- Existing authorization boundary remains Hono + tRPC `protectedProcedure` + server-side membership lookup + `assertCan()`.
- IDs remain text/cuid2. No RLS is introduced.

## Existing implementation

### Database (`packages/database/src/schema.ts`)

The current schema has 17 tables after 3.1. Relevant tables:

- `organizations`: text `id` primary key, name/slug/logo/timestamps; slug unique.
- `organization_members`: text `id`, `organization_id` FK cascade, `user_id` FK cascade, `role` enum (`owner|admin|member`) default member, `created_at`; unique `(organization_id,user_id)`.
- `invitations`: text `id`, `organization_id` FK cascade, `email`, `role` enum default member, unique `token`, `invited_by` FK users, non-null `expires_at`, `created_at`. No lifecycle status, response timestamp, code, or organization index.
- `audit_logs`: text `id`, nullable organization/user FKs with `set null`, action/target/metadata/timestamp. No helper currently writes team events.
- `entitlements`: Phase 3.1 organization-scoped table with unique `(organization_id,feature)`; `members.limit` is available through the server resolver.

Existing constraints already provide membership uniqueness and cascade deletion. There is no database singleton-owner constraint; the service must preserve the owner invariant transactionally.

### API (`packages/api/src/router.ts`)

Existing procedures:

- `members.list({ organizationId })`: checks only membership, then returns raw `organization_members` rows. It does not join safe user profile fields and does not call `assertCan(members.read)`.
- `members.invite({ organizationId,email,role })`: checks membership and `members.invite`; lowercases but does not trim; accepts `owner`; does not reject existing members or duplicate pending invitations; uses `createId()` token; has no member-limit check, audit, email-delivery result, or lifecycle state.
- `members.remove({ organizationId,userId })`: checks membership and `members.remove`; forbids self-removal but does not protect the sole/final owner and does not write audit logs.
- No `members.updateRole`, `invitations.list/create/accept/decline/revoke`, or `organizations.transferOwnership` procedures exist.
- `organizations.create` is already transactional and initializes free entitlements.
- `billing` routes established the pattern of server membership validation and `assertCan`.

### Organization package and types

- `packages/organizations` persists a client cache and exposes `createOrg`, `inviteMember`, `removeMember`, `useActiveOrg`; its server-backed invite/remove wrappers do not expose lifecycle, role, invitation, or transfer operations.
- `packages/types` has `MemberRole` and `Member`, but no invitation DTO or member-with-user DTO.
- `apps/mobile/app/(app)/(tabs)/team.tsx` has a local invite form and local-looking member list. It calls the organization wrappers, displays roles, and offers remove icons for non-owner rows; it has no server pending-invite list, role update, revoke, transfer, or accept flow.
- `apps/mobile/app/invite/[token].tsx` is a placeholder: it displays the raw token and navigates to `/home` without calling the API. This route is already part of Expo Router and uses the active app configuration's scheme rather than hardcoding a scheme.

### Email, rate limiting, and audit infrastructure

- `packages/config/src/env.ts` declares private `RESEND_API_KEY`, but no email provider implementation or send call exists. A no-op provider seam is required; delivery must be reported separately from persisted invitation creation.
- No rate-limit implementation exists. ADR-016 proposes an in-memory, swappable bucket for abuse-sensitive endpoints with distributed Redis/Cloudflare as the future production upgrade. A narrow in-process guard for invitation creation and redemption is allowed in this milestone; its process-local limitation will be documented.
- No team audit helper exists. `audit_logs` is the existing persistence target and its `metadata` JSONB can carry a token hash, never the raw token.

## Phase 3 proposal comparison

| Proposed item | Classification | Finding / decision |
|---|---|---|
| `invitations.status` | LEGITIMATE ADDITION | Required to prevent reuse and distinguish pending/accepted/revoked/expired. Add `invitation_status` enum with default `pending`, preserving all existing rows. |
| `invitations.responded_at` | LEGITIMATE ADDITION | Required lifecycle timestamp; nullable and safe. |
| `invitations.code` | REJECT | Existing secure deep-link token is sufficient. A second plaintext six-character code adds brute-force surface and a second redemption path without a current product requirement. |
| Partial unique `(organization_id,email) WHERE status='pending'` | LEGITIMATE ADDITION | Prevents simultaneous duplicate pending invites. Email is normalized in the API before lookup/insert. Existing rows must be preflighted for duplicates before production migration. |
| `invitations.organization_id` index | LEGITIMATE ADDITION | Required for pending invitation listing and revoke authorization. |
| `members.list` safe user data | LEGITIMATE CORRECTION | Existing raw membership rows are insufficient for the required UI and can expose only server-selected profile fields. Join users and return id/name/email/image/role/joinedAt. No password/account/session columns. |
| `invitations.create` | LEGITIMATE CORRECTION | Existing `members.invite` is retained as a compatibility alias only if needed; canonical lifecycle procedure creates a pending invite, checks membership/permission/capacity prerequisites, hashes token only for audit, and reports email delivery separately. |
| `invitations.accept` | LEGITIMATE ADDITION | Authenticated, server-email-matched, transaction-safe token consumption; membership and `members.limit` checked inside the transaction. |
| `invitations.decline` | LEGITIMATE ADDITION | Keep endpoint semantics distinct from organization revoke. To avoid an extra enum value and remain compatible with ADR-012, store terminal `status='revoked'` with audit action `invitation.declined` and metadata `reason='declined'`. This is the documented shared terminal-state decision, not a silent mix. |
| `invitations.revoke` | LEGITIMATE ADDITION | Membership + `members.invite` authorization; pending-only, org-scoped transition. |
| Lazy `expired` transition | LEGITIMATE ADDITION | Expiry is enforced at request time and list-time from `expires_at`; no scheduler is trusted. Pending expired records are updated to `expired` with `responded_at`. |
| Secure token generation | LEGITIMATE CORRECTION | New tokens use server-side Node `crypto.randomBytes(32).toString('hex')`; existing tokens remain valid. Raw tokens never enter audit/console/analytics/Sentry. |
| `members.updateRole` | LEGITIMATE ADDITION | Reuses `members.update`; owner-only per the existing permission matrix. Ordinary role changes allow admin/member only and cannot create a second owner. |
| `members.remove` owner invariant | LEGITIMATE CORRECTION | Preserve existing route but enforce target membership and prevent removing the final owner; self-leave remains unsupported to avoid accidental invariant violation. Successful removal is audited. |
| `organizations.transferOwnership` | LEGITIMATE ADDITION | Owner-only atomic transaction; target must already be a member; old owner becomes admin, target becomes owner, exactly one owner remains. |
| `members.limit` at accept | LEGITIMATE ADDITION | Accepted members only count. Invitation creation may proceed; acceptance performs the authoritative count check. At capacity, return `PRECONDITION_FAILED` with machine-readable `members_limit_reached`. |
| Audit events | LEGITIMATE ADDITION | Write the required lifecycle/member/transfer actions. Metadata includes normalized email/role and token hash where relevant; never raw token. |
| Email provider | LEGITIMATE ADDITION | Add a provider interface with safe no-op default because only `RESEND_API_KEY` is declared and no sender/provider implementation exists. Invitation persistence does not depend on delivery. |
| Rate limiting | LEGITIMATE ADDITION | Narrow process-local guard for create and accept/decline/redeem paths, using a clear seam for future Redis/Cloudflare. Not a claim of distributed production rate limiting. |
| Mobile team integration | LEGITIMATE CORRECTION | Extend the existing team screen/store; do not redesign. Replace local invite/remove semantics with server calls, show safe member data/pending invites, and add lifecycle actions. |
| Invite deep link | LEGITIMATE CORRECTION | Existing `/invite/[token]` route calls `invitations.accept`/`decline`; app scheme continues to come from `app.config.ts` variant config. No EAS/Maestro execution. |

## Differences

1. Existing invitation persistence is one-shot and has no lifecycle state.
2. Existing token generation is a generic `createId()` call and no token hash/audit policy exists.
3. Existing invitation email normalization omits trimming and does not check users or pending invitations.
4. Existing member listing returns membership rows without safe user profile joins.
5. Existing members invite/remove endpoints lack duplicate/existing-member checks, entitlement capacity checks, audit events, email delivery reporting, and owner invariant protection.
6. Role updates, ownership transfer, invitation listing/accept/decline/revoke are absent.
7. No email sender, rate limiter, or reusable audit helper exists.
8. The ERD's optional plaintext `code` is not justified by the current app and will not be added.

## Legitimate changes and migration safety

### CHANGE: invitation lifecycle columns and enum
- **WHY:** Request-time lifecycle enforcement and one-use semantics.
- **SOURCE:** Phase 3 ERD § invitations, ADR-012, milestone requirements.
- **SAFE MIGRATION:** Create `invitation_status` (`pending|accepted|revoked|expired`); add `status` with default `pending` and not-null, add nullable `responded_at`; no existing columns renamed/deleted. Existing tokens remain valid.
- **AFFECTED PACKAGE:** `@repo/database`, `@repo/api`, `@repo/types`.
- **TEST REQUIRED:** all terminal states reject reuse; expiry is lazy and request-enforced.

### CHANGE: pending invitation uniqueness/indexes
- **WHY:** Database race-safety and efficient org listing.
- **SOURCE:** Phase 3 ERD § invitations + requirements.
- **SAFE MIGRATION:** Create partial unique index on normalized stored `(organization_id,email)` where `status='pending'`, plus org index. API normalizes new values. Production migration requires preflight for duplicate pending rows; current local database has no pending invitation duplicates.
- **AFFECTED PACKAGE:** database/API.
- **TEST REQUIRED:** duplicate pending invite maps to stable `CONFLICT`; cross-org same email is allowed.

### CHANGE: team API and audit behavior
- **WHY:** Complete required lifecycle while preserving server authorization.
- **SOURCE:** existing permission matrix, ADR-012, requirements.
- **SAFE MIGRATION:** none beyond invitation columns/indexes; audit rows use existing `audit_logs`.
- **AFFECTED PACKAGE:** `@repo/api`, `@repo/organizations`, mobile.
- **TEST REQUIRED:** authorization, isolation, audit action, transaction invariants.

### CHANGE: narrow invitation abuse guard
- **WHY:** Protect creation/redemption from obvious abuse before distributed hardening.
- **SOURCE:** ADR-016 and requirements.
- **SAFE MIGRATION:** none; process-local memory only.
- **AFFECTED PACKAGE:** `@repo/api`.
- **TEST REQUIRED:** over-limit requests receive `TOO_MANY_REQUESTS`; limitation documented.

## Rejected / deferred changes

- Plaintext six-character join code: rejected; no need beyond the secure token and no second redemption path.
- New role or permission: rejected; reuse `owner/admin/member`, `members.read`, `members.invite`, `members.remove`, and `members.update`. Existing matrix makes `members.update` owner-only.
- RLS: rejected; API remains authorization boundary.
- `user_preferences`, storage/notification/analytics/monitoring changes, billing provider implementation, broad rate-limit infrastructure: deferred to their milestones.
- Actual Resend delivery: deferred behind no-op provider until a sender/provider is configured; the API will not claim delivery.
- EAS and Maestro: remain deferred.

## Security decisions

- Authenticated user's email is read from `ctx.user.email`; accept does not trust client email input.
- New tokens are 32 random bytes encoded as hex and are unique through the existing token unique constraint. Existing token rows are not invalidated by migration.
- Raw tokens are never persisted in `audit_logs`, logged, or sent to analytics. Audit metadata uses SHA-256 token hashes.
- Every org operation verifies session, membership, and the relevant permission before reading or mutating data. Accept is the exception: valid pending invite + non-expired token + authenticated verified email is the authorization basis.
- Accepted organization members, not pending invites, count toward `members.limit`.
- The owner invariant is checked in the same transaction as removal/transfer.

## Billing architecture assessment

3.1 supplies `canUseFeature` and `getEntitlement` server helpers. The 3.2 accept path will read the effective `members.limit`, count current members inside its transaction, and reject at capacity with `PRECONDITION_FAILED` / `members_limit_reached`. Enterprise `null` remains unlimited. No client-provided entitlement or organization id bypasses server checks.

## Implementation plan

1. Add invitation status enum/columns/indexes and generate one additive Drizzle migration.
2. Add API helpers for normalization, safe audit writes, rate limiting, and no-op email delivery.
3. Extend `members` routes; add canonical `invitations` routes and atomic `organizations.transferOwnership`.
4. Enforce `members.limit` at invitation acceptance and preserve member/owner invariants.
5. Update organization client store and existing team/deep-link screens only as needed.
6. Add service/API contract tests covering lifecycle, identity, isolation, roles, removal, transfer, limits, token redaction, and audit actions.
7. Run full validation and inspect SQL/diff; then update delivery docs.

## Risks

| Risk | Mitigation |
|---|---|
| Partial unique index fails on pre-existing duplicate pending rows | Preflight before production deployment; current local data has no duplicates. API still maps unique violations to `CONFLICT`. |
| Process-local rate limiter does not coordinate across replicas | Documented as interim seam; replace implementation with Redis/Cloudflare in hardening milestone. |
| Shared `revoked` status for decline can be misread | API action and audit action are distinct; metadata records `reason='declined'`; document this intentionally. |
| Existing invitation tokens may be weaker than new tokens | Preserve existing validity per requirement; all newly issued tokens use `crypto.randomBytes(32)`. |
| Transaction support differs in test fakes | Keep business logic in testable server helpers and exercise transaction callback/invariants with repository tests; production uses Drizzle transaction. |
| Email delivery unavailable | Invitation row is still created; response explicitly returns `emailDelivered: false` and `emailStatus='not_configured'`. |

## Audit conclusion

No fundamental conflict was found. Stage B may proceed automatically with the additive schema delta and server-authoritative team/invitation lifecycle above. Do not implement any other Phase 3 milestone.
