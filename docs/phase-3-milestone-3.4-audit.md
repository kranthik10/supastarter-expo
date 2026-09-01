# Phase 3 Milestone 3.4 Audit

**Date:** 2026-09-01
**Baseline:** `48e0dd3` (Phase 3.3 final head)
**Scope:** Storage + File Management only
**Result:** PASS WITH WARNINGS — storage credentials/provider are not configured locally; real R2/S3 upload verification will remain deferred

## Baseline verification

- `main` is aligned with `origin/main` at `48e0dd3`.
- The only pre-existing untracked file is `.env.development`; it remains local and must not be staged.
- Phase 3.3 is present with user preferences, profile/security settings, TanStack Query wiring, and the final CI evidence recorded in its delivery document.
- Existing full validation at the baseline was 83 tests, typecheck/lint/build/database validation/bundle scan pass; EAS and Maestro remain deferred.

## Existing storage implementation

### `files` table

The actual table in `packages/database/src/schema.ts` has eight columns:

- `id text primary key`
- nullable `organization_id` FK to `organizations.id` with `ON DELETE CASCADE`
- required `user_id` FK to `users.id` with `ON DELETE CASCADE`
- unique required `key`
- required `url`
- nullable `content_type`
- nullable `size`
- required `created_at`

There is no `status`, `expires_at`, `updated_at`, `purpose`, or file-specific index. The nullable organization id already supports the intended organization/private split, and every file has a required creating user.

### Storage package and clients

- `packages/storage/src/storage.ts` is an AsyncStorage/SecureStore local key-value helper.
- `packages/storage/src/files.ts` is a legacy REST helper calling `POST /files/presign`, uploading directly to the returned URL, and returning `publicUrl`. It has no confirm step, no metadata row lifecycle, no authorization implementation, and no private download path.
- `apps/mobile/lib/storage/files.ts` duplicates the same legacy REST uploader against `/files/presign` and `/files/:key`.
- `packages/storage` currently depends on `@repo/api`, while the approved architecture expects server `@repo/api` to depend on storage. Server storage must not import the client API package. The local key-value helper will remain the package root export for existing organization-store usage; server provider/policy code will use subpath exports.
- No storage provider interface, R2/S3 SDK, presigned URL signer, object HEAD verifier, delete provider, or download signer exists.
- No storage tRPC procedures exist. Search found no implemented `storage.createUploadIntent`, `createPresignedUrl`, `confirmUpload`, `getDownloadUrl`, `listFiles`, or storage delete route.

### Configuration

`packages/config/src/env.ts` already separates private storage variables from public variables:

- R2: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, optional `R2_PUBLIC_BASE_URL`.
- S3-compatible: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, optional `S3_PUBLIC_BASE_URL`.

No storage secrets are exported through the public `config` object. The provider must validate a complete server configuration without printing values and return a stable not-configured result when absent. The local credential-presence check will report booleans only.

### Authorization and entitlements

- Existing permissions are `files.write` and `files.delete`.
- `owner` and `admin` have both; `member` has `files.write` only.
- Existing `storage.gb` is an entitlement. Current plan defaults are 5 GB free, 100 GB pro, and unlimited enterprise.
- Existing `assertCan()` and membership lookups are the server authorization boundary. No RLS is enabled.

### Avatar/profile

- Phase 3.3 established `users.image` as the canonical avatar reference; no `avatar_url` exists.
- The settings UI currently displays `users.image` and has no picker/upload control.
- `expo-image-picker` is not installed. No R2/S3 upload flow is present.
- The avatar must be a user-private file (`organization_id = null`, authenticated `user_id`) and must update `users.image` only after a confirmed ready file. A permanent public URL must not be invented for a private object.

### Architecture decisions

- Phase 0 selects Cloudflare R2 as the primary S3-compatible provider with presigned PUT and no device credentials.
- ADR-008 accepts the presigned storage architecture but describes a flow that is not implemented in the current repository.
- ADR-013 proposes org-scoped presign + confirm, MIME/size validation, `storage.gb`, pending lifecycle, and private-by-default downloads. It is still Proposed and will be updated/accepted only if the implementation introduces a material decision beyond the existing approved architecture.

## ERD reconciliation

