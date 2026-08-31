import { create } from 'zustand';
import { storage } from './storage';
import type { User } from './auth-store';

export type MemberRole = 'owner' | 'admin' | 'member';

export type Member = {
  userId: string;
  name: string;
  email: string;
  avatarColor: string;
  role: MemberRole;
  joinedAt: string;
};

export type Organization = {
  id: string;
  name: string;
  createdAt: string;
  members: Member[];
};

type OrgState = {
  orgs: Organization[];
  activeOrgId: string | null;
  hydrated: boolean;
  createOrg: (name: string, owner: User) => Organization;
  setActiveOrg: (id: string) => void;
  inviteMember: (orgId: string, email: string, role: Exclude<MemberRole, 'owner'>) => void;
  removeMember: (orgId: string, userId: string) => void;
  hydrate: () => Promise<void>;
};

const KEY = 'orgs.v1';

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

  createOrg: (name, owner) => {
    const org: Organization = {
      id: `o_${Date.now().toString(36)}`,
      name: name.trim(),
      createdAt: new Date().toISOString(),
      members: [
        {
          userId: owner.id,
          name: owner.name,
          email: owner.email,
          avatarColor: owner.avatarColor,
          role: 'owner',
          joinedAt: new Date().toISOString(),
        },
      ],
    };
    const next = { orgs: [...get().orgs, org], activeOrgId: org.id };
    set(next);
    persist(next);
    return org;
  },

  setActiveOrg: (id) => {
    set({ activeOrgId: id });
    persist(get());
  },

  inviteMember: (orgId, email, role) => {
    const normalized = email.toLowerCase();
    if (get().orgs.some((o) => o.members.some((m) => m.email === normalized && o.id === orgId))) return;
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) hash = (hash * 31 + normalized.charCodeAt(i)) | 0;
    const colors = ['#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#3b6ef6'];
    const member: Member = {
      userId: `u_${Math.abs(hash).toString(36)}`,
      name: normalized.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      email: normalized,
      avatarColor: colors[Math.abs(hash) % colors.length],
      role,
      joinedAt: new Date().toISOString(),
    };
    const next = {
      ...get(),
      orgs: get().orgs.map((o) =>
        o.id === orgId ? { ...o, members: [...o.members, member] } : o
      ),
    };
    set(next);
    persist(next);
  },

  removeMember: (orgId, userId) => {
    const next = {
      ...get(),
      orgs: get().orgs.map((o) =>
        o.id === orgId ? { ...o, members: o.members.filter((m) => m.userId !== userId) } : o
      ),
    };
    set(next);
    persist(next);
  },
}));

export function useActiveOrg(): Organization | undefined {
  return useOrgs((s) => s.orgs.find((o) => o.id === s.activeOrgId) ?? s.orgs[0]);
}
