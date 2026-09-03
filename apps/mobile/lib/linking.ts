import * as Linking from 'expo-linking';
import { useEffect } from 'react';
import { router } from 'expo-router';
import { useAuth } from '@repo/auth';
import { useOrgs } from '@repo/organizations';
import { secureStorage } from './storage';
import { config } from '@repo/config';
import { deepLinkPathFromParsedUrl, routeFromDeepLinkParts } from './linking-policy';
import { normalizeSafeInternalRoute, requiresAuthenticatedSession } from './navigation-policy';

const PENDING_LINK_KEY = 'pendingDeepLink';

export function parseDeepLink(url: string): string | null {
  const parsed = Linking.parse(url);
  const path = deepLinkPathFromParsedUrl(parsed.scheme, parsed.hostname, parsed.path, config.appScheme);
  const query = (parsed.queryParams ?? {}) as Record<string, string | string[] | undefined>;
  return path ? routeFromDeepLinkParts(path, query) : null;
}

export async function storePendingLink(url: string) {
  const route = normalizeSafeInternalRoute(url);
  if (route) await secureStorage.set(PENDING_LINK_KEY, route);
}

export async function consumePendingLink(): Promise<string | null> {
  const raw = await secureStorage.get(PENDING_LINK_KEY);
  if (raw) await secureStorage.remove(PENDING_LINK_KEY);
  return raw ? normalizeSafeInternalRoute(raw) : null;
}

export function useDeepLinks() {
  useEffect(() => {
    let mounted = true;

    async function handleUrl(url: string) {
      const href = parseDeepLink(url);
      if (!href) return;
      if (!requiresAuthenticatedSession(href)) {
        (router.push as unknown as (s: string) => void)(href);
        return;
      }
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

    const sub = Linking.addEventListener('url', (e) => void handleUrl(e.url));
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);
}
