export * from './plans';
export * from './provider';
export type { Feature, PlanId as EntitlementPlanId, SubscriptionRow, SubscriptionStatus } from './entitlements';
export { PLAN_ENTITLEMENTS, ALL_FEATURES, isSubscriptionEntitled, resolveEntitlement } from './entitlements';

import { create } from 'zustand';
import type { PlanId } from './plans';

type BillingState = {
  plan: PlanId;
  setPlan: (plan: PlanId) => void;
  hydrate: () => Promise<void>;
};

export const useBilling = create<BillingState>((set) => ({
  plan: 'free',
  setPlan: (plan) => set({ plan }),
  hydrate: async () => {},
}));
