import { describe, expect, it } from 'vitest';
import { extractSessionToken, parsePersistedSession } from './security';

describe('auth session security helpers', () => {
  it('extracts the Better Auth sessionToken response and rejects malformed values', () => {
    expect(extractSessionToken({ sessionToken: 'session-token-123' })).toBe('session-token-123');
    expect(extractSessionToken({ sessionToken: '' })).toBeNull();
    expect(extractSessionToken({ token: 'legacy-token' })).toBe('legacy-token');
    expect(extractSessionToken(null)).toBeNull();
  });

  it('accepts only persisted records with a user and session token', () => {
    expect(parsePersistedSession(JSON.stringify({ user: { id: 'u1' }, sessionToken: 's1' }))).toEqual({
      user: { id: 'u1' },
      sessionToken: 's1',
    });
    expect(parsePersistedSession(JSON.stringify({ user: { id: 'u1' } }))).toBeNull();
    expect(parsePersistedSession('{broken')).toBeNull();
  });
});
