# ADR-013 — Storage hardening (scoped presign + confirm)

- **Status:** Proposed
- **Date:** 2026-09-01
- **Context:** Phase 0 ADR-008 chose R2/S3 presigned PUT so no secret reaches the bundle. Phase 3 must make the flow org-scoped and abuse-resistant.
- **Decision:** `trpc.storage.createPresignedUrl` validates membership + `assertCan(files.write)` + MIME allowlist + size limits (10 MB default, gated by `entitlements.storage.gb`), inserts `files` row `status='pending'` with `key=org/<orgId>/<cuid2>-<sanitized>`, signs PUT (5–15m expiry) and returns `{ uploadUrl, key }`. Mobile PUTs to `uploadUrl`; `trpc.storage.confirmUpload` HEAD-verifies and sets `status='ready'` + public URL; orphans (`pending` + `expiresAt`) are GC'd. Private-by-default; presigned GET is generated server-side when needed.
- **Alternatives:** Direct S3 creds in app (rejected — credential leak, bundle grep fails), upload through Hono body (rejected — doubles egress, no chunking).
- **Consequences:** Server is the only signer; `files.organizationId` null means user-private; `files.delete` requires `assertCan(files.delete)`; no provider SDK in screens.

