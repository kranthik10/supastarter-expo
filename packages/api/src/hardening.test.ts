import { describe, expect, it } from 'vitest';
import { getAuthConfig } from './auth';
import { isDevAuthEnabled } from './context';
import { parseAllowedOrigins, resolveCorsOrigin, securityHeaders } from './http-security';

describe('production security configuration', () => {
  it('requires a non-default Better Auth secret', () => {
    expect(() => getAuthConfig({})).toThrow(/BETTER_AUTH_SECRET/);
    expect(() => getAuthConfig({ BETTER_AUTH_SECRET: 'too-short' })).toThrow(/32/);
    expect(getAuthConfig({ BETTER_AUTH_SECRET: 'a'.repeat(32), BETTER_AUTH_URL: 'https://auth.example.com', CORS_ALLOWED_ORIGINS: 'https://app.example.com' })).toEqual({
      secret: 'a'.repeat(32),
      baseURL: 'https://auth.example.com',
      trustedOrigins: ['https://app.example.com', 'mobile-saas://reset-password'],
    });
  });

  it('trusts only the configured mobile password-reset callback path', () => {
    const config = getAuthConfig({
      BETTER_AUTH_SECRET: 'a'.repeat(32),
      BETTER_AUTH_URL: 'https://auth.example.com',
      EXPO_PUBLIC_APP_SCHEME: 'mobile-saas-preview',
    });

    expect(config.trustedOrigins).toEqual(['mobile-saas-preview://reset-password']);
  });

  it('requires an explicit Better Auth URL in production', () => {
    expect(() => getAuthConfig({ BETTER_AUTH_SECRET: 'a'.repeat(32), NODE_ENV: 'production' })).toThrow(/BETTER_AUTH_URL/);
  });

  it('enables the dev auth bypass only with an explicit development flag', () => {
    expect(isDevAuthEnabled({ NODE_ENV: 'development', ENABLE_DEV_AUTH: 'true' })).toBe(true);
    expect(isDevAuthEnabled({ NODE_ENV: 'production', ENABLE_DEV_AUTH: 'true' })).toBe(false);
    expect(isDevAuthEnabled({ NODE_ENV: 'development' })).toBe(false);
  });

  it('allows only configured browser origins and preserves native requests', () => {
    const origins = parseAllowedOrigins('https://app.example.com, http://localhost:8081');
    expect(origins).toEqual(['https://app.example.com', 'http://localhost:8081']);
    expect(resolveCorsOrigin('https://app.example.com', origins)).toBe('https://app.example.com');
    expect(resolveCorsOrigin('https://evil.example.com', origins)).toBeUndefined();
    expect(resolveCorsOrigin(undefined, origins)).toBeUndefined();
  });

  it('defines safe HTTP response headers', () => {
    expect(securityHeaders['X-Content-Type-Options']).toBe('nosniff');
    expect(securityHeaders['X-Frame-Options']).toBe('DENY');
    expect(securityHeaders['Content-Security-Policy']).toContain("default-src 'none'");
  });
});
