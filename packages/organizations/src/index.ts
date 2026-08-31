import { create } from 'zustand';
import { storage } from '@repo/storage';
import { trpc } from '@repo/api';
import type { User, MemberRole, Organization, Member } from '@repo/types';

export type { MemberRole };

type OrgState = {
  orgs: Organization[];
  activeOrgId: string | null;
  hydrated: boolean;
  createOrg: (name: string, slug: string) => Promise<Organization>;
  setActiveOrg: (id: string) => void;
  inviteMember: (orgId: string, email: string, role: Exclude<MemberRole, 'owner'>) => Promise<void>;
  removeMember: (orgId: string, userId: string) => Promise<void>;
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
  };
}

function persist(state: Pick<OrgState, 'orgs' | 'activeOrgId'>) {
  void storage.set(KEY, JSON.stringify({ orgs: state.orgs, activeOrgId: state.activeOrgId }));
}

export const useOrgs = create<OrgState>((set, get) => ({
  orgs: [],
  activeOrgId: null,
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
    return mapped;
  },

  setActiveOrg: (id) => {
    set({ activeOrgId: id });
    persist(get());
  },

  inviteMember: async (orgId, email, role) => {
    await trpc.members.invite.mutate({ organizationId: orgId, email, role });
    // Refetch orgs to get updated membership
    await get().hydrate();
  },

  removeMember: async (orgId, userId) => {
    await trpc.members.remove.mutate({ organizationId: orgId, userId });
    await get().hydrate();
  },
}));

export function useActiveOrg(): Organization | undefined {
  return useOrgs((s) => s.orgs.find((o) => o.id === s.activeOrgId) ?? s.orgs[0]);
}