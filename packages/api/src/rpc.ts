import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import type { ApiContext } from './context';

// Shared tRPC instance. Lives in its own module so domain routers
// (marketplace, future domains) can build procedures without importing
// the central router file — which itself mounts those domain routers.
// Importing builders from './router' would create a dependency cycle.
const t = initTRPC.context<ApiContext>().create({ transformer: superjson });

export const middleware = t.middleware;
export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  return next({ ctx: { ...ctx, user: ctx.user } });
});
