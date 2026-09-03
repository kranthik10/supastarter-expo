import { describe, it, expect } from 'vitest';
import { can, assertCan, rolePermissions, permissions } from '@repo/permissions';

describe('RBAC - Role Permissions', () => {
  it('owner has all permissions', () => {
    expect(rolePermissions.owner.length).toBe(permissions.length);
    permissions.forEach((p) => {
      expect(can('owner', p)).toBe(true);
    });
  });

  it('owner can delete organization', () => {
    expect(can('owner', 'organization.delete')).toBe(true);
    expect(() => assertCan('owner', 'organization.delete')).not.toThrow();
  });

  it('owner can update organization', () => {
    expect(can('owner', 'organization.update')).toBe(true);
  });

  it('owner can invite members', () => {
    expect(can('owner', 'members.invite')).toBe(true);
  });

  it('owner can remove members', () => {
    expect(can('owner', 'members.remove')).toBe(true);
  });

  it('owner can manage billing', () => {
    expect(can('owner', 'billing.manage')).toBe(true);
  });

  it('admin can update organization', () => {
    expect(can('admin', 'organization.update')).toBe(true);
    expect(() => assertCan('admin', 'organization.update')).not.toThrow();
  });

  it('admin cannot delete organization', () => {
    expect(can('admin', 'organization.delete')).toBe(false);
    expect(() => assertCan('admin', 'organization.delete')).toThrow(/Forbidden/);
  });

  it('admin can invite members', () => {
    expect(can('admin', 'members.invite')).toBe(true);
  });

  it('admin can remove members', () => {
    expect(can('admin', 'members.remove')).toBe(true);
  });

  it('admin cannot manage billing', () => {
    expect(can('admin', 'billing.manage')).toBe(false);
    expect(() => assertCan('admin', 'billing.manage')).toThrow(/Forbidden/);
  });

  it('member can read organization', () => {
    expect(can('member', 'organization.read')).toBe(true);
  });

  it('member cannot update organization', () => {
    expect(can('member', 'organization.update')).toBe(false);
    expect(() => assertCan('member', 'organization.update')).toThrow(/Forbidden/);
  });

  it('member cannot delete organization', () => {
    expect(can('member', 'organization.delete')).toBe(false);
    expect(() => assertCan('member', 'organization.delete')).toThrow(/Forbidden/);
  });

  it('member cannot invite members', () => {
    expect(can('member', 'members.invite')).toBe(false);
    expect(() => assertCan('member', 'members.invite')).toThrow(/Forbidden/);
  });

  it('member cannot remove members', () => {
    expect(can('member', 'members.remove')).toBe(false);
    expect(() => assertCan('member', 'members.remove')).toThrow(/Forbidden/);
  });

  it('member can read members', () => {
    expect(can('member', 'members.read')).toBe(true);
  });

  it('member cannot manage billing', () => {
    expect(can('member', 'billing.manage')).toBe(false);
    expect(() => assertCan('member', 'billing.manage')).toThrow(/Forbidden/);
  });

  it('member can read billing', () => {
    expect(can('member', 'billing.read')).toBe(true);
  });

  it('every role can read and write notes', () => {
    for (const role of ['owner', 'admin', 'member'] as const) {
      expect(can(role, 'notes.read')).toBe(true);
      expect(can(role, 'notes.write')).toBe(true);
    }
  });

  it('only owner and admin can delete notes', () => {
    expect(can('owner', 'notes.delete')).toBe(true);
    expect(can('admin', 'notes.delete')).toBe(true);
    expect(can('member', 'notes.delete')).toBe(false);
    expect(() => assertCan('member', 'notes.delete')).toThrow(/Forbidden/);
  });

  it('assertCan throws with Forbidden code', () => {
    try {
      assertCan('member', 'organization.delete');
      throw new Error('should have thrown');
    } catch (e: any) {
      expect(e.code).toBe('FORBIDDEN');
      expect(e.message).toContain('Forbidden');
    }
  });

  it('assertCan does not throw when allowed', () => {
    expect(() => assertCan('owner', 'organization.delete')).not.toThrow();
    expect(() => assertCan('admin', 'organization.update')).not.toThrow();
    expect(() => assertCan('member', 'organization.read')).not.toThrow();
  });
});

describe('Permission Matrix Completeness', () => {
  it('every permission is assigned to at least one role', () => {
    permissions.forEach((p) => {
      const hasRole = ['owner', 'admin', 'member'].some((r) => can(r as any, p));
      expect(hasRole).toBe(true);
    });
  });

  it('roles are hierarchical: owner >= admin >= member', () => {
    permissions.forEach((p) => {
      const ownerHas = can('owner', p);
      const adminHas = can('admin', p);
      const memberHas = can('member', p);

      // If admin has it, owner must have it
      if (adminHas) expect(ownerHas).toBe(true);
      // If member has it, admin must have it
      if (memberHas) expect(adminHas).toBe(true);
    });
  });
});