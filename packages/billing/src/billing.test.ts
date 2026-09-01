import { describe, it, expect } from 'vitest';
import { plans, planOrder } from './plans';
import { isSubscriptionEntitled, resolveEntitlement } from './entitlements';

describe('billing abstraction', () => {
  it('has 3 plans', () => {
    expect(planOrder.length).toBe(3);
    expect(Object.keys(plans).length).toBe(3);
  });
  it('getPlanById returns correct plan', () => {
    expect(plans['pro']?.seats).toBe(10);
    expect(plans['free'].price).toBe(0);
  });
  it('free is 0', () => {
    expect(plans['free']?.price).toBe(0);
  });

  it('enables an active subscription', () => {
    expect(isSubscriptionEntitled({ status: 'active' })).toBe(true);
  });

  it('enables a trial before its expiry and disables it afterwards', () => {
    const now = new Date('2026-09-01T00:00:00Z');
    expect(isSubscriptionEntitled({ status: 'trialing', trialEndsAt: new Date('2026-09-02T00:00:00Z') }, now)).toBe(true);
    expect(isSubscriptionEntitled({ status: 'trialing', trialEndsAt: new Date('2026-08-31T00:00:00Z') }, now)).toBe(false);
  });

  it('only enables past-due subscriptions during their grace period', () => {
    const now = new Date('2026-09-01T00:00:00Z');
    expect(isSubscriptionEntitled({ status: 'past_due', graceEndsAt: new Date('2026-09-02T00:00:00Z') }, now)).toBe(true);
    expect(isSubscriptionEntitled({ status: 'past_due', graceEndsAt: new Date('2026-08-31T00:00:00Z') }, now)).toBe(false);
  });

  it('disables canceled and incomplete subscriptions', () => {
    expect(isSubscriptionEntitled({ status: 'canceled' })).toBe(false);
    expect(isSubscriptionEntitled({ status: 'incomplete' })).toBe(false);
  });

  it('uses a stored entitlement when the subscription is entitled', () => {
    expect(resolveEntitlement({ feature: 'projects.limit', planId: 'free', row: { enabled: false, limit: 0 }, subscription: { status: 'active' } }))
      .toMatchObject({ enabled: false, limit: 0 });
  });

  it('disables stored entitlements after subscription expiry', () => {
    expect(resolveEntitlement({
      feature: 'projects.limit',
      planId: 'pro',
      row: { enabled: true, limit: 50 },
      subscription: { status: 'trialing', trialEndsAt: new Date('2026-08-31T00:00:00Z') },
      now: new Date('2026-09-01T00:00:00Z'),
    })).toMatchObject({ enabled: false, limit: 50 });
  });

  it('represents unlimited plan entitlements with a null limit', () => {
    expect(resolveEntitlement({ feature: 'ai.tokens', planId: 'enterprise' })).toMatchObject({ enabled: true, limit: null });
  });

  it('returns a disabled result for an unknown feature', () => {
    expect(resolveEntitlement({ feature: 'unknown.feature' as never, planId: 'free' })).toMatchObject({ enabled: false, limit: null });
  });
});
