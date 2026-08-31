import { describe, it, expect } from 'vitest';
import { can, assertCan } from './index';

describe('rbac', () => {
  it('owner can delete organization', () => {
    expect(can('owner', 'organization.delete')).toBe(true);
  });
  it('member cannot invite', () => {
    expect(can('member', 'members.invite')).toBe(false);
  });
  it('admin can invite but not delete org', () => {
    expect(can('admin', 'members.invite')).toBe(true);
    expect(can('admin', 'organization.delete')).toBe(false);
  });
  it('assertCan throws on forbidden', () => {
    expect(() => assertCan('member', 'billing.manage')).toThrow(/Forbidden/);
  });
  it('assertCan does not throw when allowed', () => {
    expect(() => assertCan('owner', 'billing.manage')).not.toThrow();
  });
});
