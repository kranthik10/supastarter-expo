# Phase 3 Milestone 3.4 Delivery — Storage + File Management

**Status:** IMPLEMENTED locally; ready for commit and CI verification
**Baseline:** `48e0dd3`
**Scope:** Storage primitives, private file lifecycle, quota enforcement, and avatar upload only

## Recovery record

- **Initial final integration probe:** BLOCKED.
- **Initial error:** `Error: profile avatar id mismatch` at `/tmp/phase-3-4-check.ts` line 123.
- **Cause:** The final assertion used the original `owner` tRPC caller, whose `ctx.user.image` was a pre-avatar-update snapshot. The production `createContext` reloads the user row per request; the isolated `createCaller` fixture does not.
- **Correction:** The probe now reads the authoritative `users` row after avatar confirmation and constructs `updatedOwnerCaller` with the current user/image before calling `settings.getProfile()` and `storage.getDownloadUrl()`.
- **Recovery probe:** PASS.
- **Recovery output:** `{"ok":true,"lifecycle":true,"privateDownload":true,"orgIsolation":true,"privateIsolation":true,"rbac":true,"quota":true,"orphanCleanup":true,"avatar":true}`.
- No production code was changed for this recovery defect.

## Status matrix

| Capability | Status | Evidence / boundary |
|---|---|---|
| Storage abstraction | IMPLEMENTED / VERIFIED | `StorageProvider` interface, S3-compatible adapter, not-configured provider, and injectable fake provider. |
| R2/S3 provider | IMPLEMENTED / PARTIAL | AWS S3-compatible R2/S3 adapter is implemented and typechecked; local credentials are unavailable, so no external object-store request was made. |
| Not-configured behavior | IMPLEMENTED / VERIFIED | Stable `STORAGE_NOT_CONFIGURED` provider error and API mapping; focused provider tests pass. |
| Presigned PUT | IMPLEMENTED / VERIFIED | `storage.createUploadIntent`; fake provider returns short-lived URL and required content-type header. |
| Upload confirmation | IMPLEMENTED / VERIFIED | `storage.confirmUpload` performs provider HEAD and exact size/content-type verification before `ready`. |
| Private download | IMPLEMENTED / VERIFIED | `storage.getDownloadUrl` authorizes scope and returns a 5-minute signed GET; no permanent public URL. |
| File metadata | IMPLEMENTED / VERIFIED | Existing `files` row retained with server-owned key/reference, MIME, size, lifecycle timestamps, and status. |
| File lifecycle | IMPLEMENTED / VERIFIED | `pending → ready → deleted`; terminal and expired states are rejected appropriately. |
| MIME validation | IMPLEMENTED / VERIFIED | Central allowlist: JPEG, PNG, WebP, PDF. Client MIME is not final authority. |
| File-size validation | IMPLEMENTED / VERIFIED | Positive integer, maximum 10 MiB, centralized policy. |
| `storage.gb` enforcement | IMPLEMENTED / VERIFIED | Organization upload reservations use effective entitlement; over-quota returns `storage_limit_reached`. Free/pro/enterprise defaults remain 5/100/unlimited GiB. |
| Pending quota reservation | IMPLEMENTED / VERIFIED | Ready bytes + non-expired pending bytes + requested size; organization-row lock serializes first reservations and file-row locks protect existing rows. |
| Organization isolation | IMPLEMENTED / VERIFIED | Organization files require membership and existing `files.write`, `organization.read`, or `files.delete` permissions. |
| User-private isolation | IMPLEMENTED / VERIFIED | Personal files force `organization_id = null` and exact `file.user_id == ctx.user.id`. |
| Safe key generation | IMPLEMENTED / VERIFIED | Server-generated cuid2 namespaced keys; traversal, separators, controls, and unsafe filename characters are sanitized. |
| Deletion | IMPLEMENTED / VERIFIED | Remote delete succeeds before metadata becomes `deleted`; provider failure does not report success. Organization deletion is audited without URLs/signatures. |
| Orphan cleanup service | IMPLEMENTED / VERIFIED | `identifyExpiredPendingFiles` and `cleanupExpiredFiles` delete expired pending objects and mark successful rows deleted. |
| Scheduled orphan cleanup | DEFERRED | No cron/worker infrastructure exists; service is callable but not scheduled. |
| Avatar upload | IMPLEMENTED / VERIFIED | Expo ImagePicker → personal avatar intent → direct PUT → HEAD confirmation → `users.image` update. Fake-provider probe passed. |
| Canonical avatar field | IMPLEMENTED / VERIFIED | `users.image`; no `avatar_url` or `purpose` column added. |
| Avatar replacement cleanup | IMPLEMENTED / VERIFIED | Prior server-controlled `user/<id>/avatar/` object is deleted and metadata marked deleted; arbitrary external URLs are never guessed/deleted. |
| Real R2/S3 upload | DEFERRED | Local environment has bucket/endpoint values but no access/secret credentials; no real provider success is claimed. |
| Deep content sniffing/virus scanning | DEFERRED | HEAD metadata checks only in V1. |
| Image transforms/CDN/multipart | DEFERRED | Out of scope. |

## Schema and migration

### Migration

`packages/database/drizzle/0004_real_boomerang.sql`

Adds:

- PostgreSQL enum `file_status`: `pending`, `ready`, `deleted`.
- `files.status` non-null with default `pending`.
- Nullable `files.expires_at`.
- Non-null `files.updated_at` with default `now()`.
- `files_user_idx`, `files_org_idx`, and `files_status_idx`.

Existing `files.organization_id`, required `files.user_id`, `content_type`, `size`, unique `key`, and required `url` remain unchanged. For new private files, `url` stores the opaque object key/reference for compatibility; private reads use signed GETs.

