import type { MemberRole, Permission } from '@repo/types';

export const rolePermissions: Record<MemberRole, Permission[]> = {
  owner: [
    'organization.read',
    'organization.update',
    'organization.delete',
    'members.read',
    'members.invite',
    'members.remove',
    'members.update',
    'billing.read',
    'billing.manage',
    'files.write',
    'files.delete',
    'notes.read',
    'notes.write',
    'notes.delete',
  ],
  admin: [
    'organization.read',
    'organization.update',
    'members.read',
    'members.invite',
    'members.remove',
    'billing.read',
    'files.write',
    'files.delete',
    'notes.read',
    'notes.write',
    'notes.delete',
  ],
  member: [
    'organization.read',
    'members.read',
    'billing.read',
    'files.write',
    'notes.read',
    'notes.write',
  ],
};

export function can(role: MemberRole, permission: Permission): boolean {
  return rolePermissions[role].includes(permission);
}

export function assertCan(role: MemberRole, permission: Permission): void {
  if (!can(role, permission)) {
    const e = new Error(`Forbidden: missing ${permission}`) as Error & { code: string };
    e.code = 'FORBIDDEN';
    throw e;
  }
}

export const permissions: Permission[] = [
  'organization.read',
  'organization.update',
  'organization.delete',
  'members.read',
  'members.invite',
  'members.remove',
  'members.update',
  'billing.read',
  'billing.manage',
  'files.write',
  'files.delete',
  'notes.read',
  'notes.write',
  'notes.delete',
];
