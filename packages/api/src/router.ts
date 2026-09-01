import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import superjson from 'superjson';
import type { ApiContext } from './context';
import { getDb } from '@repo/database';
import { auditLogs, devices, files, invitations, organizations, organizationMembers, pushTokens, sessions, subscriptions, userPreferences, users, notifications as notificationRows } from '@repo/database';
import { and, desc, eq, isNull, lte, lt, ne, or, sql } from 'drizzle-orm';
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
import { cleanupExpiredFiles, getOrganizationStorageUsage } from './storage-service';
import { getStorageProvider, StorageProviderError, type StorageProvider } from '@repo/storage/server';
import { buildObjectKey, canConfirmFile, canReserveStorage, DOWNLOAD_URL_EXPIRY_SECONDS, storageLimitBytes, UPLOAD_URL_EXPIRY_SECONDS, validateUploadMetadata } from '@repo/storage/policy';
import { createNotification } from '@repo/notifications/server';
import { captureServerEvent, getServerAnalyticsProvider } from '@repo/analytics/server';
import { decodeNotificationCursor, encodeNotificationCursor, isExpoPushToken, notificationCategories, parseNotificationData } from '@repo/notifications/policy';
import {
  canDeleteAccount,
  defaultUserPreferences,
  localeValues,
  mergeUserPreferences,
  themeValues,
  validateQuietHours,
  type UserPreferences,
} from './settings';

const t = initTRPC.context<ApiContext>().create({ transformer: superjson });
const serverAnalyticsProvider = getServerAnalyticsProvider();

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

const profilePatchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    image: z.string().url().max(2_048).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'no_fields_to_update' });

const quietHourSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const preferencesPatchSchema = z
  .object({
    locale: z.enum(localeValues).optional(),
    theme: z.enum(themeValues).optional(),
    marketingOptIn: z.boolean().optional(),
    analyticsEnabled: z.boolean().optional(),
    inviteEmails: z.boolean().optional(),
    billingAlerts: z.boolean().optional(),
    quietHoursStart: quietHourSchema.nullable().optional(),
    quietHoursEnd: quietHourSchema.nullable().optional(),
  })
  .strict();

const storageIntentSchema = z
  .object({
    organizationId: z.string().min(1).optional(),
    filename: z.string().trim().min(1).max(255),
    contentType: z.string().trim().toLowerCase().min(1),
    size: z.number().int(),
    purpose: z.enum(['avatar']).optional(),
  })
  .strict();

const pushTokenSchema = z
  .object({
    token: z.string().trim().min(1).max(300).refine(isExpoPushToken, 'invalid_expo_push_token'),
    platform: z.enum(['ios', 'android']),
    installationId: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/),
    appVersion: z.string().trim().max(64).optional(),
  })
  .strict();
const notificationListSchema = z
  .object({
    limit: z.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).optional(),
  })
  .strict();
const notificationIdSchema = z.object({ notificationId: z.string().min(1) }).strict();

function safeNotificationData(value: unknown): Record<string, string> | null {
  const parsed = parseNotificationData(value);
  if (parsed === null) return null;
  return parsed as Record<string, string>;
}

