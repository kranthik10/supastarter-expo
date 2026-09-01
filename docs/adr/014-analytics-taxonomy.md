# ADR-014 — Analytics taxonomy + identity lifecycle

- **Status:** Proposed
- **Date:** 2026-09-01
- **Context:** `packages/analytics` already abstracts PostHog behind `track/screen/identify/reset`; screens must not scatter direct provider calls. Phase 3 must define event naming and identity so SaaS funnels are consistent.
- **Decision:** Lower-snake `verb_subject` taxonomy (`auth.signed_in`, `org.created`, `invitation.accepted`, `billing.checkout_completed`, …) with declared props (`user_id` hash, `organization_id`, `plan`, `role`, `platform`, `app_variant`). `identify` is called on `signed_in/up` and after `organizationId` is known; `screen` mirrors each route group; `reset` on sign-out. Dev provider is console no-op when `EXPO_PUBLIC_POSTHOG_KEY` is absent; no raw `email`/`token` in props.
- **Alternatives:** Per-feature ad-hoc events (rejected — unqueryable), vendor-locked analytics in screens (rejected — violates seam).
- **Consequences:** All flows in §17 emit typed events; PostHog can be swapped via `setAnalyticsProvider()` without touching screens; PII never leaves as raw email.

