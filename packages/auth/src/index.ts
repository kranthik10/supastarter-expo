import { createAuthClient } from '@better-auth/client';
import { storage, secureStorage } from './storage';
import { analytics } from '@repo/analytics';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const AUTH_BASE_URL = `${API_URL}/api/auth`;

// createAuthClient returns a factory; call it with options to get the client
// Use 'any' to bypass complex conditional types - runtime API works
const authClient: any = createAuthClient()({
  baseURL: AUTH_BASE_URL,
  fetchOptions: {
    credentials: 'include',
  },
});

type Session = Awaited<ReturnType<typeof authClient.getSession>>;
type BetterAuthUser = NonNullable<Session>['user'];

export type User = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  hydrated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateProfile: (patch: Partial<Pick<User, 'name' | 'image'>>) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string, revokeOtherSessions?: boolean) => Promise<void>;
  clearLocalSession: () => Promise<void>;
  hydrate: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const SESSION_KEY = 'auth.session';

function mapBetterAuthUser(bUser: BetterAuthUser): User {
  return {
    id: bUser.id,
    name: bUser.name,
    email: bUser.email,
    image: bUser.image,
    emailVerified: bUser.emailVerified,
    createdAt: bUser.createdAt,
    updatedAt: bUser.updatedAt,
  };
}

async function persistSession(user: User | null, session: Session | null) {
  if (user && session) {
    await secureStorage.set(SESSION_KEY, JSON.stringify({ user, session }));
  } else {
    await secureStorage.remove(SESSION_KEY);
  }
}

import { create } from 'zustand';

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: false,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await secureStorage.get(SESSION_KEY);
      if (raw) {
        const { user, session } = JSON.parse(raw) as { user: User; session: Session };
        set({ user, session, hydrated: true });
        return;
      }
    } catch {}
    set({ hydrated: true });
  },

  refreshSession: async () => {
    try {
      const session = await authClient.getSession();
      if (session?.user) {
        const user = mapBetterAuthUser(session.user);
        set({ user, session });
        await persistSession(user, session);
      } else {
        set({ user: null, session: null });
        await persistSession(null, null);
      }
    } catch {
      set({ user: null, session: null });
      await persistSession(null, null);
    }
  },

  signIn: async (email, password) => {
    set({ loading: true });
    const result = await authClient.signIn.email({ email, password });
    if (result.error) {
      set({ loading: false });
      throw new Error(result.error.message);
    }
    if (result.data?.user && result.data?.session) {
      const user = mapBetterAuthUser(result.data.user);
      set({ user, session: result.data.session, loading: false });
      await persistSession(user, result.data.session);
      analytics.track('sign_in', { method: 'password' });
    } else {
      set({ loading: false });
      throw new Error('Sign in failed');
    }
  },

  signUp: async (name, email, password) => {
    set({ loading: true });
    const result = await authClient.signUp.email({ name, email, password, autoCreateSession: true });
    if (result.error) {
      set({ loading: false });
      throw new Error(result.error.message);
    }
    if (result.data?.user && result.data?.session) {
      const user = mapBetterAuthUser(result.data.user);
      set({ user, session: result.data.session, loading: false });
      await persistSession(user, result.data.session);
      analytics.identify(user.id, { email: user.email, name: user.name ?? '' });
      analytics.track('sign_up', { method: 'password' });
    } else {
      set({ loading: false });
      throw new Error('Sign up failed');
    }
  },

  signOut: async () => {
    await authClient.signOut();
    analytics.track('sign_out');
    set({ user: null, session: null });
    await persistSession(null, null);
  },

  updateProfile: async (patch) => {
    const current = get().user;
    if (!current) return;
    const result = await authClient.$invoke.post('/update-user', { body: patch });
    if (result.error) throw new Error(result.error.message ?? String(result.error));
    await get().refreshSession();
  },

  changePassword: async (currentPassword, newPassword, revokeOtherSessions = false) => {
    const result = await authClient.$invoke.post('/change-password', {
      body: { currentPassword, newPassword, revokeOtherSessions },
    });
    if (result.error) throw new Error(result.error.message ?? String(result.error));
  },

  clearLocalSession: async () => {
    set({ user: null, session: null });
    await persistSession(null, null);
  },
}));

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}