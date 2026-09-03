import { normalizeSafeInternalRoute } from './navigation-policy';

export type DeepLinkQuery = Record<string, string | string[] | undefined>;

export function deepLinkPathFromParsedUrl(
  scheme: string | null,
  hostname: string | null,
  path: string | null,
  expectedScheme: string
): string | null {
  if (scheme !== expectedScheme) return null;
  return [hostname, path].filter((part): part is string => Boolean(part)).join('/') || null;
}

export function routeFromDeepLinkParts(path: string, query: DeepLinkQuery): string | null {
  const normalizedPath = path.replace(/^\/+/, '');
  const entries = Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
  const hasUnsupportedValue = Object.values(query).some((value) => Array.isArray(value));
  if (hasUnsupportedValue) return null;

  if (normalizedPath === 'invite' && entries.length === 1 && entries[0][0] === 'token') {
    return normalizeSafeInternalRoute(`/invite/${entries[0][1]}`);
  }

  if (normalizedPath === 'reset-password' && entries.length === 1) {
    const [key, value] = entries[0];
    if (key !== 'token' && key !== 'error') return null;
    return normalizeSafeInternalRoute(`/reset-password?${key}=${encodeURIComponent(value)}`);
  }

  if (entries.length > 0) {
    if (normalizedPath === 'settings' && entries.length === 1 && entries[0][0] === 'section') {
      return normalizeSafeInternalRoute(`/settings?section=${encodeURIComponent(entries[0][1])}`);
    }
    return null;
  }

  return normalizeSafeInternalRoute(`/${normalizedPath}`);
}
