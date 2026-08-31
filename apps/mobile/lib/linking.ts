import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { router } from 'expo-router';
import { useAuth } from './auth-store';
import { useOrgs } from './org-store';
import { secureStorage } from './storage';

const PENDING_LINK_KEY = 'pendingDeepLink';

export function parseDeepLink(url: string): string | null {
  const parsed = Linking.parse(url);
  const path = parsed.path ?? '';
  const query = parsed.queryParams ?? {};

  if (path.startsWith('invite/')) {
    const token = path.replace('invite/', '').split('/')[0];
    if (token) return `/invite/${token}`;
  }
  if (path.startsWith('organization/')) {
    const slug = path.replace('organization/', '').split('/')[0];
    if (slug) return `/organization/${slug}`;
  }
  if (path === 'settings' || path.startsWith('settings')) return '/settings';
  if (path === 'billing' || path.startsWith('billing')) return '/billing';
  if (path === 'invite' && typeof query.token === 'string') return `/invite/${query.token}`;
  return path ? `/${path}` : null;
}

export async function storePendingLink(url: string) {
  await secureStorage.set(PENDING_LINK_KEY, url);
}

export async function consumePendingLink(): Promise<string | null> {
  const raw = await secureStorage.get(PENDING_LINK_KEY);
  if (raw) await secureStorage.remove(PENDING_LINK_KEY);
  return raw;
}

export function useDeepLinks() {
  useEffect(() => {
    let mounted = true;

    async function handleUrl(url: string) {
      const href = parseDeepLink(url);
      if (!href) return;
      const user = useAuth.getState().user;
      const hydrated = useAuth.getState().hydrated && useOrgs.getState().hydrated;
      if (!hydrated) {
        await storePendingLink(href);
        return;
      }
      if (!user) {
        await storePendingLink(href);
        (router.replace as unknown as (s: string) => void)('/sign-in');
        return;
      }
      (router.push as unknown as (s: string) => void)(href);
    }

    void Linking.getInitialURL().then((url) => {
      if (url && mounted) void handleUrl(url);
    });

    void consumePendingLink().then((pending) => {
      if (pending && mounted) {
        const u = useAuth.getState().user;
        if (u) (router.push as unknown as (s: string) => void)(pending);
      }
    });

    const sub = Linking.addEventListener('url', (e) => void handleUrl(e.url));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
}
