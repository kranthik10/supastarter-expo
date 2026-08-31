import { describe, it, expect } from 'vitest';
import { publicEnvSchema } from './env';

describe('env validation', () => {
  it('validates public env', () => {
    expect(() => publicEnvSchema.parse({
      EXPO_PUBLIC_API_URL: 'https://api.example.com',
      EXPO_PUBLIC_APP_SCHEME: 'mobile-saas',
    })).not.toThrow();
  });
  it('rejects invalid url', () => {
    expect(() => publicEnvSchema.parse({
      EXPO_PUBLIC_API_URL: 'not-a-url',
    })).toThrow();
  });
  it('defaults work', () => {
    const parsed = publicEnvSchema.parse({});
    expect(parsed.EXPO_PUBLIC_API_URL).toBe('https://api.example.com');
    expect(parsed.EXPO_PUBLIC_APP_VARIANT).toBe('production');
  });
});
