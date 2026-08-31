# ADR-008 — Storage Architecture

- **Status:** Accepted
- **Date:** 2026-08-31
- **Context:** Mobile app must handle profile images, org logos, and user uploads without shipping storage secrets (§18).
- **Decision:** S3-compatible object storage (Cloudflare R2 primary) via presigned PUT. Flow: Expo picks file → `POST /trpc/files.presign` returns `{ uploadUrl, key, publicUrl }` → `PUT uploadUrl` raw bytes → row in `files`. Keys namespaced `org/<orgId>/<userId>/<cuid2>-<filename>`. No permanent creds on device.
- **Alternatives:** Direct S3 credentials in app, Supabase Storage only.
- **Consequences:** R2 chosen for egress cost; same API as S3/MinIO so provider is swappable; already implemented as `lib/storage/files.ts`.
