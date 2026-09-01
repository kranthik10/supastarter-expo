import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import superjson from 'superjson';
import type { ApiContext } from './context';
import { getDb } from '@repo/database';
import { auditLogs, invitations, organizations, organizationMembers, subscriptions, users } from '@repo/database';
import { and, desc, eq, lte, sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { assertCan } from '@repo/permissions';
import { getEntitlement, listEntitlements, syncEntitlementsForPlan } from '@repo/billing/entitlements.server';
import {
  canAcceptMember,
  canChangeMemberRole,
  canRemoveMember,
  canTransferOwnership,
  generateInvitationToken,
  hashInvitationToken,
  invitationCreateRateLimiter,
  invitationRedeemRateLimiter,
  invitationRequestState,
  normalizeEmail,
  type MemberRole,
} from './team';
import { getInvitationEmailProvider } from './email';

const t = initTRPC.context<ApiContext>().create({ transformer: superjson });

export const middleware = t.middleware;
export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

function requirePermission(role: MemberRole, permission: Parameters<typeof assertCan>[1]): void {
  try {
    assertCan(role as never, permission as never);
  } catch {
    throw new TRPCError({ code: 'FORBIDDEN', message: `Forbidden: missing ${permission}` });
  }
}

function reasonError(reason: string, code: 'CONFLICT' | 'PRECONDITION_FAILED' | 'FORBIDDEN' = 'PRECONDITION_FAILED'): never {
  throw new TRPCError({ code, message: reason });
}

async function writeAudit(
  db: any,
  input: {
    organizationId: string | null;
    userId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await db.insert(auditLogs).values({
    id: createId(),
    organizationId: input.organizationId,
    userId: input.userId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata ?? null,
  });
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === '23505';
}

async function expirePendingInvitations(db: any, organizationId: string, now: Date): Promise<void> {
  const expired = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.organizationId, organizationId), eq(invitations.status, 'pending'), lte(invitations.expiresAt, now)));

  for (const invitation of expired) {
    await db
      .update(invitations)
      .set({ status: 'expired', respondedAt: now })
      .where(and(eq(invitations.id, invitation.id), eq(invitations.status, 'pending')));
    await writeAudit(db, {
      organizationId,
      userId: null,
      action: 'invitation.expired',
      targetType: 'invitation',
      targetId: invitation.id,
      metadata: { email: invitation.email },
    });
  }
}

async function createInvitation(
  db: any,
  input: { organizationId: string; email: string; role: Exclude<MemberRole, 'owner'> },
  actor: { id: string; role: MemberRole }
) {
  requirePermission(actor.role, 'members.invite');
  if (!invitationCreateRateLimiter.consume(`${actor.id}:create`)) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'invitation_rate_limited' });
  }

  const email = normalizeEmail(input.email);
  const [organization] = await db.select().from(organizations).where(eq(organizations.id, input.organizationId)).limit(1);
  if (!organization) throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });

  const [existingMember] = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(and(eq(organizationMembers.organizationId, input.organizationId), sql`lower(${users.email}) = ${email}`))
    .limit(1);
  if (existingMember) reasonError('already_member', 'CONFLICT');

  const [pending] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.organizationId, input.organizationId),
        eq(invitations.status, 'pending'),
        sql`lower(${invitations.email}) = ${email}`
      )
    )
    .limit(1);
  if (pending) reasonError('pending_invitation_exists', 'CONFLICT');

  const token = generateInvitationToken();
  let invitation: typeof invitations.$inferSelect;
  try {
    invitation = await db.transaction(async (tx: any) => {
      const [created] = await tx
        .insert(invitations)
        .values({
          id: createId(),
          organizationId: input.organizationId,
          email,
          role: input.role,
          token,
          invitedBy: actor.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          status: 'pending',
        })
        .returning();
      await writeAudit(tx, {
        organizationId: input.organizationId,
        userId: actor.id,
        action: 'invitation.created',
        targetType: 'invitation',
        targetId: created.id,
        metadata: { email, role: input.role, tokenHash: hashInvitationToken(token) },
      });
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error)) reasonError('pending_invitation_exists', 'CONFLICT');
    throw error;
  }

  let delivery: Awaited<ReturnType<ReturnType<typeof getInvitationEmailProvider>['sendInvitation']>>;
  try {
    delivery = await getInvitationEmailProvider().sendInvitation({ to: email, organizationName: organization.name, token });
  } catch {
    delivery = { delivered: false, status: 'failed' };
  }

  return {
    invitation,
    emailDelivered: delivery.delivered,
    emailStatus: delivery.status,
  };
}

