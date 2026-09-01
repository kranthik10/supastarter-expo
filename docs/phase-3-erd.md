# Phase 3 — ERD (Product Layer)

> Delta to [`docs/erd.md`](./erd.md) and [`docs/phase-0-technical-decisions.md`](./phase-0-technical-decisions.md) §4.
> Additive only — the 16 tables at `5c1ceba` are not renamed or deleted. Phase 3.1 added `entitlements`; Phase 3.2 adds invitation lifecycle columns/indexes. New columns/tables are nullable or defaulted so existing migrations remain reversible. All IDs remain `text` (`cuid2`).

## Visual (Phase 3 — org-scoped SaaS)

```mermaid
erDiagram
  users ||--o{ accounts : has
  users ||--o{ sessions : has
  users ||--o{ organization_members : member_of
  users ||--o{ invitations : invites
  users ||--o{ devices : owns
  users ||--o{ push_tokens : owns
  users ||--o{ files : owns
  users ||--o{ notifications : receives
  users ||--o{ audit_logs : actors
  users ||--o{ user_preferences : has

  organizations ||--o{ organization_members : has
  organizations ||--o{ subscriptions : billed_as
  organizations ||--o{ entitlements : gated_by
  organizations ||--o{ invitations : has
  organizations ||--o{ files : scoped_to
  organizations ||--o{ audit_logs : scoped_to

  roles ||--o{ organization_members : assigned
  roles ||--o{ role_permissions : defines
  permissions ||--o{ role_permissions : granted

  plans ||--o{ subscriptions : defines
  subscriptions ||--o{ audit_logs : mutated_by

  devices ||--o{ push_tokens : registers
  files }o--|| organizations : scoped
  notifications }o--|| users : targeted
```

## Tables (diff)

### users (delta)

| col | change | notes |
|-----|--------|-------|
| image | unchanged and canonical | Existing Better Auth image/avatar reference; no duplicate `avatar_url` |
| deleted_at | **DEFERRED** | Soft-delete/grace lifecycle requires auth-aware sign-in/session changes not present in this milestone |
| updated_at | unchanged | |

### user_preferences (implemented in Milestone 3.3)

| col | type | constraints |
|-----|------|-------------|
| user_id | text | pk, fk users.id cascade |
| locale | enum `locale` | `en` \| `de`, default `en` |
| theme | enum `theme` | `system` \| `light` \| `dark`, default `system` |
| marketing_opt_in | boolean | default false |
| invite_emails | boolean | default true |
| billing_alerts | boolean | default true |
| quiet_hours_start | text nullable | strict `HH:MM`, paired with end |
| quiet_hours_end | text nullable | strict `HH:MM`, paired with start |
| updated_at | timestamptz | not null, default now() |

One row per user, `user_id` is PK. Rows are created lazily with safe defaults by `settings.getPreferences`; no destructive backfill.

### subscriptions (delta)

| col | change |
|-----|--------|
| trial_ends_at | ADD `timestamptz nullable` |
| grace_ends_at | ADD `timestamptz nullable` |
| cancel_at_period_end | ADD `boolean default false` |
| provider_status | ADD `text nullable` (raw provider status) |
| status | unchanged enum `subscription_status` |
| provider_subscription_id | unchanged |
| current_period_end | unchanged |

Constraints (app layer preferred, or PG check):

- `check (status='trialing' → trial_ends_at not null)`
- `check (grace_ends_at is null or grace_ends_at > created_at)`

### entitlements (new)

| col | type | constraints |
|-----|------|-------------|
| id | text | pk, cuid2 |
| organization_id | text | fk organizations.id cascade, indexed |
| feature | text | not null (e.g. `projects.limit`, `members.limit`, `storage.gb`, `ai.tokens`) |
| limit | integer nullable | null = unlimited |
| enabled | boolean | default true |
| created_at | timestamptz | not null, default now() |
| updated_at | timestamptz | not null, default now() |
| **unique** | | (organization_id, feature) |

Seeded per org from `plans` defaults; admin toggles override.

### invitations (delta)

| col | change | notes |
|-----|--------|-------|
| status | ADD `enum invitation_status` (`pending`,`accepted`,`revoked`,`expired`) default `pending` | Lifecycle beyond `expiresAt`; `revoked` with audit `reason=declined` represents an invited user's decline without adding a fifth enum value |
| responded_at | ADD `timestamptz nullable` | When accepted/revoked/expired |
| code | **NOT IMPLEMENTED** | Rejected in Milestone 3.2; the cryptographically random token/deep link is sufficient and avoids a second brute-force redemption path |
| token | unchanged unique; new tokens are 32 random bytes encoded as 64 hex chars | Existing tokens remain valid |
| role, email, organization_id, invited_by, expires_at | unchanged | |

Indexes:

- `unique(organization_id, email) where status='pending'` — at most one pending invite per normalized email per org (API trims/lowercases before lookup/insert).
- `index(invitations, organization_id)` for list/revoke operations.

### files (delta)

| col | change |
|-----|--------|
| status | ADD `enum file_status` (`pending`,`ready`,`deleted`) default `pending` |
| expires_at | ADD `timestamptz nullable` (orphan GC horizon, e.g. +1h) |
| updated_at | ADD `timestamptz not null default now()` |
| organization_id | unchanged nullable (null = user-private) |
| content_type, size | unchanged |

Constraints: `check (size is null or size <= 10485760)` (10 MB default — app may raise per entitlements `storage.gb`).

### push_tokens (delta)

| col | change |
|-----|--------|
| invalidated_at | ADD `timestamptz nullable` |
| token unique | unchanged |

### notifications (delta)

| col | change |
|-----|--------|
| category | ADD `text nullable` (`invite.received`, `billing.trial_ending`, …) |
| organization_id | ADD `text nullable fk organizations.id set null` (org-scoped fanout, nullable for system notices) |
| data | jsonb — now typed as `{ route?: string, orgId?: string }` |

### audit_logs (delta)

| col | change |
|-----|--------|
| idempotency_key | ADD `text nullable unique` |
| target_type, target_id, metadata | unchanged jsonb |

### No change (reaffirmed)

`accounts`, `sessions`, `organizations`, `organization_members`, `roles`, `permissions`, `role_permissions`, `plans`, `devices` — no column added/removed/renamed in Phase 3. Any future change to these requires an ADR update.

## Notes

- All new enums use `pgEnum` so Drizzle can generate reversible migrations; existing enums are not altered.
- All FKs use `onDelete: cascade` for owned data and `set null` for audit survival — unchanged.
- RLS is not enabled in V1; authorization is enforced in `packages/api` via `assertCan()` before any write — DB constraints are safety nets, not the policy engine.
- Any `text` FK that previously lacked an index gains one via Drizzle's `(t) => [index(...)]` when it becomes a hot path (e.g. `entitlements.organization_id`).

## Migrations

Generated by `pnpm --filter @repo/database db:generate` after editing `packages/database/src/schema.ts`. Reviewer checks:

- [ ] No `dropTable` / `dropColumn` for the original 16 tables
- [ ] All new columns are `nullable` or have `default` so existing rows migrate
- [ ] `drizzle/*.sql` is human-readable and matches this ERD delta
- [ ] CI runs `pnpm --filter @repo/database db:generate` followed by `git diff --exit-code -- packages/database/drizzle` as its drift detector.
