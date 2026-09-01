# ADR-008 — Storage Architecture

- **Status:** Accepted
- **Date:** 2026-08-31
- **Context:** Mobile app must handle profile images, org logos, and user uploads without shipping storage secrets (§18).
- **Decision:** S3-compatible object storage (Cloudflare R2 primary) via server-only presigned PUT. The application uses `packages/storage/src/server.ts` through the `@repo/storage/server` subpath; mobile receives only a short-lived upload URL, required headers, safe key/reference, and expiry. File metadata is persisted in `files` through protected tRPC procedures, with HEAD confirmation before `ready`.
- **Scope:** Keys are server-generated and namespaced `org/<orgId>/<userId>/<cuid2>-<filename>` or `user/<userId>/<purpose>/<cuid2>-<filename>`. Organization writes require membership + existing `files.write`; personal files require exact user ownership. Private reads use short-lived signed GETs; no permanent public URL or provider credential is sent to the device.
- **Alternatives:** Direct S3 credentials in app, Supabase Storage only, or uploading through the API body.
- **Consequences:** R2 is the primary target; the same provider abstraction supports S3/MinIO-compatible endpoints. The current repository includes a not-configured provider and fake-provider seam; real external upload verification depends on server credentials. Scheduled orphan GC, virus scanning, transformations, and chunked uploads remain deferred.