| Proposal | Classification | Decision |
|---|---|---|
| `files.status` (`pending`, `ready`, `deleted`) | LEGITIMATE ADDITION | Add PostgreSQL enum and default `pending`; enforce lifecycle in API. |
| `files.expires_at` | LEGITIMATE ADDITION | Add nullable timestamp for pending reservation/orphan cleanup. |
| `files.updated_at` | LEGITIMATE ADDITION | Add safe default `now()` for lifecycle changes. |
| `files.purpose` | REJECT | Not required; avatar keys use a server-controlled `avatar` namespace and ownership is sufficient for V1. |
| `files.organization_id` nullable | MATCH | Existing schema already models org-scoped vs personal files. |
| `files.user_id` required | MATCH | Existing creator ownership is sufficient. |
| `files.content_type` / `size` | MATCH | Existing columns are retained; API will require validated values for new uploads. |
| `files.url` required | LEGITIMATE CORRECTION | Preserve the column for compatibility but store a provider reference/object URI, not a globally public URL for private files. Private reads use short-lived provider URLs. |
| Files user/org/status hot-path indexes | LEGITIMATE ADDITION | Add user, organization, and status indexes only where missing; avoid redundant key uniqueness. |
| `file_status` enum | LEGITIMATE ADDITION | Central DB lifecycle values; no free-form client status. |
| MIME allowlist | LEGITIMATE ADDITION | Central server policy for JPEG/PNG/WebP/PDF; client MIME is not authoritative. |
| 10 MB per-file cap | LEGITIMATE ADDITION | Central server constant; new intent requires `size > 0 && size <= 10 MiB`. |
| Presigned PUT | LEGITIMATE ADDITION | Server-only provider signer; mobile receives URL/reference/expiry only. |
| Confirm via HEAD | LEGITIMATE ADDITION | Provider verifies object existence, size, and content type before `ready`. |
| Private presigned GET | LEGITIMATE ADDITION | No permanent public URL is exposed by default. |
| Orphan cleanup service | LEGITIMATE ADDITION | Pure/service function identifies expired pending rows and deletes provider objects safely. |
| Scheduled orphan cleanup | DEFER | No cron/worker exists; no scheduled GC claim. |
| R2/S3 credentials in mobile | REJECT | Violates the storage security invariant. |
| Direct Hono upload body | REJECT | Conflicts with approved presigned architecture and causes unnecessary egress. |
| R2/S3 provider SDK calls in API/mobile | REJECT | Calls belong behind `@repo/storage/server`. |
| New storage permission | REJECT | Existing `files.write`/`files.delete` are sufficient. |
| Broad file manager/list UI | DEFER | V1 exposes storage primitives and minimal file metadata, not a Dropbox-like product. |
| Virus scanning/content transformation | DEFER | Out of scope. HEAD metadata checks are the V1 integrity boundary. |

## Smallest legitimate schema delta

Additive migration only:

1. PostgreSQL enum `file_status` with `pending`, `ready`, `deleted`.
2. `files.status` non-null with safe default `pending`.
3. `files.expires_at` nullable.
4. `files.updated_at` non-null default `now()`.
5. Indexes for `files.user_id`, `files.organization_id`, and `files.status` if not already present.

No column/table rename or drop. No `purpose` column is needed for V1. The existing required `url` column remains for compatibility; private object references are not treated as public URLs.

## Storage provider decision

Implement a `StorageProvider` interface behind `@repo/storage/server` with:

- `createPresignedUpload`
- `headObject`
- `deleteObject`
- `createPresignedDownload`

Provide:

- `NotConfiguredStorageProvider` with stable `STORAGE_NOT_CONFIGURED` errors.
- `S3CompatibleStorageProvider` using the AWS S3 client/presigner and the existing R2/S3 private environment names.
- `createStorageProvider()` selecting R2/S3 only when a complete server configuration is present; no credentials in shared/public config or mobile imports.

The API imports only the provider subpath and policy helpers. Existing mobile local storage remains available from the package root without importing server provider code.

## API and lifecycle design

### `storage.createUploadIntent`

Protected procedure. Inputs:

- optional `organizationId`
- sanitized filename input
- MIME type
- positive size
- optional `avatar` purpose marker only as a validated operation input, not persisted as a new column

Server behavior:

1. Derive user id from `ctx.user.id`; reject client user id, key, bucket, URL, or public URL.
2. For organization uploads, load membership and require `files.write`.
3. For private uploads, force `organization_id = null` and user ownership.
4. Validate MIME and size using centralized policy.
5. Calculate used bytes from non-deleted `ready` files plus non-expired `pending` reservations for the same organization. For personal files, no organization entitlement is applied unless the future policy adds one.
6. Require `storage.gb` for org uploads; reject over-quota requests with `PRECONDITION_FAILED` / `storage_limit_reached`.
7. Insert a pending metadata row with server-generated namespaced key and expiry before signing.
8. Return only `fileId`, `uploadUrl`, opaque key/reference, required headers, and expiry. Provider credentials never leave the server.

Key format is server-generated and sanitized:

- org: `org/<orgId>/<userId>/<cuid2>-<safe-name>`
- personal: `user/<userId>/<cuid2>-<safe-name>`
- avatar: `user/<userId>/avatar/<cuid2>-<safe-name>`

### `storage.confirmUpload`

Protected procedure. Loads metadata by id, verifies ownership/scope, requires `pending` and unexpired state, calls provider HEAD, verifies object length/content type, then updates to `ready` with `updated_at`. Client input cannot set `ready`, size, content type, or URL. Missing/mismatched objects fail closed.

### `storage.getDownloadUrl`

Protected procedure. Loads ready metadata, authorizes the same private/org scope, and returns a short-lived provider-signed GET URL. It never accepts arbitrary keys and never returns a permanent public URL for private storage.

### `storage.deleteFile`