export const appRouter = router({
  health: router({
    check: publicProcedure.query(() => ({ ok: true, ts: new Date().toISOString() })),
  }),

  users: router({
    me: protectedProcedure.query(({ ctx }) => {
      return { id: ctx.user!.id, email: ctx.user!.email, name: ctx.user!.name, image: ctx.user!.image };
    }),
  }),

  organizations: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      try {
        const db = ctx.db ?? getDb();
        const memberships = await db
          .select({ org: organizations })
          .from(organizationMembers)
          .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
          .where(eq(organizationMembers.userId, ctx.user!.id));
        return memberships.map((m) => m.org);
      } catch {
        if (ctx.user!.id === 'u_dev') return [{ id: 'org_demo', name: 'Demo Organization', slug: 'demo', logoUrl: null, createdAt: new Date(), updatedAt: new Date() }];
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      }
    }),

    create: protectedProcedure
      .input(z.object({ name: z.string().min(2), slug: z.string().min(2).regex(/^[a-z0-9-]+$/) }))
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const id = createId();
        await db.transaction(async (tx) => {
          await tx.insert(organizations).values({ id, name: input.name, slug: input.slug });
          await tx.insert(organizationMembers).values({ id: createId(), organizationId: id, userId: ctx.user!.id, role: 'owner' });
          await syncEntitlementsForPlan(tx, id, 'free');
        });
        const [row] = await db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
        return row;
      }),

    get: protectedProcedure.input(z.object({ slug: z.string() })).query(async ({ ctx, input }) => {
      const db = ctx.db ?? getDb();
      const [org] = await db.select().from(organizations).where(eq(organizations.slug, input.slug)).limit(1);
      if (!org) throw new TRPCError({ code: 'NOT_FOUND' });
      const [member] = await db
        .select()
        .from(organizationMembers)
        .where(and(eq(organizationMembers.organizationId, org.id), eq(organizationMembers.userId, ctx.user!.id)))
        .limit(1);
      if (!member) throw new TRPCError({ code: 'FORBIDDEN' });
      return org;
    }),

    update: protectedProcedure
      .input(z.object({ organizationId: z.string(), name: z.string().min(2).optional(), slug: z.string().min(2).optional() }))
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const [member] = await db
          .select()
          .from(organizationMembers)
          .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
          .limit(1);
        if (!member) throw new TRPCError({ code: 'FORBIDDEN' });
        requirePermission(member.role as MemberRole, 'organization.update');
        await db
          .update(organizations)
          .set({ ...(input.name ? { name: input.name } : {}), ...(input.slug ? { slug: input.slug } : {}), updatedAt: new Date() })
          .where(eq(organizations.id, input.organizationId));
        const [row] = await db.select().from(organizations).where(eq(organizations.id, input.organizationId)).limit(1);
        return row;
      }),

    transferOwnership: protectedProcedure
      .input(z.object({ organizationId: z.string(), targetUserId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const result = await db.transaction(async (tx) => {
          const [actor] = await tx
            .select()
            .from(organizationMembers)
            .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
            .limit(1);
          if (!actor) throw new TRPCError({ code: 'FORBIDDEN' });
          const [target] = await tx
            .select()
            .from(organizationMembers)
            .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, input.targetUserId)))
            .limit(1);
          const guard = canTransferOwnership(
            actor.role as MemberRole,
            input.targetUserId,
            ctx.user!.id,
            Boolean(target),
            (target?.role ?? 'member') as MemberRole
          );
          if (!guard.ok) reasonError(guard.reason, guard.reason === 'owner_required' ? 'FORBIDDEN' : 'PRECONDITION_FAILED');
          await tx
            .update(organizationMembers)
            .set({ role: 'admin' })
            .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)));
          await tx
            .update(organizationMembers)
            .set({ role: 'owner' })
            .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, input.targetUserId)));
          await writeAudit(tx, {
            organizationId: input.organizationId,
            userId: ctx.user!.id,
            action: 'organization.ownership_transferred',
            targetType: 'organization',
            targetId: input.organizationId,
            metadata: { oldOwnerId: ctx.user!.id, newOwnerId: input.targetUserId },
          });
          return { ok: true as const, oldOwnerId: ctx.user!.id, newOwnerId: input.targetUserId };
        });
        return result;
      }),
  }),

  members: router({
    list: protectedProcedure.input(z.object({ organizationId: z.string() })).query(async ({ ctx, input }) => {
      const db = ctx.db ?? getDb();
      const [actor] = await db
        .select()
        .from(organizationMembers)
        .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
        .limit(1);
      if (!actor) throw new TRPCError({ code: 'FORBIDDEN' });
      requirePermission(actor.role as MemberRole, 'members.read');
      const rows = await db
        .select({ membership: organizationMembers, user: { id: users.id, name: users.name, email: users.email, image: users.image } })
        .from(organizationMembers)
        .innerJoin(users, eq(users.id, organizationMembers.userId))
        .where(eq(organizationMembers.organizationId, input.organizationId));
      return rows.map((row) => ({
        organizationId: input.organizationId,
        user: row.user,
        role: row.membership.role,
        joinedAt: row.membership.createdAt,
      }));
    }),

    invite: protectedProcedure
      .input(z.object({ organizationId: z.string(), email: z.string().trim().email(), role: z.enum(['member', 'admin']).default('member') }))
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const [actor] = await db
          .select()
          .from(organizationMembers)
          .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
          .limit(1);
        if (!actor) throw new TRPCError({ code: 'FORBIDDEN' });
        return createInvitation(db, input, { id: ctx.user!.id, role: actor.role as MemberRole });
      }),

    updateRole: protectedProcedure
      .input(z.object({ organizationId: z.string(), userId: z.string(), role: z.enum(['owner', 'admin', 'member']) }))
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        return db.transaction(async (tx: any) => {
          const [actor] = await tx
            .select()
            .from(organizationMembers)
            .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
            .limit(1);
          if (!actor) throw new TRPCError({ code: 'FORBIDDEN' });
          requirePermission(actor.role as MemberRole, 'members.update');
          const [target] = await tx
            .select()
            .from(organizationMembers)
            .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, input.userId)))
            .limit(1);
          if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'member_not_found' });
          const guard = canChangeMemberRole(actor.role as MemberRole, target.role as MemberRole, input.role as MemberRole);
          if (!guard.ok) reasonError(guard.reason);
          await tx
            .update(organizationMembers)
            .set({ role: input.role as 'admin' | 'member' })
            .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, input.userId)));
          await writeAudit(tx, {
            organizationId: input.organizationId,
            userId: ctx.user!.id,
            action: 'member.role_updated',
            targetType: 'member',
            targetId: input.userId,
            metadata: { role: input.role },
          });
          return { ok: true as const };
        });
      }),

    remove: protectedProcedure
      .input(z.object({ organizationId: z.string(), userId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const result = await db.transaction(async (tx) => {
          const [actor] = await tx
            .select()
            .from(organizationMembers)
            .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
            .limit(1);
          if (!actor) throw new TRPCError({ code: 'FORBIDDEN' });
          requirePermission(actor.role as MemberRole, 'members.remove');
          const [target] = await tx
            .select()
            .from(organizationMembers)
            .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, input.userId)))
            .limit(1);
          if (!target) throw new TRPCError({ code: 'NOT_FOUND', message: 'member_not_found' });
          const [{ ownerCount }] = await tx
            .select({ ownerCount: sql<number>`count(*)` })
            .from(organizationMembers)
            .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.role, 'owner')));
          const guard = canRemoveMember(target.role as MemberRole, Number(ownerCount), input.userId === ctx.user!.id);
          if (!guard.ok) reasonError(guard.reason);
          await tx
            .delete(organizationMembers)
            .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, input.userId)));
          await writeAudit(tx, {
            organizationId: input.organizationId,
            userId: ctx.user!.id,
            action: 'member.removed',
            targetType: 'member',
            targetId: input.userId,
            metadata: { role: target.role },
          });
          return { ok: true as const };
        });
        return result;
      }),
  }),

  invitations: router({
    create: protectedProcedure
      .input(z.object({ organizationId: z.string(), email: z.string().trim().email(), role: z.enum(['member', 'admin']).default('member') }))
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const [actor] = await db
          .select()
          .from(organizationMembers)
          .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
          .limit(1);
        if (!actor) throw new TRPCError({ code: 'FORBIDDEN' });
        return createInvitation(db, input, { id: ctx.user!.id, role: actor.role as MemberRole });
      }),

    list: protectedProcedure
      .input(z.object({ organizationId: z.string() }))
      .query(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const [actor] = await db
          .select()
          .from(organizationMembers)
          .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
          .limit(1);
        if (!actor) throw new TRPCError({ code: 'FORBIDDEN' });
        requirePermission(actor.role as MemberRole, 'members.read');
        const now = new Date();
        await expirePendingInvitations(db, input.organizationId, now);
        return db
          .select({
            id: invitations.id,
            organizationId: invitations.organizationId,
            email: invitations.email,
            role: invitations.role,
            status: invitations.status,
            expiresAt: invitations.expiresAt,
            createdAt: invitations.createdAt,
          })
          .from(invitations)
          .where(and(eq(invitations.organizationId, input.organizationId), eq(invitations.status, 'pending')))
          .orderBy(desc(invitations.createdAt));
      }),

    accept: protectedProcedure
      .input(z.object({ token: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!invitationRedeemRateLimiter.consume(`${ctx.user!.id}:accept`)) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'invitation_rate_limited' });
        }
        const db = ctx.db ?? getDb();
        const result = await db.transaction(async (tx: any) => {
          const [invitation] = await tx.select().from(invitations).where(eq(invitations.token, input.token)).limit(1);
          if (!invitation) throw new TRPCError({ code: 'NOT_FOUND', message: 'invitation_not_found' });
          const state = invitationRequestState(invitation.status, invitation.expiresAt, new Date());
          if (state === 'not_pending') reasonError('invitation_not_pending');
          if (state === 'expired') {
            const now = new Date();
            const [expired] = await tx
              .update(invitations)
              .set({ status: 'expired', respondedAt: now })
              .where(and(eq(invitations.id, invitation.id), eq(invitations.status, 'pending')))
              .returning();
            if (expired) {
              await writeAudit(tx, {
                organizationId: invitation.organizationId,
                userId: ctx.user!.id,
                action: 'invitation.expired',
                targetType: 'invitation',
                targetId: invitation.id,
                metadata: { email: invitation.email },
              });
            }
            return { kind: 'expired' as const };
          }
          if (!ctx.user!.emailVerified) reasonError('email_not_verified', 'FORBIDDEN');
          if (normalizeEmail(ctx.user!.email) !== normalizeEmail(invitation.email)) reasonError('invitation_email_mismatch', 'FORBIDDEN');

          const [existingMember] = await tx
            .select()
            .from(organizationMembers)
            .where(and(eq(organizationMembers.organizationId, invitation.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
            .limit(1);
          if (existingMember) reasonError('already_member', 'CONFLICT');

          const [{ memberCount }] = await tx
            .select({ memberCount: sql<number>`count(*)` })
            .from(organizationMembers)
            .where(eq(organizationMembers.organizationId, invitation.organizationId));
          const entitlement = await getEntitlement(tx, invitation.organizationId, 'members.limit');
          const capacity = entitlement && !entitlement.enabled ? { ok: false as const, reason: 'members_limit_reached' } : canAcceptMember(entitlement?.limit, Number(memberCount));
          if (!capacity.ok) reasonError(capacity.reason);

          try {
            await tx.insert(organizationMembers).values({
              id: createId(),
              organizationId: invitation.organizationId,
              userId: ctx.user!.id,
              role: invitation.role,
            });
            const [updated] = await tx
              .update(invitations)
              .set({ status: 'accepted', respondedAt: new Date() })
              .where(and(eq(invitations.id, invitation.id), eq(invitations.status, 'pending')))
              .returning();
            if (!updated) reasonError('invitation_not_pending');
            await writeAudit(tx, {
              organizationId: invitation.organizationId,
              userId: ctx.user!.id,
              action: 'invitation.accepted',
              targetType: 'invitation',
              targetId: invitation.id,
              metadata: { email: invitation.email, role: invitation.role, tokenHash: hashInvitationToken(input.token) },
            });
            return { kind: 'accepted' as const, organizationId: invitation.organizationId, role: invitation.role };
          } catch (error) {
            if (isUniqueViolation(error)) reasonError('already_member', 'CONFLICT');
            throw error;
          }
        });
        if (result.kind === 'expired') reasonError('invitation_expired');
        return { ok: true as const, organizationId: result.organizationId, role: result.role };
      }),

    decline: protectedProcedure
      .input(z.object({ token: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        if (!invitationRedeemRateLimiter.consume(`${ctx.user!.id}:decline`)) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'invitation_rate_limited' });
        }
        const db = ctx.db ?? getDb();
        const result = await db.transaction(async (tx: any) => {
          const [invitation] = await tx.select().from(invitations).where(eq(invitations.token, input.token)).limit(1);
          if (!invitation) throw new TRPCError({ code: 'NOT_FOUND', message: 'invitation_not_found' });
          const state = invitationRequestState(invitation.status, invitation.expiresAt, new Date());
          if (state === 'not_pending') reasonError('invitation_not_pending');
          if (state === 'expired') {
            const now = new Date();
            const [expired] = await tx
              .update(invitations)
              .set({ status: 'expired', respondedAt: now })
              .where(and(eq(invitations.id, invitation.id), eq(invitations.status, 'pending')))
              .returning();
            if (expired) {
              await writeAudit(tx, {
                organizationId: invitation.organizationId,
                userId: ctx.user!.id,
                action: 'invitation.expired',
                targetType: 'invitation',
                targetId: invitation.id,
                metadata: { email: invitation.email },
              });
            }
            return { kind: 'expired' as const };
          }
          if (!ctx.user!.emailVerified) reasonError('email_not_verified', 'FORBIDDEN');
          if (normalizeEmail(ctx.user!.email) !== normalizeEmail(invitation.email)) reasonError('invitation_email_mismatch', 'FORBIDDEN');
          const [updated] = await tx
            .update(invitations)
            .set({ status: 'revoked', respondedAt: new Date() })
            .where(and(eq(invitations.id, invitation.id), eq(invitations.status, 'pending')))
            .returning();
          if (!updated) reasonError('invitation_not_pending');
          await writeAudit(tx, {
            organizationId: invitation.organizationId,
            userId: ctx.user!.id,
            action: 'invitation.declined',
            targetType: 'invitation',
            targetId: invitation.id,
            metadata: { reason: 'declined', email: invitation.email, tokenHash: hashInvitationToken(input.token) },
          });
          return { kind: 'declined' as const };
        });
        if (result.kind === 'expired') reasonError('invitation_expired');
        return { ok: true as const };
      }),

    revoke: protectedProcedure
      .input(z.object({ organizationId: z.string(), invitationId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const result = await db.transaction(async (tx: any) => {
          const [actor] = await tx
            .select()
            .from(organizationMembers)
            .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
            .limit(1);
          if (!actor) throw new TRPCError({ code: 'FORBIDDEN' });
          requirePermission(actor.role as MemberRole, 'members.invite');
          const [invitation] = await tx
            .select()
            .from(invitations)
            .where(and(eq(invitations.id, input.invitationId), eq(invitations.organizationId, input.organizationId)))
            .limit(1);
          if (!invitation) throw new TRPCError({ code: 'NOT_FOUND', message: 'invitation_not_found' });
          const state = invitationRequestState(invitation.status, invitation.expiresAt, new Date());
          if (state === 'not_pending') reasonError('invitation_not_pending');
          if (state === 'expired') {
            const now = new Date();
            const [expired] = await tx
              .update(invitations)
              .set({ status: 'expired', respondedAt: now })
              .where(and(eq(invitations.id, invitation.id), eq(invitations.status, 'pending')))
              .returning();
            if (expired) {
              await writeAudit(tx, {
                organizationId: input.organizationId,
                userId: ctx.user!.id,
                action: 'invitation.expired',
                targetType: 'invitation',
                targetId: invitation.id,
                metadata: { email: invitation.email },
              });
            }
            return { kind: 'expired' as const };
          }
          const [updated] = await tx
            .update(invitations)
            .set({ status: 'revoked', respondedAt: new Date() })
            .where(and(eq(invitations.id, invitation.id), eq(invitations.status, 'pending')))
            .returning();
          if (!updated) reasonError('invitation_not_pending');
          await writeAudit(tx, {
            organizationId: input.organizationId,
            userId: ctx.user!.id,
            action: 'invitation.revoked',
            targetType: 'invitation',
            targetId: invitation.id,
            metadata: { email: invitation.email, role: invitation.role },
          });
          return { kind: 'revoked' as const };
        });
        if (result.kind === 'expired') reasonError('invitation_expired');
        return { ok: true as const };
      }),
  }),

  billing: router({
    getSubscription: protectedProcedure
      .input(z.object({ organizationId: z.string() }))
      .query(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const [member] = await db
          .select()
          .from(organizationMembers)
          .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
          .limit(1);
        if (!member) throw new TRPCError({ code: 'FORBIDDEN' });
        requirePermission(member.role as MemberRole, 'billing.read');
        const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, input.organizationId)).limit(1);
        return sub ?? null;
      }),

    listEntitlements: protectedProcedure
      .input(z.object({ organizationId: z.string() }))
      .query(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const [member] = await db
          .select()
          .from(organizationMembers)
          .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
          .limit(1);
        if (!member) throw new TRPCError({ code: 'FORBIDDEN' });
        requirePermission(member.role as MemberRole, 'billing.read');
        return listEntitlements(db, input.organizationId);
      }),

    getEntitlement: protectedProcedure
      .input(z.object({ organizationId: z.string(), feature: z.enum(['projects.limit', 'members.limit', 'storage.gb', 'ai.tokens']) }))
      .query(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const [member] = await db
          .select()
          .from(organizationMembers)
          .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
          .limit(1);
        if (!member) throw new TRPCError({ code: 'FORBIDDEN' });
        requirePermission(member.role as MemberRole, 'billing.read');
        return getEntitlement(db, input.organizationId, input.feature);
      }),

    updateSubscription: protectedProcedure
      .input(z.object({ organizationId: z.string(), planId: z.enum(['free', 'pro', 'enterprise']) }))
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const [member] = await db
          .select()
          .from(organizationMembers)
          .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
          .limit(1);
        if (!member) throw new TRPCError({ code: 'FORBIDDEN' });
        requirePermission(member.role as MemberRole, 'billing.manage');
        if (input.planId !== 'free') {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Billing provider not configured — paid plans require verified provider state' });
        }
        const [existing] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, input.organizationId)).limit(1);
        if (existing) {
          await db
            .update(subscriptions)
            .set({ planId: input.planId, status: 'active', updatedAt: new Date(), cancelAtPeriodEnd: false, trialEndsAt: null, graceEndsAt: null })
            .where(eq(subscriptions.organizationId, input.organizationId));
        } else {
          await db.insert(subscriptions).values({
            id: createId(),
            organizationId: input.organizationId,
            planId: input.planId,
            status: 'active',
            provider: 'stripe',
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          });
        }
        await syncEntitlementsForPlan(db, input.organizationId, input.planId);
        const [updated] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, input.organizationId)).limit(1);
        return updated;
      }),
  }),
});

export type AppRouter = typeof appRouter;
