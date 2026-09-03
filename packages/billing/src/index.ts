export * from './plans';
export * from './provider';
export * from './subscription-view';
export type { Feature, PlanId as EntitlementPlanId, SubscriptionRow, SubscriptionStatus } from './entitlements';
export { PLAN_ENTITLEMENTS, ALL_FEATURES, isSubscriptionEntitled, resolveEntitlement } from './entitlements';

import { create } from 'zustand';

/**
 * Server-provided subscription snapshot for the active organization.
 * This store never grants plans locally: it only mirrors what the billing
 * API returned. Paid state changes exclusively through the payment provider
 * (checkout → webhook → server), never through client selection.
 */
export type ServerSubscriptionSnapshot = {
  planId: string;
  status: string;
} | null;

type BillingState = {
  subscription: ServerSubscriptionSnapshot;
  setSubscription: (subscription: NonNullable<ServerSubscriptionSnapshot>) => void;
  clearSubscription: () => void;
  hydrate: () => Promise<void>;
};

export const useBilling = create<BillingState>((set) => ({
  subscription: null,
  setSubscription: (subscription) => set({ subscription }),
  clearSubscription: () => set({ subscription: null }),
  hydrate: async () => {},
}));
