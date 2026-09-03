import { isSubscriptionEntitled, type PlanId, type SubscriptionRow, type SubscriptionStatus } from './entitlements';
import { plans } from './plans';

export type BillingViewStatus = 'none' | SubscriptionStatus;

export type BillingSubscriptionView = {
  /** Effective plan: the server plan while entitled, otherwise free. Never an untrusted value. */
  planId: PlanId;
  status: BillingViewStatus;
  entitled: boolean;
  /** Provider-deferred next action: checkout starts payment, manage opens the provider portal. */
  providerAction: 'checkout' | 'manage';
};

function isKnownPlan(planId: unknown): planId is PlanId {
  return typeof planId === 'string' && planId in plans;
}

/**
 * Resolves server subscription state to billing UX. Fail-closed: anything
 * other than an entitled known-plan subscription renders the free plan.
 * Local plan selection is never presented as a subscription.
 */
export function resolveBillingView(
  row: (Pick<SubscriptionRow, 'status'> & {
    planId?: string | null;
    trialEndsAt?: Date | string | null;
    graceEndsAt?: Date | string | null;
  }) | null,
  now = new Date()
): BillingSubscriptionView {
  if (!row) return { planId: 'free', status: 'none', entitled: false, providerAction: 'checkout' };
  // Entitlement requires a known plan: an active row with an unrecognized
  // plan id grants nothing and renders free.
  const knownPlan = isKnownPlan(row.planId);
  const entitled = knownPlan && isSubscriptionEntitled(row, now);
  const planId = entitled && isKnownPlan(row.planId) ? row.planId : 'free';
  return {
    planId,
    status: row.status,
    entitled,
    providerAction: entitled && planId !== 'free' ? 'manage' : 'checkout',
  };
}
