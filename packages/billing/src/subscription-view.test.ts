import { describe, expect, it } from 'vitest';
import { useBilling } from './index';
import { resolveBillingView } from './subscription-view';

describe('billing subscription view policy', () => {
  it('resolves no subscription to the free plan with a provider checkout action', () => {
    expect(resolveBillingView(null)).toEqual({
      planId: 'free',
      status: 'none',
      entitled: false,
      providerAction: 'checkout',
    });
  });

  it('resolves an active paid subscription to its server plan with provider management', () => {
    expect(resolveBillingView({ planId: 'pro', status: 'active' })).toEqual({
      planId: 'pro',
      status: 'active',
      entitled: true,
      providerAction: 'manage',
    });
  });

  it('fails closed to free when the subscription is canceled, incomplete, or past grace', () => {
    expect(resolveBillingView({ planId: 'pro', status: 'canceled' }).planId).toBe('free');
    expect(resolveBillingView({ planId: 'pro', status: 'incomplete' }).entitled).toBe(false);
    expect(
      resolveBillingView({
        planId: 'pro',
        status: 'past_due',
        graceEndsAt: new Date(Date.now() - 1000),
      }).planId
    ).toBe('free');
  });

  it('honors trialing and grace-period subscriptions while they are valid', () => {
    const future = new Date(Date.now() + 3600_000);
    expect(
      resolveBillingView({ planId: 'pro', status: 'trialing', trialEndsAt: future }).entitled
    ).toBe(true);
    expect(
      resolveBillingView({ planId: 'pro', status: 'past_due', graceEndsAt: future }).planId
    ).toBe('pro');
  });

  it('fails closed on unknown plan ids instead of rendering untrusted values', () => {
    const unknown = resolveBillingView({ planId: 'ultra', status: 'active' });
    expect(unknown.planId).toBe('free');
    expect(unknown.entitled).toBe(false);
    expect(unknown.providerAction).toBe('checkout');
  });
});

describe('billing client subscription mirror', () => {
  it('starts empty and only accepts server-provided subscription state', () => {
    useBilling.getState().clearSubscription();
    expect(useBilling.getState().subscription).toBeNull();
    expect('setPlan' in useBilling.getState()).toBe(false);

    useBilling.getState().setSubscription({ planId: 'pro', status: 'active' });
    expect(useBilling.getState().subscription).toEqual({ planId: 'pro', status: 'active' });
    useBilling.getState().clearSubscription();
  });
});