### Safety verification

- Migration generated and applied to local `mobile_saas_dev`.
- Live readback: `files` has 11 columns, `file_status` status default, all three new indexes, and zero pending rows after fixture cleanup.
- `pnpm --filter @repo/database db:generate` after application: `No schema changes, nothing to migrate`.
- No `DROP TABLE`, `DROP COLUMN`, destructive rename, unsafe non-null addition, or unintended type change.

## Provider boundary

- Server-only provider code lives at `packages/storage/src/server.ts` and is imported by API through `@repo/storage/server`.
- `packages/storage` no longer depends on `@repo/api`; its root export remains local storage plus provider-neutral client PUT helpers. This preserves the approved dependency direction: API → storage.
- The AWS S3 SDK and presigner are not imported by mobile code. Mobile imports only pure policy/client helpers and the tRPC transport.
- R2/S3 credentials are read only by the server provider factory. No provider secret, bucket credential, signature, or administrative API is returned to the client.
- Complete local provider configuration was not available: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY` were absent; `R2_BUCKET` and `R2_ENDPOINT` were present. No values were printed.

## API surface

### `storage.createUploadIntent`

Protected. Accepts optional `organizationId`, filename, MIME, size, and validated avatar purpose. It rejects client keys, bucket names, URLs, user ids, and status. Organization requests re-check membership/`files.write`, entitlement, and quota inside a transaction. It creates a pending row before requesting a 10-minute presigned PUT and returns only file id, key, URL, required headers, and expiry.

### `storage.confirmUpload`

Protected. Loads metadata and verifies personal/org scope, pending/unexpired state, and avatar namespace when applicable. Provider HEAD must report matching object existence, size, and content type. Only then is the row marked ready; avatar confirmation also updates the authenticated user's `users.image` to the opaque key.

### `storage.getDownloadUrl`

Protected. Loads a ready row, verifies personal ownership or organization membership + `organization.read`, and returns a 5-minute signed GET URL. Arbitrary keys and permanent public URLs are not accepted.

### `storage.listFiles`

Protected metadata listing for either an authorized organization or the authenticated user's personal files. Deleted rows and other users' private files are excluded.

### `storage.deleteFile`

Protected. Verifies scope/permission, deletes the remote object, then marks the row deleted. It never accepts a client-controlled key or status and does not report success when remote deletion fails.

## Mobile integration

- Added `expo-image-picker` `~57.0.2`/resolved SDK-57 patch and config plugin.
- Settings now requests media permission only when the user selects “Change photo”.
- Local UX checks MIME/size, then the server remains authoritative.
- Upload helper performs local blob read, tRPC intent, direct PUT, and tRPC confirmation.
- Profile display uses the server-returned `avatarFileId` and signed download URL for private avatar keys; existing external HTTPS images remain supported.
- TanStack Query owns profile/avatar/settings cache invalidation; existing Zustand/settings state remains the immediate theme/locale rendering mirror.
- No R2/AWS SDK or private environment variable is imported in mobile.

## Tests and validation

### Focused provider/storage tests

- Provider/policy/API/avatar focused suites: **15 PASS**.
- Explicit Phase 3.1–3.3 + storage regression selection: **92 PASS across 10 files**.
- Full suite: **98 PASS across 13 files**.

### Real local integration

`DATABASE_URL=[REDACTED] pnpm exec tsx /tmp/phase-3-4-check.ts` — PASS against local PostgreSQL with fake storage provider. Verified lifecycle, HEAD mismatch/missing behavior, private signed download, org/private IDOR boundaries, RBAC deletion, quota rejection, pending cleanup, avatar persistence/replacement, and profile-derived signed avatar retrieval.

### Canonical validation

- `pnpm typecheck` — PASS, 26 tasks.
- `pnpm lint` — PASS, 14 tasks.
- `pnpm test` — PASS, 98 tests across 13 files.
- `pnpm build` — PASS, Expo export completed for iOS, Android, and web. This is not an EAS native build.
- `pnpm --filter @repo/database db:generate` — PASS, no schema drift.
- `git diff --check` — PASS.
- Migration destructive-operation scan — PASS, zero matches.
- Mobile bundle secret scan — PASS, zero matches for `DATABASE_URL`, `BETTER_AUTH_SECRET`, `STRIPE_SECRET`, `REVENUECAT_SECRET`, `RESEND_API_KEY`, `R2_SECRET`, `R2_SECRET_ACCESS_KEY`, and `AWS_SECRET_ACCESS_KEY`.

## Regression coverage

- Phase 3.1 billing/entitlements and `storage.gb` resolution remain covered and pass.
- Phase 3.2 team, invitations, ownership transfer, `members.limit`, and RBAC remain covered and pass.
- Phase 3.3 profile/preferences/password/session/account-deletion safeguards remain covered and pass.
- No Phase 3.5 notification runtime, push token registration, analytics, monitoring, EAS, or Maestro work was added.

## Deferred items

- Real external R2/S3 upload: DEFERRED until server credentials are configured.
- Scheduled orphan cleanup: DEFERRED until scheduler/worker infrastructure exists.
- Virus scanning, deep content sniffing, transformations/CDN, multipart/chunked upload: DEFERRED.
- Phase 3.5 notifications and all later milestones: DEFERRED.
- EAS native builds and Maestro: DEFERRED.

## Checkpoint

- Implementation commit: `534d9a7` — `feat: complete phase 3.4 storage`.
- Implementation GitHub Actions run: `33560147578` — completed successfully for head `534d9a7`.
- Documentation closure commit: `19c3466` — `docs: close phase 3.4 storage delivery`.
- Documentation-head GitHub Actions run: `33562014816` — completed successfully for head `19c3466`.
