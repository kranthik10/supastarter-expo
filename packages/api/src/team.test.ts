import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  generateInvitationToken,
  hashInvitationToken,
  persistedInvitationToken,
  publicInvitation,
  invitationRequestState,
  canAcceptMember,
  canRemoveMember,
  canTransferOwnership,
  canChangeMemberRole,
  InMemoryRateLimiter,
} from './team';
import { appRouter } from './router';

describe('team invitation security primitives', () => {
  it('normalizes email by trimming and lowercasing', () => {
    expect(normalizeEmail('  User@Example.COM ')).toBe('user@example.com');
  });

  it('generates unique cryptographically random tokens and hashes are not raw tokens', () => {
    const first = generateInvitationToken();
    const second = generateInvitationToken();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
    expect(hashInvitationToken(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashInvitationToken(first)).not.toBe(first);
  });

  it('uses a digest for persistence and never projects the bearer token', () => {
    const token = 'a'.repeat(64);
    const projected = publicInvitation({
      id: 'inv-1',
      organizationId: 'org-1',
      email: 'person@example.com',
      role: 'member',
      token: persistedInvitationToken(token),
      status: 'pending',
      expiresAt: new Date('2026-09-10T00:00:00Z'),
      respondedAt: null,
      createdAt: new Date('2026-09-01T00:00:00Z'),
    });
    expect(persistedInvitationToken(token)).toBe(hashInvitationToken(token));
    expect(projected).not.toHaveProperty('token');
    expect(projected.email).toBe('person@example.com');
  });
  it('rejects non-pending, expired, and validly accepts pending invitations', () => {
    const now = new Date('2026-09-01T12:00:00Z');
    expect(invitationRequestState('accepted', new Date('2026-09-10T00:00:00Z'), now)).toBe('not_pending');
    expect(invitationRequestState('revoked', new Date('2026-09-10T00:00:00Z'), now)).toBe('not_pending');
    expect(invitationRequestState('pending', new Date('2026-08-31T00:00:00Z'), now)).toBe('expired');
    expect(invitationRequestState('pending', new Date('2026-09-10T00:00:00Z'), now)).toBe('pending');
  });

  it('enforces member limit while allowing unlimited null', () => {
    expect(canAcceptMember(2, 1)).toEqual({ ok: true });
    expect(canAcceptMember(2, 2)).toEqual({ ok: false, reason: 'members_limit_reached' });
    expect(canAcceptMember(null, 1000)).toEqual({ ok: true });
    expect(canAcceptMember(0, 0)).toEqual({ ok: false, reason: 'members_limit_reached' });
  });

  it('protects the sole owner and self-removal', () => {
    expect(canRemoveMember('owner', 1, false)).toEqual({ ok: false, reason: 'sole_owner_cannot_be_removed' });
    expect(canRemoveMember('owner', 2, false)).toEqual({ ok: false, reason: 'owner_transfer_required' });
    expect(canRemoveMember('admin', 1, false)).toEqual({ ok: true });
    expect(canRemoveMember('member', 1, true)).toEqual({ ok: false, reason: 'cannot_remove_self' });
  });

  it('requires an existing non-self member for ownership transfer', () => {
    expect(canTransferOwnership('owner', 'u2', 'u1', true, 'admin')).toEqual({ ok: true });
    expect(canTransferOwnership('admin', 'u2', 'u1', true, 'member')).toEqual({ ok: false, reason: 'owner_required' });
    expect(canTransferOwnership('owner', 'u1', 'u1', true, 'admin')).toEqual({ ok: false, reason: 'cannot_transfer_to_self' });
    expect(canTransferOwnership('owner', 'u2', 'u1', false, 'member')).toEqual({ ok: false, reason: 'target_not_member' });
    expect(canTransferOwnership('owner', 'u2', 'u1', true, 'owner')).toEqual({ ok: false, reason: 'target_already_owner' });
  });

  it('does not let ordinary role updates create owners', () => {
    expect(canChangeMemberRole('owner', 'member', 'admin')).toEqual({ ok: true });
    expect(canChangeMemberRole('admin', 'member', 'admin')).toEqual({ ok: false, reason: 'permission_required' });
    expect(canChangeMemberRole('owner', 'owner', 'admin')).toEqual({ ok: false, reason: 'owner_transfer_required' });
    expect(canChangeMemberRole('owner', 'member', 'owner')).toEqual({ ok: false, reason: 'owner_transfer_required' });
  });
});

describe('invitation rate limiting', () => {
  it('limits requests in a window and permits after expiry', () => {
    const limiter = new InMemoryRateLimiter(2, 100);
    expect(limiter.consume('user:create', 1_000)).toBe(true);
    expect(limiter.consume('user:create', 1_001)).toBe(true);
    expect(limiter.consume('user:create', 1_002)).toBe(false);
    expect(limiter.consume('user:create', 1_101)).toBe(true);
  });
});

describe('team API contract and billing security regression', () => {
  it('exposes the required team/invitation procedures', () => {
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures).toHaveProperty('members.list');
    expect(procedures).toHaveProperty('members.invite');
    expect(procedures).toHaveProperty('members.updateRole');
    expect(procedures).toHaveProperty('members.remove');
    expect(procedures).toHaveProperty('invitations.create');
    expect(procedures).toHaveProperty('invitations.list');
    expect(procedures).toHaveProperty('invitations.accept');
    expect(procedures).toHaveProperty('invitations.decline');
    expect(procedures).toHaveProperty('invitations.revoke');
    expect(procedures).toHaveProperty('organizations.transferOwnership');
  });

  it('does not allow a billing owner to mutate even the free subscription through the client procedure', async () => {
    let writes = 0;
    const fakeDb = {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [{ role: 'owner' }] }),
        }),
      }),
      insert: () => {
        writes += 1;
        throw new Error('write should not happen');
      },
      update: () => {
        writes += 1;
        throw new Error('write should not happen');
      },
    } as any;
    const caller = appRouter.createCaller({
      db: fakeDb,
      user: { id: 'owner-1', email: 'owner@example.com', emailVerified: true, name: 'Owner', image: null } as any,
      sessionId: 'session-1',
      headers: {},
    });

    for (const planId of ['pro', 'enterprise', 'free'] as const) {
      await expect(caller.billing.updateSubscription({ organizationId: 'org-1', planId })).rejects.toMatchObject({
        code: 'PRECONDITION_FAILED',
      });
    }
    expect(writes).toBe(0);
  });
});
