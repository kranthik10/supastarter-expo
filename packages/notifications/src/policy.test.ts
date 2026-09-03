import { describe, expect, it } from 'vitest';
import {
  decodeNotificationCursor,
  encodeNotificationCursor,
  isExpoPushToken,
  notificationCategories,
  parseNotificationData,
  shouldSendPush,
} from './policy';

describe('notification policy', () => {
  it('accepts Expo push token formats and rejects arbitrary strings', () => {
    expect(isExpoPushToken('ExponentPushToken[abc123_-]')).toBe(true);
    expect(isExpoPushToken('ExpoPushToken[abc123_-]')).toBe(true);
    expect(isExpoPushToken('not-a-push-token')).toBe(false);
    expect(isExpoPushToken('ExponentPushToken[]')).toBe(false);
  });

  it('accepts only safe route metadata and strips unknown fields', () => {
    expect(parseNotificationData({ route: '/team', orgId: 'org_123', secret: 'nope' })).toEqual({ route: '/team', orgId: 'org_123' });
    expect(parseNotificationData({ route: '/invite/raw-bearer-token' })).toBeNull();
    expect(parseNotificationData({ route: 'javascript:alert(1)' })).toBeNull();
    expect(parseNotificationData({ orgId: '' })).toBeNull();
  });

  it('uses a finite category representation', () => {
    expect(notificationCategories).toEqual(['team', 'billing', 'security', 'system', 'booking']);
  });

  it('gates billing push without suppressing other notification categories', () => {
    const disabled = { billingAlerts: false };
    expect(shouldSendPush('billing', disabled)).toBe(false);
    expect(shouldSendPush('team', disabled)).toBe(true);
    expect(shouldSendPush('security', disabled)).toBe(true);
  });

  it('round-trips an opaque cursor', () => {
    const cursor = encodeNotificationCursor({ id: 'n_1', createdAt: new Date('2026-01-01T00:00:00.000Z') });
    expect(decodeNotificationCursor(cursor)).toEqual({ id: 'n_1', createdAt: '2026-01-01T00:00:00.000Z' });
    expect(decodeNotificationCursor('invalid')).toBeNull();
  });
});
