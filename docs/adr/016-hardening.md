# ADR-016 — Production hardening (rate limit + idempotency + webhook HMAC)

- **Status:** Proposed
- **Date:** 2026-09-01
- **Context:** Phase 2 Hono+tRPC has `protectedProcedure` + `assertCan()` but no rate limiting, idempotency, or webhook verification. Phase 3 monetization and invites need these before launch.
- **Decision:** (1) In-memory leaky-bucket per `(userId, procedure)` — e.g. `invitations.create` 5/min, `storage.createPresignedUrl` 20/min, webhooks 100/min; excess is `429 TOO_MANY_REQUESTS` with `Retry-After`; upgrade path to Redis/Cloudflare is ADR-016-conforming. (2) Idempotency via `audit_logs.idempotency_key unique` — every webhook event id and every mutation `Idempotency-Key` header is deduped in the transaction (insert or `200` dedup). (3) Stripe `constructEvent` with `STRIPE_WEBHOOK_SECRET` and RevenueCat constant-time HMAC at `/api/rest/webhooks/{stripe,revenuecat}` — fail-closed `401` before any write, `200` on replay. (4) DB partial uniques (`pending` invite per email per org, `entitlements(org,feature)`) as safety nets.
- **Alternatives:** No hardening (rejected — abuse, double-billing, replay), immediate Redis requirement (rejected — starter should boot without external services; bucket is swappable).
- **Consequences:** Every multi-write (`accept`, `transferOwnership`, webhook upsert) is `transaction + idempotency_key + audit_logs`; client TanStack Query retries only on `429`/`networkError` with backoff; no secret migrates to bundle.

