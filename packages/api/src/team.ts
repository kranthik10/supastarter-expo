import { createHash, randomBytes } from 'node:crypto';

export type InvitationStatus = 'pending' | 'accepted' | 'revoked' | 'expired';
export type MemberRole = 'owner' | 'admin' | 'member';
export type GuardResult = { ok: true } | { ok: false; reason: string };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Generate a new invitation token. Existing persisted tokens remain valid. */
export function generateInvitationToken(): string {
  return randomBytes(32).toString('hex');
}

/** Return a SHA-256 digest for persistence/audit; never expose the raw bearer token. */
export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Store a one-way digest in the invitation token column. */
export function persistedInvitationToken(token: string): string {
  return hashInvitationToken(token);
}

export type PublicInvitationSource = {
  id: string;
  organizationId: string;
  email: string;
  role: MemberRole;
  token: string;
  status: InvitationStatus;
  expiresAt: Date | string;
  respondedAt: Date | string | null;
  createdAt: Date | string;
};

export function publicInvitation(row: PublicInvitationSource) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    email: row.email,
    role: row.role,
    status: row.status,
    expiresAt: row.expiresAt,
    respondedAt: row.respondedAt,
    createdAt: row.createdAt,
  };
}

export function invitationRequestState(status: InvitationStatus, expiresAt: Date | string, now = new Date()): 'pending' | 'expired' | 'not_pending' {
  if (status !== 'pending') return 'not_pending';
  return new Date(expiresAt) <= now ? 'expired' : 'pending';
}

export function canAcceptMember(limit: number | null | undefined, currentMemberCount: number): GuardResult {
  if (limit === null || limit === undefined) return { ok: true };
  return currentMemberCount < limit ? { ok: true } : { ok: false, reason: 'members_limit_reached' };
}

export function canRemoveMember(targetRole: MemberRole, ownerCount: number, isSelf: boolean): GuardResult {
  if (isSelf) return { ok: false, reason: 'cannot_remove_self' };
  if (targetRole === 'owner') {
    return ownerCount <= 1 ? { ok: false, reason: 'sole_owner_cannot_be_removed' } : { ok: false, reason: 'owner_transfer_required' };
  }
  return { ok: true };
}

export function canTransferOwnership(
  actorRole: MemberRole,
  targetUserId: string,
  actorUserId: string,
  targetExists: boolean,
  targetRole: MemberRole
): GuardResult {
  if (actorRole !== 'owner') return { ok: false, reason: 'owner_required' };
  if (targetUserId === actorUserId) return { ok: false, reason: 'cannot_transfer_to_self' };
  if (!targetExists) return { ok: false, reason: 'target_not_member' };
  if (targetRole === 'owner') return { ok: false, reason: 'target_already_owner' };
  return { ok: true };
}

export function canChangeMemberRole(actorRole: MemberRole, targetRole: MemberRole, newRole: MemberRole): GuardResult {
  if (actorRole !== 'owner') return { ok: false, reason: 'permission_required' };
  if (targetRole === 'owner' || newRole === 'owner') return { ok: false, reason: 'owner_transfer_required' };
  return { ok: true };
}

/**
 * Interim rate limiter for invitation abuse. It is intentionally process-local;
 * replace the implementation with Redis/Cloudflare for multi-replica deploys.
 */
export class InMemoryRateLimiter {
  private readonly hits = new Map<string, { startedAt: number; count: number }>();

  constructor(private readonly max: number, private readonly windowMs: number) {}

  consume(key: string, now = Date.now()): boolean {
    const current = this.hits.get(key);
    if (!current || now - current.startedAt >= this.windowMs) {
      this.hits.set(key, { startedAt: now, count: 1 });
      return true;
    }
    if (current.count >= this.max) return false;
    current.count += 1;
    return true;
  }

  clear(): void {
    this.hits.clear();
  }
}

export const invitationCreateRateLimiter = new InMemoryRateLimiter(5, 60_000);
export const invitationRedeemRateLimiter = new InMemoryRateLimiter(10, 60_000);
