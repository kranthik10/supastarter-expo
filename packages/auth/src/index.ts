import { createAuthClient } from '@better-auth/client';
import { secureStorage } from './storage';
import { extractSessionToken, parsePersistedSession } from './security';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';
const AUTH_BASE_URL = `${API_URL}/api/auth`;
const AUTH_TOKEN_KEY = 'auth.token';

const authFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const token = await secureStorage.get(AUTH_TOKEN_KEY);
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers, credentials: 'include' });
};

// createAuthClient returns a factory; call it with options to get the client
// Use 'any' to bypass complex conditional types - runtime API works
const authClient: any = createAuthClient()({
  baseURL: AUTH_BASE_URL,
  betterFetchOptions: {
    customFetchImpl: authFetch,
  },
});

type Session = { token: string };
type BetterAuthUser = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type User = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AuthEvent = 'signed_in' | 'signed_up';

export type AuthState = {
  user: User | null;
  session: Session | null;
  lastAuthEvent: AuthEvent | null;
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
  consumeAuthEvent: () => AuthEvent | null;
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

async function persistSession(user: User | null, sessionToken: string | null) {
  if (user && sessionToken) {
    await secureStorage.set(SESSION_KEY, JSON.stringify({ user, sessionToken }));
    await secureStorage.set(AUTH_TOKEN_KEY, sessionToken);
  } else {
    await secureStorage.remove(SESSION_KEY);
    await secureStorage.remove(AUTH_TOKEN_KEY);
  }
}

import { create } from 'zustand';

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  lastAuthEvent: null,
  loading: false,
  hydrated: false,

  hydrate: async () => {
    try {
      const persisted = parsePersistedSession(await secureStorage.get(SESSION_KEY));
      if (persisted) await secureStorage.set(AUTH_TOKEN_KEY, persisted.sessionToken);
      const remote = await authClient.getSession();
      if (remote?.user) {
        const user = mapBetterAuthUser(remote.user as BetterAuthUser);
        const sessionToken = persisted?.sessionToken ?? (await secureStorage.get(AUTH_TOKEN_KEY));
        set({ user, session: sessionToken ? { token: sessionToken } : null, hydrated: true });
        if (sessionToken) await persistSession(user, sessionToken);
        return;
      }
    } catch {}
    set({ user: null, session: null, hydrated: true });
    await persistSession(null, null);
  },

  refreshSession: async () => {
    try {
      const remote = await authClient.getSession();
      const sessionToken = await secureStorage.get(AUTH_TOKEN_KEY);
      if (remote?.user) {
        const user = mapBetterAuthUser(remote.user as BetterAuthUser);
        set({ user, session: sessionToken ? { token: sessionToken } : null });
        if (sessionToken) await persistSession(user, sessionToken);
        return;
      }
    } catch {}
    set({ user: null, session: null, lastAuthEvent: null });
    await persistSession(null, null);
  },

  signIn: async (email, password) => {
    set({ loading: true });
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) throw new Error(result.error.message);
      const sessionToken = extractSessionToken(result.data);
      if (result.data?.user && sessionToken) {
        const user = mapBetterAuthUser(result.data.user as BetterAuthUser);
        set({ user, session: { token: sessionToken }, lastAuthEvent: 'signed_in' });
        await persistSession(user, sessionToken);
        return;
      }
      throw new Error('Sign in failed');
    } finally {
      set({ loading: false });
    }
  },

  signUp: async (name, email, password) => {
    set({ loading: true });
    try {
      const result = await authClient.signUp.email({ name, email, password, autoCreateSession: true });
      if (result.error) throw new Error(result.error.message);
      const sessionToken = extractSessionToken(result.data);
      if (result.data?.user && sessionToken) {
        const user = mapBetterAuthUser(result.data.user as BetterAuthUser);
        set({ user, session: { token: sessionToken }, lastAuthEvent: 'signed_up' });
        await persistSession(user, sessionToken);
        return;
      }
      throw new Error('Sign up failed');
    } finally {
      set({ loading: false });
    }
  },

  signOut: async () => {
    try {
      await authClient.signOut();
    } finally {
      set({ user: null, session: null, lastAuthEvent: null });
      await persistSession(null, null);
    }
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
    await get().refreshSession();
  },

  clearLocalSession: async () => {
    set({ user: null, session: null, lastAuthEvent: null });
    await persistSession(null, null);
  },

  consumeAuthEvent: () => {
    const event = get().lastAuthEvent;
    if (event) set({ lastAuthEvent: null });
    return event;
  },
}));

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}