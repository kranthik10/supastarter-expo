import { create } from 'zustand';
import { storage, secureStorage } from './storage';
import { analytics } from '@repo/analytics';

export type User = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  createdAt: string;
};

export type AuthState = {
  user: User | null;
  loading: boolean;
  hydrated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<User, 'name'>>) => Promise<void>;
  deleteAccount: () => Promise<void>;
  hydrate: () => Promise<void>;
};

const SESSION_KEY = 'auth.session';
const AVATAR_COLORS = ['#3b6ef6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];

function colorForEmail(email: string) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = (hash * 31 + email.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function persist(user: User | null) {
  if (user) await secureStorage.set(SESSION_KEY, JSON.stringify(user));
  else await secureStorage.remove(SESSION_KEY);
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await secureStorage.get(SESSION_KEY);
      if (raw) set({ user: JSON.parse(raw) as User });
    } catch {}
    set({ hydrated: true });
  },

  signIn: async (email, password) => {
    if (!validateEmail(email)) throw new Error('invalidEmail');
    if (password.length < 6) throw new Error('shortPassword');
    set({ loading: true });
    await delay(500);
    const existingRaw = await storage.get(`users.${email.toLowerCase()}`);
    let user: User;
    if (existingRaw) {
      user = JSON.parse(existingRaw) as User;
    } else {
      // Demo provider: unknown users are provisioned on first sign-in.
      user = {
        id: `u_${Date.now().toString(36)}`,
        name: email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        email: email.toLowerCase(),
        avatarColor: colorForEmail(email),
        createdAt: new Date().toISOString(),
      };
      await storage.set(`users.${user.email}`, JSON.stringify(user));
    }
    await persist(user);
    set({ user, loading: false });
    analytics.track('sign_in', { method: 'password' });
  },

  signUp: async (name, email, password) => {
    if (!name.trim()) throw new Error('nameRequired');
    if (!validateEmail(email)) throw new Error('invalidEmail');
    if (password.length < 6) throw new Error('shortPassword');
    set({ loading: true });
    await delay(600);
    const normalized = email.toLowerCase();
    if (await storage.get(`users.${normalized}`)) throw new Error('emailTaken');
    const user: User = {
      id: `u_${Date.now().toString(36)}`,
      name: name.trim(),
      email: normalized,
      avatarColor: colorForEmail(email),
      createdAt: new Date().toISOString(),
    };
    await storage.set(`users.${user.email}`, JSON.stringify(user));
    await persist(user);
    set({ user, loading: false });
    analytics.identify(user.id, { email: user.email });
    analytics.track('sign_up', { method: 'password' });
  },

  signOut: async () => {
    analytics.track('sign_out');
    await persist(null);
    set({ user: null });
  },

  updateProfile: async (patch) => {
    const current = get().user;
    if (!current) return;
    const next = { ...current, ...patch };
    await storage.set(`users.${next.email}`, JSON.stringify(next));
    await persist(next);
    set({ user: next });
  },

  deleteAccount: async () => {
    const current = get().user;
    if (current) await storage.remove(`users.${current.email}`);
    await persist(null);
    set({ user: null });
  },
}));

export { validateEmail };