function publicNotification(row: typeof notificationRows.$inferSelect) {
  return {
    id: row.id,
    organizationId: row.organizationId,
    category: (notificationCategories as readonly string[]).includes(row.category) ? row.category : 'system',
    title: row.title,
    body: row.body,
    data: safeNotificationData(row.data),
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

function toPublicPreferences(row: any): UserPreferences {
  return {
    locale: row.locale,
    theme: row.theme,
    marketingOptIn: row.marketingOptIn,
    analyticsEnabled: row.analyticsEnabled,
    inviteEmails: row.inviteEmails,
    billingAlerts: row.billingAlerts,
    quietHoursStart: row.quietHoursStart,
    quietHoursEnd: row.quietHoursEnd,
  };
}

async function getOrCreateUserPreferences(db: any, userId: string): Promise<UserPreferences> {
  const [existing] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  if (existing) return toPublicPreferences(existing);
  try {
    const [created] = await db
      .insert(userPreferences)
      .values({ userId, ...defaultUserPreferences })
      .returning();
    return toPublicPreferences(created);
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const [createdByRace] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
    if (!createdByRace) throw error;
    return toPublicPreferences(createdByRace);
  }
}

function safeProfile(user: any, avatarFileId: string | null = null) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    name: user.name,
    image: user.image,
    avatarFileId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function safeProfileWithAvatar(db: any, user: any) {
  let avatarFileId: string | null = null;
  if (typeof user.image === 'string' && isUserAvatarKey(user.image, user.id)) {
    const [avatar] = await db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.key, user.image), eq(files.userId, user.id), eq(files.status, 'ready')))
      .limit(1);
    avatarFileId = avatar?.id ?? null;
  }
  return safeProfile(user, avatarFileId);
}

function mapStorageProviderError(error: unknown): never {
  if (error instanceof StorageProviderError && error.code === 'STORAGE_NOT_CONFIGURED') {
    reasonError('storage_not_configured');
  }
  throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'storage_provider_unavailable' });
}

async function getFileById(db: any, fileId: string) {
  const [file] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!file) throw new TRPCError({ code: 'NOT_FOUND', message: 'file_not_found' });
  return file;
}

async function authorizeFileAccess(
  db: any,
  file: typeof files.$inferSelect,
  ctx: ApiContext,
  permission: Parameters<typeof assertCan>[1] | null
): Promise<void> {
  if (file.organizationId === null) {
    if (file.userId !== ctx.user!.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'file_forbidden' });
    return;
  }
  const [member] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, file.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
    .limit(1);
  if (!member) throw new TRPCError({ code: 'FORBIDDEN', message: 'file_forbidden' });
  if (permission) requirePermission(member.role as MemberRole, permission);
}

