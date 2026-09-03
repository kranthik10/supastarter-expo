import { describe, expect, it } from 'vitest';
import { normalizeSafeInternalRoute, requiresAuthenticatedSession } from './navigation-policy';

describe('safe internal navigation policy', () => {
  it('allows only known static application routes', () => {
    expect(normalizeSafeInternalRoute('/home')).toBe('/home');
    expect(normalizeSafeInternalRoute('/settings?section=security')).toBe('/settings');
    expect(normalizeSafeInternalRoute('/unknown')).toBeNull();
  });

  it('allows bounded invitation, organization, and reset-password routes', () => {
    expect(normalizeSafeInternalRoute('/invite/abc-123')).toBe('/invite/abc-123');
    expect(normalizeSafeInternalRoute('/organization/acme')).toBe('/organization/acme');
    expect(normalizeSafeInternalRoute('/reset-password?token=opaque_123')).toBe('/reset-password?token=opaque_123');
    expect(normalizeSafeInternalRoute('/reset-password?error=INVALID_TOKEN')).toBe('/reset-password?error=INVALID_TOKEN');
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
});
