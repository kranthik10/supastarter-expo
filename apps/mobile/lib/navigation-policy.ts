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
  '/notes',
  '/notes/new',
  '/bookings',
  '/favorites',
  '/account',
  '/search',
]);

// Marketplace detail roots allow bounded nesting: /<root>/<id> and, for
// the booking flow and account sections, /<root>/<id>/<step>. Every
// segment must be a single safe token — no nesting beyond depth 3,
// no query strings, no dot-only segments.
const NESTED_MARKETPLACE_ROOTS: Record<string, readonly string[] | null> = {
  category: null,
  service: null,
  provider: null,
  booking: null,
  book: ['provider', 'address', 'slot', 'review'],
  account: ['addresses', 'provider', 'bookings', 'availability', 'profile', 'services'],
};

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

  if (pathname.startsWith('/notes/')) {
    const segment = pathname.slice('/notes/'.length);
    // Exact static sub-route first; any other single safe segment is a note
    // id. Nested paths and query strings never match. Dot-only segments
    // are rejected as defense-in-depth even though separators never reach here.
    if (!queryString && segment === 'new') return '/notes/new';
    if (segment === '.' || segment === '..') return null;
    return !queryString && segment !== 'new' && SAFE_SEGMENT.test(segment) ? pathname : null;
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

  if (!queryString && pathname.length > 1 && !pathname.includes('//')) {
    const segments = pathname.slice(1).split('/');
    const root = segments[0] as string;
    if (root in NESTED_MARKETPLACE_ROOTS && segments.length >= 2 && segments.length <= 3) {
      if (segments.some((segment) => segment === '' || segment === '.' || segment === '..' || !SAFE_SEGMENT.test(segment))) {
        return null;
      }
      if (segments.length === 2) return pathname;
      const allowedSteps = NESTED_MARKETPLACE_ROOTS[root];
      if (allowedSteps && allowedSteps.includes(segments[2] as string)) return pathname;
      return null;
    }
  }

  return !queryString && STATIC_ROUTES.has(pathname) ? pathname : null;
}
