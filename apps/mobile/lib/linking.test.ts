import { describe, expect, it } from 'vitest';
import { deepLinkPathFromParsedUrl, routeFromDeepLinkParts } from './linking-policy';

describe('mobile deep-link parsing policy', () => {
  it('reconstructs custom-scheme host and path while rejecting foreign schemes', () => {
    expect(deepLinkPathFromParsedUrl('mobile-saas', 'invite', 'opaque_invite', 'mobile-saas')).toBe(
      'invite/opaque_invite'
    );
    expect(deepLinkPathFromParsedUrl('mobile-saas', 'reset-password', null, 'mobile-saas')).toBe(
      'reset-password'
    );
    expect(deepLinkPathFromParsedUrl('https', 'evil.example', 'home', 'mobile-saas')).toBeNull();
  });

  it('preserves safe invitation and reset-password credentials only in their intended routes', () => {
    expect(routeFromDeepLinkParts('invite/opaque_invite', {})).toBe('/invite/opaque_invite');
    expect(routeFromDeepLinkParts('reset-password', { token: 'opaque_reset' })).toBe(
      '/reset-password?token=opaque_reset'
    );
    expect(routeFromDeepLinkParts('reset-password', { error: 'INVALID_TOKEN' })).toBe(
      '/reset-password?error=INVALID_TOKEN'
    );
  });

  it('routes bare note list and detail paths through the same safe policy', () => {
    expect(routeFromDeepLinkParts('notes', {})).toBe('/notes');
    expect(routeFromDeepLinkParts('notes/new', {})).toBe('/notes/new');
    expect(routeFromDeepLinkParts('notes/cm123abc', {})).toBe('/notes/cm123abc');
    expect(routeFromDeepLinkParts('notes/cm123abc', { token: 'secret' })).toBeNull();
  });

  it('rejects unknown, malformed, and credential-bearing unrelated routes', () => {
    expect(routeFromDeepLinkParts('unknown', {})).toBeNull();
    expect(routeFromDeepLinkParts('home', { token: 'opaque_reset' })).toBeNull();
    expect(routeFromDeepLinkParts('https://evil.example/home', {})).toBeNull();
  });
});