Protected procedure. Loads metadata, verifies personal ownership or org membership + `files.delete`, calls remote delete, and only then marks metadata `deleted`. Remote failure does not report success. Deleting a pending row is allowed only when the caller owns/controls it; deleting a ready row is audited for organization files.

### Orphan service

Implement `identifyExpiredPendingFiles` and `cleanupExpiredFiles` as server functions. They operate on `pending` rows with `expires_at < now`, attempt provider deletion, then mark successful rows `deleted`; provider failures remain observable for a later retry. No scheduler is wired in this milestone.

## Quota/concurrency policy

Pending rows reserve the requested size. Usage is:

```text
non-deleted ready bytes + non-expired pending bytes + requested bytes
```

The API performs the entitlement/insert in one database transaction and locks the organization’s relevant file rows before calculating usage so two concurrent intent requests cannot both pass a stale ready-only sum. Expired pending rows stop counting. Deleted rows do not count.

Enterprise `storage.gb = null` is unlimited. Free/pro limits are interpreted as GiB (`limit * 1024 * 1024 * 1024`).

## Avatar decision

Use approach B: private user-owned avatar object plus short-lived signed retrieval. The profile stores an opaque provider-independent file reference in the existing `users.image` field only after:

```text
createUploadIntent(purpose=avatar)
→ direct PUT
→ confirmUpload(fileId)
→ settings.updateProfile({ image: safe avatar reference })
```

Because `users.image` currently renders as an image source, the mobile client will use `getDownloadUrl` for a ready avatar reference when the reference is a private storage key. Existing external HTTPS images remain supported. Replacement cleanup is limited to prior avatar references that match the server-controlled user avatar namespace; arbitrary external URLs are never deleted.

The smallest official Expo dependency for selecting an image is `expo-image-picker`; it is not currently installed and will be added only if the final implementation uses the native picker. Client checks are UX only; server MIME/size/HEAD checks remain authoritative.

## Security requirements

- Provider secrets remain private server environment variables; no storage SDK/secret import reaches mobile.
- No presigned URL, signature, token, bucket credential, or secret is logged or persisted in audit metadata.
- All file procedures derive user id from the authenticated context.
- Org actions require membership + existing `files.write`/`files.delete` permission.
- Personal files require exact `file.user_id == ctx.user.id` and no organization id.
- File id/key knowledge alone never grants access.
- The API never trusts client status, URL, key, MIME, or uploaded flag as final authority.
- `files.url` is not treated as a public URL for private rows.
- No R2/S3 credentials will be fabricated; real provider upload is deferred if the local provider is not configured.

## Implementation/testing plan

Follow vertical TDD slices:

1. Write policy tests for MIME, size, filename/key sanitization, storage usage/reservation, and lifecycle decisions; verify red.
2. Add provider interface/fake/not-configured provider and make tests green.
3. Add additive schema/migration and real PostgreSQL lifecycle/quota probes.
4. Add protected router procedures and cross-user/cross-org/permission tests.
5. Add mobile thin upload client and image picker only after the server path is verified.
6. Integrate private avatar confirmation and profile reference update.
7. Run full validation, schema drift/destructive scans, provider-secret bundle scan, and Phase 3.1–3.3 regression checks.

Required tests include:

- allowed/disallowed MIME, size boundaries, zero size, filename traversal/control characters;
- pending reservation, exact quota, over-quota, unlimited entitlement, deleted/expired semantics, concurrent intent policy;
- personal and organization authorization/IDOR cases;
- create → pending, confirm existing/missing/mismatched/expired, ready → deleted, terminal-state rejection;
- fake provider presign/HEAD/delete/download and not-configured behavior;
- avatar ownership, confirmed-ready requirement, private reference update, and replacement cleanup scope.

## Risks and deferred items

| Risk | Mitigation |
|---|---|
| No local R2/S3 credentials | Fake provider and not-configured provider; report real upload separately as deferred. |
| Existing URL column suggests public files | Preserve it as compatibility reference; private download procedure uses signed GET and docs state the limitation. |
| Concurrent quota races | Count pending reservations and lock relevant file rows in the intent transaction. |
| Legacy client helpers target nonexistent REST routes | Replace the active storage surface with typed tRPC flow; do not expose provider code in mobile. |
| Existing `packages/storage → @repo/api` dependency | Move server imports to a storage subpath and retain local helper root export to keep the dependency graph acyclic. |
| Avatar replacement cleanup | Delete only prior server-controlled avatar namespace references; never guess/delete arbitrary external URLs. |
| No background scheduler | Provide cleanup service and document scheduled GC as deferred. |
| V1 does not sniff bytes or scan malware | Verify HEAD metadata; deep content/virus scanning is explicitly deferred. |

## Audit conclusion

Proceed with the additive lifecycle/metadata migration, server-only S3-compatible provider abstraction plus stub/fake seams, protected tRPC primitives, pending quota reservations, private signed downloads, cleanup service, and a minimal private avatar flow using the existing `users.image` field. Do not implement Notifications, analytics, monitoring, full file management, EAS, or Maestro.
