# Phase 4.4 — Subscription + Upgrade UX Delivery

**Historical implementation baseline:** `37d74a29719d8023fb5727f3271edc6809a0d9b6`
**Milestone:** 4.4 Truthful provider-deferred Subscription + Upgrade UX
**Local result:** PASS WITH RELEASE GATE (payment provider unconfigured)
**Schema or migration change:** No

## IMPLEMENTED

### Server subscription as the only plan truth
- Added `resolveBillingView` to `@repo/billing`: resolves a server subscription row to `{ planId, status, entitled, providerAction }`. Fail-closed: no row, non-entitled status, expired trial/grace, or unknown plan id all render the free plan with no entitlement. Local plan selection is never presented as a subscription.
- The billing screen queries `trpc.billing.getSubscription` for the active organization and derives the current plan exclusively from that row (mirroring the fail-closed resolved view into the store, never the raw row).

### Provider-deferred upgrade
- Paid-plan buttons attempt `getBillingProvider().createCheckout({ organizationId, planId })` and open the returned provider URL in the system browser. While the stub provider is active it throws, and the screen shows a truthful "payments not configured" alert instead of granting anything locally.
- Downgrade/success alerts that claimed local plan changes (`upgradeSuccess`, `downgradeSuccess`) are removed from both locales; the portal card no longer implies Stripe/Polar/Lemon Squeezy availability and states plan changes never apply locally.

### Removed lie vectors and dead code
- Removed `setPlan` from the `@repo/billing` store; replaced with `setSubscription` / `clearSubscription` operating only on server snapshots.
- Deleted the unreferenced local `apps/mobile/lib/billing/` store and plans duplicate (no imports anywhere; the stale `lib/billing.ts` portal copy is gone with it).

### Billing screen states
- No organization, loading, load error with retry, and per-plan current badges. Paid-plan buttons are provider checkout attempts; the free plan carries no checkout action (downgrades are provider-managed per the portal note).

## VERIFIED

| Check | Result | Evidence |
| --- | --- | --- |
| Focused billing tests | PASS | `subscription-view.test.ts` (6 tests: null/active/fail-closed/trial/grace/unknown-plan/mirror) |
| Typecheck | PASS | `pnpm typecheck` — 28/28 Turbo tasks |
| Lint | PASS | `pnpm lint` — 15/15 Turbo tasks |
| Full tests | PASS | `pnpm test` — 37 files, 197 tests |
| Build | PASS | `pnpm build` — 15/15 Turbo tasks |
| Migration/drift | PASS | `pnpm db:generate` — no schema changes, nothing to migrate |

## SECURITY DECISIONS

- Server `updateSubscription` remains fail-closed (`subscription_state_provider_only`); the client has no path to paid state except the provider checkout seam.
- Unknown plan ids from the server row fail closed to free rather than rendering untrusted values.
- No provider SDKs, secrets, or price ids in the mobile bundle; the stub provider carries none.
- Subscription reads stay organization-scoped (`billing.read` enforced server-side); the screen queries only the active org.

## DEFERRED (RELEASE GATE)

- A real billing provider (Stripe/RevenueCat), server checkout session creation, webhook verification, and portal URL — the checkout button truthfully reports "not configured" until then.
- Native-device validation of the checkout browser flow.
