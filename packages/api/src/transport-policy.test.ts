import { describe, expect, it, vi } from 'vitest';
import { containsUnauthorizedTRPCError, createSessionAwareFetch, isForbiddenError } from './transport-policy';

describe('tRPC authentication transport policy', () => {
  it('detects a genuine unauthorized response including batched payloads', () => {
    expect(containsUnauthorizedTRPCError(401, null)).toBe(true);
    expect(
      containsUnauthorizedTRPCError(207, [
        { result: { data: { value: 1 } } },
        { error: { data: { code: 'UNAUTHORIZED', httpStatus: 401 } } },
      ])
    ).toBe(true);
  });

  it('does not invalidate the session for authorization, domain, server, or network-shaped failures', () => {
    expect(containsUnauthorizedTRPCError(403, { error: { data: { code: 'FORBIDDEN' } } })).toBe(false);
    expect(containsUnauthorizedTRPCError(404, { error: { data: { code: 'NOT_FOUND' } } })).toBe(false);
    expect(containsUnauthorizedTRPCError(409, { error: { data: { code: 'CONFLICT' } } })).toBe(false);
    expect(containsUnauthorizedTRPCError(500, { error: { data: { code: 'INTERNAL_SERVER_ERROR' } } })).toBe(false);
    expect(containsUnauthorizedTRPCError(200, { result: { data: { code: 'UNAUTHORIZED' } } })).toBe(false);
    expect(containsUnauthorizedTRPCError(0, null)).toBe(false);
  });

  it('detects forbidden errors without matching other failure shapes', () => {
    expect(isForbiddenError({ data: { code: 'FORBIDDEN' } })).toBe(true);
    expect(isForbiddenError({ shape: { data: { code: 'FORBIDDEN' } } })).toBe(true);
    expect(isForbiddenError({ data: { code: 'NOT_FOUND' } })).toBe(false);
    expect(isForbiddenError({ data: { code: 'UNAUTHORIZED' } })).toBe(false);
    expect(isForbiddenError(new Error('boom'))).toBe(false);
    expect(isForbiddenError(null)).toBe(false);
  });

  it('notifies once after a parsed unauthorized transport response and returns the original response', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { data: { code: 'UNAUTHORIZED' } } }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    );
    const sessionAwareFetch = createSessionAwareFetch(fetchImpl, onUnauthorized);

    const response = await sessionAwareFetch('https://api.example.test/api/trpc');

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: { data: { code: 'UNAUTHORIZED' } } });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('passes the request authorization identity so stale sessions cannot log out a new user', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }));
    const sessionAwareFetch = createSessionAwareFetch(fetchImpl, onUnauthorized);

    await sessionAwareFetch('https://api.example.test/api/trpc', {
      headers: { Authorization: 'Bearer token-a' },
    });

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(onUnauthorized).toHaveBeenCalledWith({ authorization: 'Bearer token-a' });
  });

  it('normalizes a missing request authorization identity to null', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }));
    const sessionAwareFetch = createSessionAwareFetch(fetchImpl, onUnauthorized);

    await sessionAwareFetch('https://api.example.test/api/trpc');

    expect(onUnauthorized).toHaveBeenCalledWith({ authorization: null });
  });
});
