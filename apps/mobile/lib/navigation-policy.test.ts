import { describe, expect, it } from 'vitest';
import { normalizeSafeInternalRoute, requiresAuthenticatedSession } from './navigation-policy';

describe('safe internal navigation policy', () => {
  it('allows only known static application routes', () => {
    expect(normalizeSafeInternalRoute('/home')).toBe('/home');
    expect(normalizeSafeInternalRoute('/settings?section=security')).toBe('/settings');
    expect(normalizeSafeInternalRoute('/unknown')).toBeNull();
  });

  it('allows bounded invitation, organization, note, and reset-password routes', () => {
    expect(normalizeSafeInternalRoute('/invite/abc-123')).toBe('/invite/abc-123');
    expect(normalizeSafeInternalRoute('/organization/acme')).toBe('/organization/acme');
    expect(normalizeSafeInternalRoute('/notes')).toBe('/notes');
    expect(normalizeSafeInternalRoute('/notes/new')).toBe('/notes/new');
    expect(normalizeSafeInternalRoute('/notes/cm123abc')).toBe('/notes/cm123abc');
    expect(normalizeSafeInternalRoute('/reset-password?token=opaque_123')).toBe('/reset-password?token=opaque_123');
    expect(normalizeSafeInternalRoute('/reset-password?error=INVALID_TOKEN')).toBe('/reset-password?error=INVALID_TOKEN');
  });

  it('rejects note deep links with traversal, nesting, or query smuggling', () => {
    expect(normalizeSafeInternalRoute('/notes/a/b')).toBeNull();
    expect(normalizeSafeInternalRoute('/notes/cm123abc?token=secret')).toBeNull();
    expect(normalizeSafeInternalRoute('/notes/new?redirect=https://evil.example')).toBeNull();
    expect(normalizeSafeInternalRoute('/notes/..')).toBeNull();
    expect(normalizeSafeInternalRoute('/notes/.')).toBeNull();
  });

  it('rejects external, credential-bearing, malformed, and arbitrary redirects', () => {
    expect(normalizeSafeInternalRoute('https://evil.example/home')).toBeNull();
    expect(normalizeSafeInternalRoute('//evil.example/home')).toBeNull();
    expect(normalizeSafeInternalRoute('/invite/a/b')).toBeNull();
    expect(normalizeSafeInternalRoute('/reset-password?token=opaque&redirect=https://evil.example')).toBeNull();
    expect(normalizeSafeInternalRoute('/home?token=secret')).toBeNull();
  });

  it('keeps password recovery public while protecting application and invitation routes', () => {
    expect(requiresAuthenticatedSession('/reset-password?token=opaque_123')).toBe(false);
    expect(requiresAuthenticatedSession('/forgot-password')).toBe(false);
    expect(requiresAuthenticatedSession('/sign-in')).toBe(false);
    expect(requiresAuthenticatedSession('/invite/opaque_123')).toBe(true);
    expect(requiresAuthenticatedSession('/home')).toBe(true);
  });

  it('allows bounded marketplace nesting for catalog, booking flow, and account sections', () => {
    expect(normalizeSafeInternalRoute('/bookings')).toBe('/bookings');
    expect(normalizeSafeInternalRoute('/favorites')).toBe('/favorites');
    expect(normalizeSafeInternalRoute('/account')).toBe('/account');
    expect(normalizeSafeInternalRoute('/search')).toBe('/search');
    expect(normalizeSafeInternalRoute('/category/cleaning')).toBe('/category/cleaning');
    expect(normalizeSafeInternalRoute('/service/cm123abc')).toBe('/service/cm123abc');
    expect(normalizeSafeInternalRoute('/provider/cm123abc')).toBe('/provider/cm123abc');
    expect(normalizeSafeInternalRoute('/booking/cm123abc')).toBe('/booking/cm123abc');
    expect(normalizeSafeInternalRoute('/book/cm123abc/provider')).toBe('/book/cm123abc/provider');
    expect(normalizeSafeInternalRoute('/book/cm123abc/review')).toBe('/book/cm123abc/review');
    expect(normalizeSafeInternalRoute('/account/addresses')).toBe('/account/addresses');
    expect(normalizeSafeInternalRoute('/account/provider/availability')).toBe('/account/provider/availability');
  });

  it('rejects marketplace nesting abuse, unknown steps, and query smuggling', () => {
    expect(normalizeSafeInternalRoute('/book/cm123abc/evil')).toBeNull();
    expect(normalizeSafeInternalRoute('/book/cm123abc/provider/extra')).toBeNull();
    expect(normalizeSafeInternalRoute('/service/../secret')).toBeNull();
    expect(normalizeSafeInternalRoute('/service/cm123abc?token=secret')).toBeNull();
    expect(normalizeSafeInternalRoute('/booking/cm123abc?redirect=https://evil.example')).toBeNull();
    expect(normalizeSafeInternalRoute('/account/provider/availability?x=1')).toBeNull();
    expect(normalizeSafeInternalRoute('/unknown-root/cm123abc')).toBeNull();
  });
});
