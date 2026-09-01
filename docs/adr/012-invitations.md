# ADR-012 — Invitations lifecycle + ownership transfer

- **Status:** Proposed
- **Date:** 2026-09-01
- **Context:** Existing `invitations` table has `token` + `expiresAt` but no lifecycle state; `organizationMembers` is the source of truth, and `owner` is a singleton per org. Phase 3 must support create/accept/revoke/expire plus ownership transfer without introducing a new role.
- **Decision:** Add `invitations.status enum(pending,accepted,revoked,expired)` + `respondedAt` + optional 6-char `code unique`. One pending invite per `(organization_id,email)` via partial unique index. `POST /trpc/invitations.*` is server-enforced via `assertCan(members.invite)`; `accept` consumes the token and inserts `organizationMembers` in a transaction. `organizations.transferOwnership` is `owner`-only, atomically swaps `owner→admin` and `member→owner` and writes `audit_logs`.
- **Alternatives:** Custom roles (rejected — `owner/admin/member` + existing matrix suffices), separate `membership_requests` table (rejected — invite is sufficient for starter).
- **Consequences:** `members.update` remains `owner`-only; transfer is the only owner-mutation path; every lifecycle transition writes `audit_logs` with token hash.

