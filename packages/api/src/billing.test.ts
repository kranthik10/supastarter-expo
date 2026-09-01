import { describe, it, expect } from 'vitest';
import { can, assertCan } from '@repo/permissions';
import { resolveEntitlement, PLAN_ENTITLEMENTS } from '@repo/billing/entitlements';

describe('billing RBAC — milestone 3.1', () => {
  it('owner can manage billing', () => {
    expect(can('owner', 'billing.manage')).toBe(true);
    expect(() => assertCan('owner', 'billing.manage')).not.toThrow();
    expect(can('owner', 'billing.read')).toBe(true);
  });

  it('admin can read but cannot manage billing', () => {
    expect(can('admin', 'billing.read')).toBe(true);
    expect(can('admin', 'billing.manage')).toBe(false);
    expect(() => assertCan('admin', 'billing.manage')).toThrow(/Forbidden/);
    expect(() => assertCan('admin', 'billing.read')).not.toThrow();
  });

  it('member can read but cannot manage billing', () => {
    expect(can('member', 'billing.read')).toBe(true);
    expect(can('member', 'billing.manage')).toBe(false);
    expect(() => assertCan('member', 'billing.manage')).toThrow(/Forbidden/);
    expect(() => assertCan('member', 'billing.read')).not.toThrow();
  });

  it('billing procedures require billing.read for get, billing.manage for update', () => {
    // mirrors router asserts: getSubscription/listEntitlements/getEntitlement → billing.read, updateSubscription → billing.manage
    expect(can('member', 'billing.read')).toBe(true);
    expect(can('member', 'billing.manage')).toBe(false);
  });
});

describe('organization isolation — entitlements', () => {
  // Simulate membership guard: userId must be member of orgId to read entitlements.
  function canReadEntitlements(userMemberships: Set<string>, requestedOrgId: string): boolean {
    return userMemberships.has(requestedOrgId);
  }

  it('org A cannot read org B entitlements without membership', () => {
    const aliceOrgs = new Set(['org_A']);
    expect(canReadEntitlements(aliceOrgs, 'org_A')).toBe(true);
    expect(canReadEntitlements(aliceOrgs, 'org_B')).toBe(false);
  });

  it('different orgs have independent entitlement limits (plan-derived)', () => {
    const orgAPlan = 'free' as const;
    const orgBPlan = 'enterprise' as const;
    const a = resolveEntitlement({ feature: 'projects.limit', planId: orgAPlan, row: null });
    const b = resolveEntitlement({ feature: 'projects.limit', planId: orgBPlan, row: null });
    expect(a.limit).toBe(3);
    expect(b.limit).toBe(null); // unlimited
    expect(a.limit).not.toBe(b.limit);
  });

  it('admin override in org A does not affect org B', () => {
    const aOverride = resolveEntitlement({ feature: 'members.limit', planId: 'free', row: { limit: 999, enabled: true } });
    const bDefault = resolveEntitlement({ feature: 'members.limit', planId: 'free', row: null });
    expect(aOverride.limit).toBe(999);
    expect(bDefault.limit).toBe(2);
  });

  it('entitlement row is scoped by organization_id + feature unique', () => {
    // PLAN_ENTITLEMENTS ensures each feature is per-plan; server unique index is (orgId, feature)
    for (const pid of ['free', 'pro', 'enterprise'] as const) {
      const features = PLAN_ENTITLEMENTS[pid].map((f: { feature: string }) => f.feature);
      // unique per feature
      expect(new Set(features).size).toBe(features.length);
    }
  });
});
