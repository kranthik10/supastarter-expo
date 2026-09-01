import { describe, expect, it } from 'vitest';
import { appRouter } from './router';

describe('notifications API contract', () => {
  it('exposes protected notification lifecycle procedures', () => {
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures).toHaveProperty('notifications.registerPushToken');
    expect(procedures).toHaveProperty('notifications.unregisterPushToken');
    expect(procedures).toHaveProperty('notifications.list');
    expect(procedures).toHaveProperty('notifications.getUnreadCount');
    expect(procedures).toHaveProperty('notifications.markRead');
    expect(procedures).toHaveProperty('notifications.markAllRead');
  });

  it('rejects unauthenticated notification reads and token registration', async () => {
    const caller = appRouter.createCaller({ db: {} as any, user: null, sessionId: null, headers: {} });
    await expect(caller.notifications.list({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(
      caller.notifications.registerPushToken({
        token: 'ExponentPushToken[test]',
        platform: 'ios',
        installationId: 'install_test_123',
      })
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
