import { describe, expect, it } from 'vitest';
import { appRouter } from './router';

describe('dashboard API contract', () => {
  it('exposes a protected organization-scoped overview procedure', () => {
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures).toHaveProperty('dashboard.overview');
  });

  it('rejects unauthenticated overview reads', async () => {
    const caller = appRouter.createCaller({ db: {} as any, user: null, sessionId: null, headers: {} });
    await expect(caller.dashboard.overview({ organizationId: 'org_test' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
