import { describe, it, expect } from 'vitest';
import { PLAN_ENTITLEMENTS, isSubscriptionEntitled, resolveEntitlement, ALL_FEATURES } from './entitlements';
import type { Feature, PlanId } from './entitlements';

describe('entitlements — pure resolver', () => {
  const now = new Date('2026-09-01T12:00:00Z');

  it('ALL_FEATURES contains 4 features', () => {
    expect(ALL_FEATURES.length).toBe(4);
    expect(ALL_FEATURES).toContain('projects.limit');
    expect(ALL_FEATURES).toContain('members.limit');
  });

  it('plan resolves correctly — free defaults', () => {
    expect(PLAN_ENTITLEMENTS.free.find((f) => f.feature === 'projects.limit')?.limit).toBe(3);
    expect(PLAN_ENTITLEMENTS.pro.find((f) => f.feature === 'members.limit')?.limit).toBe(25);
    expect(PLAN_ENTITLEMENTS.enterprise.find((f) => f.feature === 'storage.gb')?.limit).toBe(null);
  });

  it('free → pro entitlements initialize correctly (pure mapping)', () => {
    const freeProj = PLAN_ENTITLEMENTS.free.find((f) => f.feature === 'projects.limit');
    const proProj = PLAN_ENTITLEMENTS.pro.find((f) => f.feature === 'projects.limit');
    expect(freeProj?.limit).toBe(3);
    expect(proProj?.limit).toBe(50);
  });

  it('enabled feature — free projects.limit enabled', () => {
    const e = resolveEntitlement({ feature: 'projects.limit', planId: 'free', row: null, subscription: null, now });
    expect(e.enabled).toBe(true);
    expect(e.limit).toBe(3);
  });

  it('disabled feature — via row enabled=false', () => {
    const e = resolveEntitlement({
      feature: 'storage.gb',
      planId: 'pro',
      row: { limit: 100, enabled: false },
      subscription: { status: 'active' },
      now,
    });
    expect(e.enabled).toBe(false);
  });

  it('limited feature — returns limit and canUse logic', () => {
    const e = resolveEntitlement({ feature: 'members.limit', planId: 'free', row: null, now });
    expect(e.limit).toBe(2);
    // pure helper for canUse: usage < limit
    expect(1 < (e.limit as number)).toBe(true);
    expect(2 < (e.limit as number)).toBe(false);
  });

  it('unlimited feature — enterprise limit null', () => {
    const e = resolveEntitlement({ feature: 'ai.tokens', planId: 'enterprise', row: null, now });
    expect(e.limit).toBe(null);
    expect(e.enabled).toBe(true);
  });

  it('unknown feature — falls back to disabled null', () => {
    const e = resolveEntitlement({ feature: 'projects.limit' as Feature, planId: 'free', row: null, now });
    expect(e).toBeTruthy();
    // unknown feature not in plan: resolve with baseEnabled false
    const unknown = resolveEntitlement({ feature: 'unknown.feature' as unknown as Feature, planId: 'free', row: null, now });
    expect(unknown.enabled).toBe(false);
    expect(unknown.limit).toBe(null);
  });

  it('subscription lifecycle — trialing with future trialEndsAt → entitled', () => {
    expect(
      isSubscriptionEntitled({ status: 'trialing', trialEndsAt: new Date('2026-09-10T00:00:00Z') }, now)
    ).toBe(true);
    expect(
      isSubscriptionEntitled({ status: 'trialing', trialEndsAt: new Date('2026-08-01T00:00:00Z') }, now)
    ).toBe(false);
    expect(isSubscriptionEntitled({ status: 'trialing', trialEndsAt: null }, now)).toBe(false);
  });

  it('subscription lifecycle — active → entitled regardless of cancelAtPeriodEnd', () => {
    expect(isSubscriptionEntitled({ status: 'active', cancelAtPeriodEnd: true }, now)).toBe(true);
    expect(isSubscriptionEntitled({ status: 'active', cancelAtPeriodEnd: false }, now)).toBe(true);
  });

  it('subscription lifecycle — past_due within grace → entitled, after grace → not', () => {
    expect(
      isSubscriptionEntitled({ status: 'past_due', graceEndsAt: new Date('2026-09-05T00:00:00Z') }, now)
    ).toBe(true);
    expect(
      isSubscriptionEntitled({ status: 'past_due', graceEndsAt: new Date('2026-08-20T00:00:00Z') }, now)
    ).toBe(false);
    expect(isSubscriptionEntitled({ status: 'past_due', graceEndsAt: null }, now)).toBe(false);
  });

  it('subscription lifecycle — canceled/incomplete → not entitled', () => {
    expect(isSubscriptionEntitled({ status: 'canceled' }, now)).toBe(false);
    expect(isSubscriptionEntitled({ status: 'incomplete' }, now)).toBe(false);
  });

  it('subscription not entitled disables feature even if plan says enabled', () => {
    const e = resolveEntitlement({
      feature: 'projects.limit',
      planId: 'pro',
      row: null,
      subscription: { status: 'canceled' },
      now,
    });
    expect(e.enabled).toBe(false);
    expect(e.limit).toBe(50); // limit still plan default, but disabled
  });

  it('subscription expiry disables an explicit row without losing its limit', () => {
    const e = resolveEntitlement({
      feature: 'members.limit',
      planId: 'free',
      row: { limit: 999, enabled: true },
      subscription: { status: 'canceled' },
      now,
    });
    expect(e.limit).toBe(999);
    expect(e.enabled).toBe(false);
  });

  it('grace period — past_due within grace keeps entitlements enabled', () => {
    const e = resolveEntitlement({
      feature: 'storage.gb',
      planId: 'pro',
      row: null,
      subscription: { status: 'past_due', graceEndsAt: new Date('2026-09-10T00:00:00Z') },
      now,
    });
    expect(e.enabled).toBe(true);
  });

  it('cancel_at_period_end does not disable while active', () => {
    const e = resolveEntitlement({
      feature: 'ai.tokens',
      planId: 'pro',
      row: null,
      subscription: { status: 'active', cancelAtPeriodEnd: true },
      now,
    });
    expect(e.enabled).toBe(true);
  });

  it('plan → entitlement mapping is additive — adding feature only touches PLAN_ENTITLEMENTS', () => {
    for (const pid of ['free', 'pro', 'enterprise'] as PlanId[]) {
      const features = PLAN_ENTITLEMENTS[pid].map((f) => f.feature);
      expect(features).toEqual(expect.arrayContaining(ALL_FEATURES));
    }
  });
});
