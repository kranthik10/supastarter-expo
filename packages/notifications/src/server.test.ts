import { describe, expect, it, vi } from 'vitest';
import { ExpoPushProvider, FakeNotificationProvider, NotConfiguredNotificationProvider } from './server';

describe('notification providers', () => {
  it('does not claim acceptance when the provider is not configured', async () => {
    const result = await new NotConfiguredNotificationProvider().sendMany([
      { token: 'ExponentPushToken[test]', title: 'Title', body: 'Body' },
    ]);
    expect(result).toEqual([{ status: 'not_configured', token: 'ExponentPushToken[test]', error: 'provider_not_configured' }]);
  });

  it('records fake provider requests and can return invalid-token outcomes', async () => {
    const provider = new FakeNotificationProvider([
      { status: 'invalid_token', token: 'ExponentPushToken[test]', error: 'DeviceNotRegistered' },
    ]);
    const messages = [{ token: 'ExponentPushToken[test]', title: 'Title', body: 'Body' }];
    await expect(provider.sendMany(messages)).resolves.toEqual([
      { status: 'invalid_token', token: 'ExponentPushToken[test]', error: 'DeviceNotRegistered' },
    ]);
    expect(provider.messages).toEqual(messages);
  });

  it('maps an immediate Expo DeviceNotRegistered ticket to invalid_token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'error', details: { error: 'DeviceNotRegistered' } }] }),
    }));
    const result = await new ExpoPushProvider().sendMany([{ token: 'ExponentPushToken[test]', title: 'Title' }]);
    expect(result[0]).toMatchObject({ status: 'invalid_token', error: 'DeviceNotRegistered' });
    vi.unstubAllGlobals();
  });

  it('exposes a server-only Expo provider boundary', () => {
    expect(new ExpoPushProvider().name).toBe('expo');
  });
});
