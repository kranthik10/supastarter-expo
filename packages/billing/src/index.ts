export * from './plans';
import { create } from 'zustand';
import { storage } from '@repo/storage';
import type { PlanId } from './plans';

type BillingState = {
  plan: PlanId;
  setPlan: (plan: PlanId) => void;
  hydrate: () => Promise<void>;
};

const KEY = 'billing.v1';

export const useBilling = create<BillingState>((set) => ({
  plan: 'free',
  setPlan: (plan) => {
    set({ plan });
    void storage.set(KEY, plan);
  },
  hydrate: async () => {
    try {
      const raw = await storage.get(KEY);
      if (raw === 'free' || raw === 'pro' || raw === 'enterprise') set({ plan: raw });
    } catch {}
  },
}));
