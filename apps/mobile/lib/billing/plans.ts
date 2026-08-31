export type PlanId = 'free' | 'pro' | 'enterprise';

export type Plan = {
  id: PlanId;
  price: number;
  seats: number;
  highlight?: boolean;
};

/**
 * Central plan configuration. To enable real payments:
 * 1. Pick a provider (Stripe, Polar, Lemon Squeezy, …) and add its SDK.
 * 2. Implement `startCheckout` and `openBillingPortal` with the provider's
 *    mobile flow (e.g. Stripe Billing portal via expo-web-browser).
 * The rest of the app reads plans from here only.
 */
export const plans: Record<PlanId, Plan> = {
  free: { id: 'free', price: 0, seats: 1 },
  pro: { id: 'pro', price: 19, seats: 10, highlight: true },
  enterprise: { id: 'enterprise', price: 99, seats: 100 },
};

export const planOrder: PlanId[] = ['free', 'pro', 'enterprise'];
