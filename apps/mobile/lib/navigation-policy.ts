const STATIC_ROUTES = new Set([
  '/',
  '/home',
  '/team',
  '/billing',
  '/settings',
  '/notifications',
  '/sign-in',
  '/sign-up',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/onboarding',
  '/create-organization',
  '/welcome',
  '/assistant',
]);

const SAFE_SEGMENT = /^[A-Za-z0-9._~-]{1,512}$/;
const SAFE_SLUG = /^[A-Za-z0-9_-]{1,120}$/;
const SETTINGS_SECTIONS = new Set(['profile', 'preferences', 'security', 'sessions']);

const PUBLIC_ROUTES = new Set(['/', '/sign-in', '/sign-up', '/forgot-password', '/reset-password', '/verify-email']);

export function requiresAuthenticatedSession(route: string): boolean {
  return !PUBLIC_ROUTES.has(route.split('?')[0] ?? route);
}

export function normalizeSafeInternalRoute(value: string): string | null {
  const raw = value.trim();
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || raw.length > 2048 || raw.includes('#')) {
    return null;
  }

  const queryIndex = raw.indexOf('?');
  const pathname = queryIndex === -1 ? raw : raw.slice(0, queryIndex);
  const queryString = queryIndex === -1 ? '' : raw.slice(queryIndex + 1);

  if (pathname.startsWith('/invite/')) {
    const segment = pathname.slice('/invite/'.length);
    return !queryString && SAFE_SEGMENT.test(segment) ? `/invite/${segment}` : null;
  }

  if (pathname.startsWith('/organization/')) {
    const slug = pathname.slice('/organization/'.length);
    return !queryString && SAFE_SLUG.test(slug) ? `/organization/${slug}` : null;
  }

  if (pathname === '/reset-password' && queryString) {
    const params = new URLSearchParams(queryString);
    const entries = [...params.entries()];
    if (entries.length !== 1) return null;
    const [key, parameter] = entries[0];
    if (key === 'token' && SAFE_SEGMENT.test(parameter)) return `/reset-password?token=${parameter}`;
    if (key === 'error' && parameter === 'INVALID_TOKEN') return '/reset-password?error=INVALID_TOKEN';
    return null;
  }

  if (pathname === '/settings' && queryString) {
    const params = new URLSearchParams(queryString);
    const entries = [...params.entries()];
    return entries.length === 1 && entries[0][0] === 'section' && SETTINGS_SECTIONS.has(entries[0][1]) ? '/settings' : null;
  }

  return !queryString && STATIC_ROUTES.has(pathname) ? pathname : null;
}
