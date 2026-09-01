import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import superjson from 'superjson';
import type { ApiContext } from './context';
import { getDb } from '@repo/database';
import { organizations, organizationMembers, invitations, subscriptions } from '@repo/database';
import { eq, and } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';
import { assertCan } from '@repo/permissions';
import { syncEntitlementsForPlan, getEntitlement, listEntitlements } from '@repo/billing/entitlements.server';

const t = initTRPC.context<ApiContext>().create({ transformer: superjson });

export const middleware = t.middleware;
export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});

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
        assertCan(member.role as never, 'organization.update');
        await db
          .update(organizations)
          .set({ ...(input.name ? { name: input.name } : {}), ...(input.slug ? { slug: input.slug } : {}), updatedAt: new Date() })
          .where(eq(organizations.id, input.organizationId));
        const [row] = await db.select().from(organizations).where(eq(organizations.id, input.organizationId)).limit(1);
        return row;
      }),
  }),

  members: router({
    list: protectedProcedure.input(z.object({ organizationId: z.string() })).query(async ({ ctx, input }) => {
      const db = ctx.db ?? getDb();
      const [member] = await db
        .select()
        .from(organizationMembers)
        .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
        .limit(1);
      if (!member) throw new TRPCError({ code: 'FORBIDDEN' });
      return db.select().from(organizationMembers).where(eq(organizationMembers.organizationId, input.organizationId));
    }),

    invite: protectedProcedure
      .input(z.object({ organizationId: z.string(), email: z.string().email(), role: z.enum(['member', 'admin', 'owner']).default('member') }))
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const [member] = await db
          .select()
          .from(organizationMembers)
          .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
          .limit(1);
        if (!member) throw new TRPCError({ code: 'FORBIDDEN' });
        assertCan(member.role as never, 'members.invite');
        const token = createId();
        const [row] = await db
          .insert(invitations)
          .values({
            id: createId(),
            organizationId: input.organizationId,
            email: input.email.toLowerCase(),
            role: input.role as never,
            token,
            invitedBy: ctx.user!.id,
            expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
          })
          .returning();
        return row;
      }),

    remove: protectedProcedure
      .input(z.object({ organizationId: z.string(), userId: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const db = ctx.db ?? getDb();
        const [actor] = await db
          .select()
          .from(organizationMembers)
          .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, ctx.user!.id)))
          .limit(1);
        if (!actor) throw new TRPCError({ code: 'FORBIDDEN' });
        assertCan(actor.role as never, 'members.remove');
        if (input.userId === ctx.user!.id) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot remove yourself' });
        await db
          .delete(organizationMembers)
          .where(and(eq(organizationMembers.organizationId, input.organizationId), eq(organizationMembers.userId, input.userId)));
        return { ok: true };
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
        assertCan(member.role as never, 'billing.read');
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
        assertCan(member.role as never, 'billing.read');
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
        assertCan(member.role as never, 'billing.read');
        const ent = await getEntitlement(db, input.organizationId, input.feature as never);
        return ent;
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
        assertCan(member.role as never, 'billing.manage');
        // Phase 3.1: without verified provider state (Stripe/RevenueCat webhook) a client must not be able
        // to forge a paid subscription. Only free plan is allowed via this direct mutation.
        // Paid plans require: Client → BillingProvider → verified provider → webhook → server sync (see docs/phase-3-saas-product-layer.md §12).
        // For tests/internal tooling use syncEntitlementsForPlan directly (server helper), not this client procedure.
        if (input.planId !== 'free') {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message: 'Billing provider not configured — paid plans require verified provider state',
          });
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
        await syncEntitlementsForPlan(db, input.organizationId, input.planId as never);
        const [updated] = await db.select().from(subscriptions).where(eq(subscriptions.organizationId, input.organizationId)).limit(1);
        return updated;
      }),
  }),
});

export type AppRouter = typeof appRouter;
