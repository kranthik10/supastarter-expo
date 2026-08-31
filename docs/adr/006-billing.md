# ADR-006 — Billing Architecture

- **Status:** Accepted
- **Date:** 2026-08-31
- **Context:** Starter must support B2C, B2B, or both without an App Store rejection (Guideline 3.1.1).
- **Decision:** `packages/billing` abstraction behind `getProducts/purchase/restore/getSubscription`. Backends: RevenueCat for StoreKit + Play Billing (mobile digital goods) and Stripe Checkout + Billing Portal for web/org seats. Webhooks at `/api/rest/webhooks/{stripe,revenuecat}` write to `subscriptions`. Enforcement is org-scoped and server-checked.
- **Alternatives:** Stripe-only (rejected by App Store for digital subs), raw StoreKit (no cross-platform entitlement).
- **Consequences:** Both IAP and web billing coexist; entitlement is `subscriptions` row per org; `billing.manage` gates checkout.
