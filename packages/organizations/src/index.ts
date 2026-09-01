import { create } from 'zustand';
import { storage } from '@repo/storage';
import { trpc } from '@repo/api';
import type { User, MemberRole, Organization, Member } from '@repo/types';

export type { MemberRole };

export type PendingInvitation = {
  id: string;
  organizationId: string;
  email: string;
  role: Exclude<MemberRole, 'owner'>;
  status: 'pending';
  expiresAt: string;
  createdAt: string;
};

export type InvitationCreateResult = {
  emailDelivered: boolean;
  emailStatus: 'sent' | 'not_configured' | 'failed';
};

type ServerMember = {
  organizationId: string;
  user: { id: string; name: string | null; email: string; image: string | null };
  role: MemberRole;
  joinedAt: Date | string;
};

type OrgState = {
  orgs: Organization[];
  activeOrgId: string | null;
  pendingInvitationsByOrg: Record<string, PendingInvitation[]>;
  hydrated: boolean;
  createOrg: (name: string, slug: string) => Promise<Organization>;
  refreshOrganizations: () => Promise<void>;
  setActiveOrg: (id: string) => void;
  refreshMembers: (orgId: string) => Promise<void>;
  refreshInvitations: (orgId: string) => Promise<void>;
  inviteMember: (orgId: string, email: string, role: Exclude<MemberRole, 'owner'>) => Promise<InvitationCreateResult>;
  revokeInvitation: (orgId: string, invitationId: string) => Promise<void>;
  removeMember: (orgId: string, userId: string) => Promise<void>;
  updateMemberRole: (orgId: string, userId: string, role: MemberRole) => Promise<void>;
  transferOwnership: (orgId: string, targetUserId: string) => Promise<void>;
  hydrate: () => Promise<void>;
};

const KEY = 'orgs.v1';

function toOrg(org: any): Organization {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    logoUrl: org.logoUrl ?? null,
    createdAt: org.createdAt instanceof Date ? org.createdAt.toISOString() : org.createdAt,
    updatedAt: org.updatedAt instanceof Date ? org.updatedAt.toISOString() : org.updatedAt,
    members: org.members ?? [],
  };
}

function toMember(row: ServerMember): Member {
  return {
    userId: row.user.id,
    name: row.user.name,
    email: row.user.email,
    image: row.user.image,
    role: row.role,
    joinedAt: row.joinedAt instanceof Date ? row.joinedAt.toISOString() : row.joinedAt,
  };
}

function toInvitation(row: { id: string; organizationId: string; email: string; role: MemberRole; status: 'pending'; expiresAt: Date | string; createdAt: Date | string }): PendingInvitation {
  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    role: row.role as Exclude<MemberRole, 'owner'>,
    status: row.status,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

function persist(state: Pick<OrgState, 'orgs' | 'activeOrgId'>) {
  void storage.set(KEY, JSON.stringify({ orgs: state.orgs, activeOrgId: state.activeOrgId }));
}

export const useOrgs = create<OrgState>((set, get) => ({
  orgs: [],
  activeOrgId: null,
  pendingInvitationsByOrg: {},
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await storage.get(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { orgs: Organization[]; activeOrgId: string | null };
        set({ orgs: parsed.orgs ?? [], activeOrgId: parsed.activeOrgId ?? null });
      }
    } catch {}
    set({ hydrated: true });
  },

  createOrg: async (name, slug) => {
    const org = await trpc.organizations.create.mutate({ name, slug });
    const mapped = toOrg(org);
    const next = { orgs: [...get().orgs, mapped], activeOrgId: mapped.id };
    set(next);
    persist(next);
    await get().refreshMembers(mapped.id);
    return mapped;
  },

  refreshOrganizations: async () => {
    const rows = await trpc.organizations.list.query();
    const orgs = rows.map(toOrg);
    const activeOrgId = get().activeOrgId && orgs.some((org) => org.id === get().activeOrgId) ? get().activeOrgId : orgs[0]?.id ?? null;
    set({ orgs, activeOrgId });
    persist({ orgs, activeOrgId });
  },

  setActiveOrg: (id) => {
    set({ activeOrgId: id });
    persist(get());
  },

  refreshMembers: async (orgId) => {
    const rows = (await trpc.members.list.query({ organizationId: orgId })) as ServerMember[];
    const members = rows.map(toMember);
    const orgs = get().orgs.map((org) => (org.id === orgId ? { ...org, members } : org));
    set({ orgs });
    persist({ orgs, activeOrgId: get().activeOrgId });
  },

  refreshInvitations: async (orgId) => {
    const rows = await trpc.invitations.list.query({ organizationId: orgId });
    const pendingInvitationsByOrg = {
      ...get().pendingInvitationsByOrg,
      [orgId]: rows.map((row) => toInvitation(row as unknown as Parameters<typeof toInvitation>[0])),
    };
    set({ pendingInvitationsByOrg });
  },

  inviteMember: async (orgId, email, role) => {
    const result = await trpc.invitations.create.mutate({ organizationId: orgId, email: email.trim(), role });
    await Promise.all([get().refreshMembers(orgId), get().refreshInvitations(orgId)]);
    return { emailDelivered: result.emailDelivered, emailStatus: result.emailStatus };
  },

  revokeInvitation: async (orgId, invitationId) => {
    await trpc.invitations.revoke.mutate({ organizationId: orgId, invitationId });
    await get().refreshInvitations(orgId);
  },

  removeMember: async (orgId, userId) => {
    await trpc.members.remove.mutate({ organizationId: orgId, userId });
    await get().refreshMembers(orgId);
  },

  updateMemberRole: async (orgId, userId, role) => {
    await trpc.members.updateRole.mutate({ organizationId: orgId, userId, role });
    await get().refreshMembers(orgId);
  },

  transferOwnership: async (orgId, targetUserId) => {
    await trpc.organizations.transferOwnership.mutate({ organizationId: orgId, targetUserId });
    await get().refreshMembers(orgId);
  },
}));

export function useActiveOrg(): Organization | undefined {
  return useOrgs((s) => s.orgs.find((o) => o.id === s.activeOrgId) ?? s.orgs[0]);
}
