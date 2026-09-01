export type Feature = 'projects.limit' | 'members.limit' | 'storage.gb' | 'ai.tokens';

export type PlanId = 'free' | 'pro' | 'enterprise';

export const ALL_FEATURES: Feature[] = ['projects.limit', 'members.limit', 'storage.gb', 'ai.tokens'];

/**
 * Default entitlements per plan. `limit: null` means unlimited.
 * Central so adding a feature only touches this map; no API procedure changes.
 */
export const PLAN_ENTITLEMENTS: Record<PlanId, { feature: Feature; limit: number | null; enabled: boolean }[]> = {
  free: [
    { feature: 'projects.limit', limit: 3, enabled: true },
    { feature: 'members.limit', limit: 2, enabled: true },
    { feature: 'storage.gb', limit: 5, enabled: true },
    { feature: 'ai.tokens', limit: 1_000, enabled: true },
  ],
  pro: [
    { feature: 'projects.limit', limit: 50, enabled: true },
    { feature: 'members.limit', limit: 25, enabled: true },
    { feature: 'storage.gb', limit: 100, enabled: true },
    { feature: 'ai.tokens', limit: 100_000, enabled: true },
  ],
  enterprise: [
    { feature: 'projects.limit', limit: null, enabled: true },
    { feature: 'members.limit', limit: null, enabled: true },
    { feature: 'storage.gb', limit: null, enabled: true },
    { feature: 'ai.tokens', limit: null, enabled: true },
  ],
};

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';
export type SubscriptionRow = {
  status: SubscriptionStatus;
  trialEndsAt?: Date | string | null;
  graceEndsAt?: Date | string | null;
  currentPeriodEnd?: Date | string | null;
  cancelAtPeriodEnd?: boolean | null;
  planId?: string | null;
};

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  return v instanceof Date ? v : new Date(v);
}

/**
 * Whether a subscription grants entitlements right now.
 * trialing → trialEndsAt > now
 * active → true (cancelAtPeriodEnd doesn't cut early)
 * past_due → within graceEndsAt
 * canceled/incomplete → false
 */
export function isSubscriptionEntitled(sub: SubscriptionRow | null | undefined, now = new Date()): boolean {
  if (!sub) return false;
  const status = sub.status;
  if (status === 'active') return true;
  if (status === 'trialing') {
    const t = toDate(sub.trialEndsAt);
    return t ? t > now : false;
  }
  if (status === 'past_due') {
    const g = toDate(sub.graceEndsAt);
    return g ? g > now : false;
  }
  return false;
}

/**
 * Pure resolver — no DB. Takes a plan default and an optional per-org override row.
 * If row exists, it wins; otherwise plan default. Null entitlements mean unlimited.
 */
export function resolveEntitlement(input: {
  feature: Feature;
  planId: PlanId;
  row?: { limit: number | null; enabled: boolean } | null;
  subscription?: SubscriptionRow | null;
  now?: Date;
}): { feature: Feature; enabled: boolean; limit: number | null; planId: PlanId } {
  const planDefaults = PLAN_ENTITLEMENTS[input.planId] ?? PLAN_ENTITLEMENTS.free;
  const def = planDefaults.find((e) => e.feature === input.feature);
  const baseLimit = def?.limit ?? null;
  const baseEnabled = def?.enabled ?? false;

  const effective = input.row ? { limit: input.row.limit, enabled: input.row.enabled } : { limit: baseLimit, enabled: baseEnabled };

  if (input.subscription && !isSubscriptionEntitled(input.subscription, input.now)) {
    return { feature: input.feature, enabled: false, limit: effective.limit, planId: input.planId };
  }

  return { feature: input.feature, enabled: effective.enabled, limit: effective.limit, planId: input.planId };
}
