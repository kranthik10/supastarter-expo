# Phase 3 Milestone 3.2 — Delivery

**Historical Phase 2 baseline:** `5c1ceba`
**Phase 3.1 checkpoint:** `c0f54f7`
**Phase 3.1 documentation closure:** `33daf39`
**Phase 3.1 GitHub Actions:** `33539998678` — completed / success
**Phase 3.2 implementation baseline:** `33daf39`
**Status:** IMPLEMENTED locally — final commit/CI record pending

## IMPLEMENTED

### Schema and migration

- Added `invitation_status` enum: `pending`, `accepted`, `revoked`, `expired`.
- Added `invitations.status` with safe default `pending` and `invitations.responded_at` nullable.
- Added `invitations_org_idx` for organization-scoped listing.
- Added partial unique index `invitations_pending_org_email_uidx` on `(organization_id,email)` where `status='pending'`.
- Did not add the proposed plaintext `code`; the secure token/deep link is the only redemption credential.
- Existing invitation columns and tokens remain valid. No table/column drops or renames.
- Migration: `packages/database/drizzle/0002_lumpy_cardiac.sql`.

### Server invitation lifecycle

- Canonical `invitations.create` and compatibility `members.invite`:
  - protected session + organization membership + `assertCan(members.invite)`;
  - zod trim + email validation, then server normalization trim/lowercase;
  - existing member and pending-invite conflict checks;
  - new token from `crypto.randomBytes(32)` encoded as 64 hex characters;
  - invitation insert + `invitation.created` audit in one transaction;
  - no-op email provider seam returns `emailStatus='not_configured'` and never blocks persistence.
- `invitations.list`: `members.read`, lazy-expire stale pending rows, returns pending metadata without tokens.
- `invitations.accept`: protected + verified authenticated email must match invitation email; rejects non-pending/expired/wrong identity; transactionally checks `members.limit`, inserts membership, marks invitation accepted, and writes `invitation.accepted` with token hash only.
- `invitations.decline`: invited verified user only; distinct endpoint and `invitation.declined` audit; stores terminal `revoked` with `reason='declined'` for the compatible four-state enum.
- `invitations.revoke`: org member with `members.invite`; pending-only and transactional; writes `invitation.revoked`.
- Expiry is enforced from `expires_at` at request time, not by a scheduler. Lazy expiry commits the `expired` state before returning `invitation_expired`.

### Team/member management

- `members.list`: `members.read` + membership guard; returns only safe user profile fields (`id`, `name`, `email`, `image`), role, organization ID, and joined timestamp.
- `members.updateRole`: owner-only via existing `members.update`; only admin/member targets; owner changes require transfer; transactional audit `member.role_updated`.
- `members.remove`: existing permission retained; transactional; rejects self-removal, missing targets, sole/final owner removal, and owner removal without transfer; audits `member.removed`.
- `organizations.transferOwnership`: owner-only; target must be an existing non-owner member; one transaction changes old owner → admin and target → owner; audits `organization.ownership_transferred`; exactly one owner preserved.
- No new roles or permissions were introduced.

### Abuse/security controls

- Invitation creation: interim process-local limiter, 5 requests per user per 60 seconds.
- Invitation accept/decline: interim process-local limiter, 10 requests per user/action per 60 seconds.
- Raw tokens are never written to `audit_logs`, console, analytics, or Sentry; audit metadata uses SHA-256 token hashes. The authorized creator/provider may receive the token to deliver the invitation.
- All organization-scoped routes validate session + membership + permission. Invitation acceptance uses valid invitation + authenticated verified identity instead of pre-existing membership.
- Accepted members only count toward `members.limit`; pending invitations do not reserve capacity. At capacity, accept returns `PRECONDITION_FAILED` with `members_limit_reached`.

### Mobile

- Existing `Team` screen now refreshes server-authoritative members and pending invitations.
- Invite form calls `invitations.create` and distinguishes invitation persistence from email delivery.
- Pending invitations support revoke for authorized roles.
- Member rows show safe roles and provide owner-only role toggle/ownership-transfer actions plus authorized removal.
- Existing `/invite/[token]` route now calls accept/decline instead of navigating directly to `/home`; unauthenticated deep links continue through the existing pending-link/sign-in flow.
- App scheme remains from `apps/mobile/app.config.ts`; no EAS/Maestro work was performed.

## VERIFIED

| Check | Result | Evidence |
|---|---|---|
| Local full validation | PASS | `pnpm typecheck` (26 tasks), `pnpm lint` (14 tasks), `pnpm test` (8 files / 75 tests), `pnpm build` (14 tasks, Expo export) all pass |
| 3.1 checkpoint and CI | PASS | `c0f54f7`; CI `33539998678` completed/success; docs closure `33daf39` CI `33540448224` completed/success |
| Additive migration | PASS | `0002_lumpy_cardiac.sql` has enum + `ADD COLUMN` + indexes only; no drop/rename |
| Migration application | PASS | `drizzle-kit push --force` applied to local `mobile_saas_dev`; enum and indexes queried successfully |
| Schema drift | PASS | `pnpm --filter @repo/database db:generate` → `No schema changes, nothing to migrate` |
| Unit/API contract tests | PASS | security primitives, rate limiter, email seam, required procedure surface, paid-plan forge regression |
| Real PostgreSQL/tRPC flow | PASS | invitation create/accept, normalized identity, safe member list, capacity rejection, revoke/reuse rejection, wrong-email rejection, decline/reuse rejection, role update, admin transfer rejection, owner transfer, removal, audit actions, one-owner invariant |
| Real expiry persistence | PASS | expired accept request returned `invitation_expired` and persisted `status='expired'` + non-null `responded_at` |
| Email identity verification | PASS | accept/decline require `emailVerified` and normalized `ctx.user.email` match; no client email accepted |
| Invitation security | PASS | random 32-byte tokens, hash-only audit metadata, terminal states, request-time expiry, pending uniqueness, rate-limit seam |
| Organization isolation | PASS | membership + permission checked before every org-scoped list/revoke/member/role/remove/transfer operation |
| Bundle secret scan | PASS | no private DB/auth/billing/provider secret values in `apps/mobile/dist` (build output regenerated) |
| Regression | PASS | existing Phase 3.1 tests and all prior Phase 1/2 tests remain green; full suite is 8 files / 75 tests |

## DEFERRED

- Real Resend/SMTP adapter and email delivery: provider seam is safe no-op until credentials/provider configuration is supplied; API reports `not_configured` rather than claiming delivery.
- Distributed rate limiting: current implementation is explicitly process-local and must be replaced with Redis/Cloudflare for multi-replica production.
- Invitation code/join-code flow: rejected for this milestone; no plaintext secondary credential.
- Broad Phase 3.9 hardening, webhook HMAC/idempotency, and provider billing implementations.
- EAS native build and Maestro execution remain deferred by design.

## BLOCKED

None within Milestone 3.2 scope.

## FINAL CHECKPOINT

- Feature commit: pending at the time this draft was written.
- Documentation closure commit: pending.
- Phase 3.2 GitHub Actions run: pending.

The final closure patch must record the exact feature commit, closure commit, and GitHub Actions run with `completed / success` before this milestone is reported complete.