function isUserAvatarKey(key: string, userId: string): boolean {
  return key.startsWith(`user/${userId}/avatar/`);
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
        captureServerEvent(serverAnalyticsProvider, 'organization_created', { organization_id: id });
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
            return { kind: 'accepted' as const, organizationId: invitation.organizationId, role: invitation.role, invitedBy: invitation.invitedBy };
          } catch (error) {
            if (isUniqueViolation(error)) reasonError('already_member', 'CONFLICT');
            throw error;
          }
        });
        if (result.kind === 'expired') reasonError('invitation_expired');
        if (result.kind === 'accepted') {
          captureServerEvent(serverAnalyticsProvider, 'invitation_accepted', { organization_id: result.organizationId });
          try {
            await createNotification(db, {
              userId: result.invitedBy,
              organizationId: result.organizationId,
              category: 'team',
              title: 'Invitation accepted',
              body: 'A team invitation was accepted.',
              data: { route: '/team', orgId: result.organizationId },
            });
          } catch {
            // Invitation acceptance remains authoritative even if notification delivery/persistence is unavailable.
          }
        }
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

  notifications: router({
    registerPushToken: protectedProcedure
      .input(pushTokenSchema)
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const userId = ctx.user!.id;
        const now = new Date();
        return db.transaction(async (tx: any) => {
          const [existingDevice] = await tx.select().from(devices).where(eq(devices.id, input.installationId)).limit(1);
          if (existingDevice && existingDevice.userId !== userId) {
            throw new TRPCError({ code: 'CONFLICT', message: 'device_not_owned' });
          }

          const [tokenOwner] = await tx.select().from(pushTokens).where(eq(pushTokens.token, input.token)).limit(1);
          if (tokenOwner && tokenOwner.userId !== userId) {
            throw new TRPCError({ code: 'CONFLICT', message: 'push_token_owned_by_other_user' });
          }
          if (!existingDevice) {
            await tx.insert(devices).values({ id: input.installationId, userId, platform: input.platform, appVersion: input.appVersion ?? null });
          } else {
            await tx.update(devices).set({ platform: input.platform, appVersion: input.appVersion ?? null }).where(and(eq(devices.id, input.installationId), eq(devices.userId, userId)));
          }

          await tx
            .update(pushTokens)
            .set({ invalidatedAt: now })
            .where(and(eq(pushTokens.userId, userId), eq(pushTokens.deviceId, input.installationId), ne(pushTokens.token, input.token), isNull(pushTokens.invalidatedAt)));

          if (tokenOwner) {
            await tx
              .update(pushTokens)
              .set({ deviceId: input.installationId, provider: 'expo', invalidatedAt: null })
              .where(and(eq(pushTokens.id, tokenOwner.id), eq(pushTokens.userId, userId)));
          } else {
            await tx.insert(pushTokens).values({ id: createId(), deviceId: input.installationId, userId, token: input.token, provider: 'expo', invalidatedAt: null });
          }
          return { ok: true as const, deviceId: input.installationId };
        });
      }),

    unregisterPushToken: protectedProcedure
      .input(z.object({ installationId: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/), token: z.string().trim().min(1).max(300).optional() }).strict())
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const [device] = await db.select({ userId: devices.userId }).from(devices).where(eq(devices.id, input.installationId)).limit(1);
        if (device && device.userId !== ctx.user!.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'device_forbidden' });
        const conditions = [eq(pushTokens.userId, ctx.user!.id), eq(pushTokens.deviceId, input.installationId), isNull(pushTokens.invalidatedAt)];
        if (input.token) conditions.push(eq(pushTokens.token, input.token));
        const invalidated = await db.update(pushTokens).set({ invalidatedAt: new Date() }).where(and(...conditions)).returning({ id: pushTokens.id });
        return { ok: true as const, invalidatedCount: invalidated.length };
      }),

    list: protectedProcedure
      .input(notificationListSchema)
      .query(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const cursor = input.cursor ? decodeNotificationCursor(input.cursor) : null;
        if (input.cursor && !cursor) throw new TRPCError({ code: 'BAD_REQUEST', message: 'notification_cursor_invalid' });
        const conditions = [eq(notificationRows.userId, ctx.user!.id)];
        if (cursor) {
          const cursorDate = new Date(cursor.createdAt);
          conditions.push(or(lt(notificationRows.createdAt, cursorDate), and(eq(notificationRows.createdAt, cursorDate), lt(notificationRows.id, cursor.id)))!);
        }
        const rows = await db
          .select()
          .from(notificationRows)
          .where(and(...conditions))
          .orderBy(desc(notificationRows.createdAt), desc(notificationRows.id))
          .limit(input.limit + 1);
        const hasMore = rows.length > input.limit;
        const page = hasMore ? rows.slice(0, input.limit) : rows;
        const last = page[page.length - 1];
        return {
          items: page.map(publicNotification),
          nextCursor: hasMore && last ? encodeNotificationCursor({ id: last.id, createdAt: last.createdAt }) : null,
        };
      }),

    getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
      const db = ctx.db ?? getDb();
      const [result] = await db.select({ count: sql<number>`count(*)` }).from(notificationRows).where(and(eq(notificationRows.userId, ctx.user!.id), isNull(notificationRows.readAt)));
      return { count: Number(result?.count ?? 0) };
    }),

    markRead: protectedProcedure
      .input(notificationIdSchema)
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const [updated] = await db
          .update(notificationRows)
          .set({ readAt: new Date() })
          .where(and(eq(notificationRows.id, input.notificationId), eq(notificationRows.userId, ctx.user!.id)))
          .returning();
        if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'notification_not_found' });
        return { ok: true as const, notification: publicNotification(updated) };
      }),

    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      const db = ctx.db ?? getDb();
      const updated = await db
        .update(notificationRows)
        .set({ readAt: new Date() })
        .where(and(eq(notificationRows.userId, ctx.user!.id), isNull(notificationRows.readAt)))
        .returning({ id: notificationRows.id });
      return { ok: true as const, updatedCount: updated.length };
    }),
  }),

  storage: router({
    createUploadIntent: protectedProcedure
      .input(storageIntentSchema)
      .mutation(async ({ ctx, input }) => {
        const validation = validateUploadMetadata(input);
        if (!validation.ok) throw new TRPCError({ code: 'BAD_REQUEST', message: validation.reason });
        if (input.purpose === 'avatar' && !input.contentType.startsWith('image/')) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'avatar_must_be_an_image' });
        }

        const db = ctx.db ?? getDb();
        let organizationMember: typeof organizationMembers.$inferSelect | null = null;
        if (input.organizationId) {
          organizationMember =
            (await db
              .select()
              .from(organizationMembers)
              .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
              .limit(1))[0] ?? null;
          if (!organizationMember) throw new TRPCError({ code: 'FORBIDDEN', message: 'organization_forbidden' });
          requirePermission(organizationMember.role as MemberRole, 'files.write');
        }

        const provider = getStorageProvider();
        if (!provider.configured) reasonError('storage_not_configured');
        const fileId = createId();
        const key = buildObjectKey({
          scope: input.organizationId ? 'org' : 'user',
          organizationId: input.organizationId,
          userId: ctx.user!.id,
          fileId,
          filename: input.filename,
          purpose: input.purpose,
        });
        const now = new Date();
        const expiresAt = new Date(now.getTime() + UPLOAD_URL_EXPIRY_SECONDS * 1_000);

        const file = await db.transaction(async (tx: any) => {
          if (input.organizationId) {
            const entitlement = await getEntitlement(tx, input.organizationId, 'storage.gb');
            if (!entitlement?.enabled) reasonError('storage_disabled');
            const usage = await getOrganizationStorageUsage(tx, input.organizationId, now, true);
            const quota = canReserveStorage({
              limitBytes: storageLimitBytes(entitlement.limit),
              readyBytes: usage.readyBytes,
              pendingBytes: usage.pendingBytes,
              requestedBytes: input.size,
            });
            if (!quota.ok) reasonError(quota.reason);
          }
          const [created] = await tx
            .insert(files)
            .values({
              id: fileId,
              organizationId: input.organizationId ?? null,
              userId: ctx.user!.id,
              key,
              // Existing column retained for compatibility; private rows store an opaque object reference, not a public URL.
              url: key,
              contentType: input.contentType,
              size: input.size,
              status: 'pending',
              expiresAt,
              updatedAt: now,
            })
            .returning();
          if (input.organizationId) {
            await writeAudit(tx, {
              organizationId: input.organizationId,
              userId: ctx.user!.id,
              action: 'file.upload_created',
              targetType: 'file',
              targetId: fileId,
              metadata: { contentType: input.contentType, size: input.size },
            });
          }
          return created;
        });

        let signed: Awaited<ReturnType<StorageProvider['createPresignedUpload']>>;
        try {
          signed = await provider.createPresignedUpload({ key, contentType: input.contentType, expiresInSeconds: 600 });
        } catch (error) {
          await db
            .update(files)
            .set({ status: 'deleted', expiresAt: null, updatedAt: new Date() })
            .where(and(eq(files.id, fileId), eq(files.status, 'pending')));
          mapStorageProviderError(error);
        }
        return {
          fileId: file.id,
          key: file.key,
          uploadUrl: signed!.uploadUrl,
          requiredHeaders: signed!.headers,
          expiresAt: file.expiresAt ?? signed!.expiresAt,
        };
      }),

    confirmUpload: protectedProcedure
      .input(z.object({ fileId: z.string().min(1), purpose: z.enum(['avatar']).optional() }).strict())
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const provider = getStorageProvider();
        if (!provider.configured) reasonError('storage_not_configured');
        const file = await getFileById(db, input.fileId);
        await authorizeFileAccess(db, file, ctx, file.organizationId ? 'files.write' : null);
        if (input.purpose === 'avatar' && (file.organizationId !== null || !isUserAvatarKey(file.key, ctx.user!.id) || !file.contentType?.startsWith('image/'))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'avatar_forbidden' });
        }
        const lifecycle = canConfirmFile(file.status as 'pending' | 'ready' | 'deleted', file.expiresAt, new Date());
        if (!lifecycle.ok) reasonError(lifecycle.reason);

        let remote: Awaited<ReturnType<StorageProvider['headObject']>>;
        try {
          remote = await provider.headObject({ key: file.key });
        } catch (error) {
          mapStorageProviderError(error);
        }
        if (!remote!.exists) throw new TRPCError({ code: 'NOT_FOUND', message: 'storage_object_missing' });
        if (remote!.size !== file.size || remote!.contentType !== file.contentType) {
          throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'upload_metadata_mismatch' });
        }

        const result = await db.transaction(async (tx: any) => {
          const locked = await getFileById(tx, input.fileId);
          const lockedLifecycle = canConfirmFile(locked.status as 'pending' | 'ready' | 'deleted', locked.expiresAt, new Date());
          if (!lockedLifecycle.ok) reasonError(lockedLifecycle.reason);
          let previousAvatarKey: string | null = null;
          if (input.purpose === 'avatar') {
            const [currentUser] = await tx.select({ image: users.image }).from(users).where(eq(users.id, ctx.user!.id)).limit(1);
            if (!currentUser) throw new TRPCError({ code: 'NOT_FOUND', message: 'user_not_found' });
            previousAvatarKey = currentUser.image;
          }
          const [updatedFile] = await tx
            .update(files)
            .set({ status: 'ready', expiresAt: null, updatedAt: new Date() })
            .where(and(eq(files.id, input.fileId), eq(files.status, 'pending')))
            .returning();
          if (!updatedFile) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'file_not_pending' });
          if (input.purpose === 'avatar') {
            await tx.update(users).set({ image: updatedFile.key, updatedAt: new Date() }).where(eq(users.id, ctx.user!.id));
          }
          if (updatedFile.organizationId) {
            await writeAudit(tx, {
              organizationId: updatedFile.organizationId,
              userId: ctx.user!.id,
              action: 'file.upload_confirmed',
              targetType: 'file',
              targetId: updatedFile.id,
              metadata: { contentType: updatedFile.contentType, size: updatedFile.size },
            });
          }
          return { file: updatedFile, previousAvatarKey };
        });

        let avatarCleanup: 'not_applicable' | 'deleted' | 'deferred' = 'not_applicable';
        if (result.previousAvatarKey && isUserAvatarKey(result.previousAvatarKey, ctx.user!.id) && result.previousAvatarKey !== result.file.key) {
          try {
            await provider.deleteObject({ key: result.previousAvatarKey });
            await db
              .update(files)
              .set({ status: 'deleted', expiresAt: null, updatedAt: new Date() })
              .where(and(eq(files.key, result.previousAvatarKey), eq(files.userId, ctx.user!.id), eq(files.status, 'ready')));
            avatarCleanup = 'deleted';
          } catch {
            // Keep the old metadata ready so it continues to count against quota if remote cleanup fails.
            avatarCleanup = 'deferred';
          }
        }
        return { fileId: result.file.id, key: result.file.key, status: result.file.status, avatarCleanup };
      }),

    getDownloadUrl: protectedProcedure
      .input(z.object({ fileId: z.string().min(1) }).strict())
      .query(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const provider = getStorageProvider();
        if (!provider.configured) reasonError('storage_not_configured');
        const file = await getFileById(db, input.fileId);
        await authorizeFileAccess(db, file, ctx, file.organizationId ? 'organization.read' : null);
        if (file.status !== 'ready') reasonError('file_not_ready');
        try {
          const signed = await provider.createPresignedDownload({ key: file.key, expiresInSeconds: DOWNLOAD_URL_EXPIRY_SECONDS });
          return { fileId: file.id, downloadUrl: signed.downloadUrl, expiresAt: signed.expiresAt };
        } catch (error) {
          mapStorageProviderError(error);
        }
      }),

    listFiles: protectedProcedure
      .input(z.object({ organizationId: z.string().min(1).optional() }).strict())
      .query(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        if (input.organizationId) {
          const [member] = await db
            .select()
            .from(organizationMembers)
            .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
            .limit(1);
          if (!member) throw new TRPCError({ code: 'FORBIDDEN', message: 'organization_forbidden' });
          requirePermission(member.role as MemberRole, 'organization.read');
        }
        const rows = await db
          .select({
            id: files.id,
            organizationId: files.organizationId,
            key: files.key,
            contentType: files.contentType,
            size: files.size,
            status: files.status,
            expiresAt: files.expiresAt,
            createdAt: files.createdAt,
            updatedAt: files.updatedAt,
          })
          .from(files)
          .where(
            input.organizationId
              ? and(eq(files.organizationId, input.organizationId), ne(files.status, 'deleted'))
              : and(isNull(files.organizationId), eq(files.userId, ctx.user!.id), ne(files.status, 'deleted'))
          )
          .orderBy(desc(files.createdAt));
        return rows;
      }),

    deleteFile: protectedProcedure
      .input(z.object({ fileId: z.string().min(1) }).strict())
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const provider = getStorageProvider();
        if (!provider.configured) reasonError('storage_not_configured');
        const file = await getFileById(db, input.fileId);
        await authorizeFileAccess(db, file, ctx, file.organizationId ? 'files.delete' : null);
        if (file.status === 'deleted') throw new TRPCError({ code: 'CONFLICT', message: 'file_already_deleted' });
        try {
          await provider.deleteObject({ key: file.key });
        } catch {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'storage_delete_failed' });
        }
        const [deleted] = await db
          .update(files)
          .set({ status: 'deleted', expiresAt: null, updatedAt: new Date() })
          .where(and(eq(files.id, file.id), ne(files.status, 'deleted')))
          .returning();
        if (!deleted) throw new TRPCError({ code: 'CONFLICT', message: 'file_already_deleted' });
        if (deleted.organizationId) {
          await writeAudit(db, {
            organizationId: deleted.organizationId,
            userId: ctx.user!.id,
            action: 'file.deleted',
            targetType: 'file',
            targetId: deleted.id,
          });
        }
        return { ok: true as const, fileId: deleted.id, status: deleted.status };
      }),
  }),

  settings: router({
    getProfile: protectedProcedure.query(async ({ ctx }) => {
      const db = ctx.db ?? getDb();
      return safeProfileWithAvatar(db, ctx.user);
    }),

    updateProfile: protectedProcedure
      .input(profilePatchSchema)
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const [updated] = await db
          .update(users)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.image !== undefined ? { image: input.image } : {}),
            updatedAt: new Date(),
          })
          .where(eq(users.id, ctx.user!.id))
          .returning();
        if (!updated) throw new TRPCError({ code: 'NOT_FOUND', message: 'user_not_found' });
        return safeProfile(updated);
      }),

    getPreferences: protectedProcedure.query(async ({ ctx }) => {
      const db = ctx.db ?? getDb();
      return getOrCreateUserPreferences(db, ctx.user!.id);
    }),

    updatePreferences: protectedProcedure
      .input(preferencesPatchSchema)
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const current = await getOrCreateUserPreferences(db, ctx.user!.id);
        const merged = mergeUserPreferences(current, input);
        if (!validateQuietHours(merged.quietHoursStart, merged.quietHoursEnd)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'quiet_hours_pair_invalid' });
        }
        const [updated] = await db
          .update(userPreferences)
          .set({
            ...(input.locale !== undefined ? { locale: input.locale } : {}),
            ...(input.theme !== undefined ? { theme: input.theme } : {}),
            ...(input.marketingOptIn !== undefined ? { marketingOptIn: input.marketingOptIn } : {}),
            ...(input.analyticsEnabled !== undefined ? { analyticsEnabled: input.analyticsEnabled } : {}),
            ...(input.inviteEmails !== undefined ? { inviteEmails: input.inviteEmails } : {}),
            ...(input.billingAlerts !== undefined ? { billingAlerts: input.billingAlerts } : {}),
            ...(input.quietHoursStart !== undefined ? { quietHoursStart: input.quietHoursStart } : {}),
            ...(input.quietHoursEnd !== undefined ? { quietHoursEnd: input.quietHoursEnd } : {}),
            updatedAt: new Date(),
          })
          .where(eq(userPreferences.userId, ctx.user!.id))
          .returning();
        return toPublicPreferences(updated ?? merged);
      }),

    listSessions: protectedProcedure.query(async ({ ctx }) => {
      const db = ctx.db ?? getDb();
      return db
        .select({
          id: sessions.id,
          createdAt: sessions.createdAt,
          expiresAt: sessions.expiresAt,
          ipAddress: sessions.ipAddress,
          userAgent: sessions.userAgent,
          current: sql<boolean>`${sessions.id} = ${ctx.sessionId ?? ''}`,
        })
        .from(sessions)
        .where(eq(sessions.userId, ctx.user!.id))
        .orderBy(desc(sessions.createdAt));
    }),

    revokeSession: protectedProcedure
      .input(z.object({ sessionId: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const [deleted] = await db
          .delete(sessions)
          .where(and(eq(sessions.id, input.sessionId), eq(sessions.userId, ctx.user!.id)))
          .returning({ id: sessions.id });
        if (!deleted) throw new TRPCError({ code: 'NOT_FOUND', message: 'session_not_found' });
        return { ok: true as const };
      }),

    revokeOtherSessions: protectedProcedure.mutation(async ({ ctx }) => {
      const db = ctx.db ?? getDb();
      if (!ctx.sessionId) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'current_session_unavailable' });
      await db.delete(sessions).where(and(eq(sessions.userId, ctx.user!.id), ne(sessions.id, ctx.sessionId)));
      return { ok: true as const };
    }),

    deleteAccount: protectedProcedure.mutation(async ({ ctx }) => {
      const db = ctx.db ?? getDb();
      return db.transaction(async (tx: any) => {
        const ownedOrganizations = await tx
          .select({ organizationId: organizationMembers.organizationId })
          .from(organizationMembers)
          .where(and(eq(organizationMembers.userId, ctx.user!.id), eq(organizationMembers.role, 'owner')));
        let soleOwnerOrganizations = 0;
        for (const owned of ownedOrganizations) {
          // Serialize this check with ownership transfer and member-removal transactions.
          await tx.execute(sql`SELECT id FROM organization_members WHERE organization_id = ${owned.organizationId} FOR UPDATE`);
          const [{ ownerCount }] = await tx
            .select({ ownerCount: sql<number>`count(*)` })
            .from(organizationMembers)
            .where(and(eq(organizationMembers.organizationId, owned.organizationId), eq(organizationMembers.role, 'owner')));
          if (Number(ownerCount) <= 1) soleOwnerOrganizations += 1;
        }
        const deletion = canDeleteAccount(soleOwnerOrganizations);
        if (!deletion.ok) reasonError(deletion.reason);

        await writeAudit(tx, {
          organizationId: null,
          userId: ctx.user!.id,
          action: 'account.deleted',
          targetType: 'user',
          targetId: ctx.user!.id,
          metadata: { deletionMode: 'immediate_better_auth_store_delete' },
        });
        await tx.delete(sessions).where(eq(sessions.userId, ctx.user!.id));
        // Better Auth remains the identity system of record; this deletes the same user row it owns.
        // Accounts, memberships, preferences, devices, files, and notifications follow existing FK rules.
        await tx.delete(users).where(eq(users.id, ctx.user!.id));
        return { ok: true as const };
      });
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
