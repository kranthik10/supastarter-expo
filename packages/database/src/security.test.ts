import { describe, expect, it } from 'vitest';
import { getDatabaseUrl } from './index';

describe('database configuration', () => {
  it('requires DATABASE_URL instead of silently using a local fallback', () => {
    expect(() => getDatabaseUrl({})).toThrow(/DATABASE_URL/);
    expect(getDatabaseUrl({ DATABASE_URL: 'postgres://example' })).toBe('postgres://example');
  });
});
