import { describe, it, expect } from 'vitest';
import {
  defaultUserPreferences,
  mergeUserPreferences,
  validateQuietHours,
  canDeleteAccount,
  localeValues,
  themeValues,
} from './settings';
import { appRouter } from './router';

describe('user preference validation', () => {
  it('provides safe default preferences', () => {
    expect(defaultUserPreferences).toEqual({
      locale: 'en',
      theme: 'system',
      marketingOptIn: false,
      inviteEmails: true,
      billingAlerts: true,
      quietHoursStart: null,
      quietHoursEnd: null,
    });
  });

  it('supports only configured locale and theme values', () => {
    expect(localeValues).toEqual(['en', 'de']);
    expect(themeValues).toEqual(['system', 'light', 'dark']);
  });

  it('accepts null or strict 24-hour quiet-hour pairs', () => {
    expect(validateQuietHours(null, null)).toBe(true);
    expect(validateQuietHours('00:00', '08:30')).toBe(true);
    expect(validateQuietHours('23:59', '00:00')).toBe(true);
  });

  it('rejects incomplete or invalid quiet-hour pairs', () => {
    expect(validateQuietHours('08:30', null)).toBe(false);
    expect(validateQuietHours(null, '08:30')).toBe(false);
    expect(validateQuietHours('8:00', '09:00')).toBe(false);
    expect(validateQuietHours('25:00', '09:00')).toBe(false);
    expect(validateQuietHours('08:99', '09:00')).toBe(false);
  });

  it('merges a partial update without losing existing preferences', () => {
    const merged = mergeUserPreferences(
      { ...defaultUserPreferences, locale: 'de', theme: 'dark', quietHoursStart: '22:00', quietHoursEnd: '07:00' },
      { billingAlerts: false }
    );
    expect(merged).toEqual({
      ...defaultUserPreferences,
      locale: 'de',
      theme: 'dark',
      billingAlerts: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '07:00',
    });
  });
});

describe('account deletion safety', () => {
  it('blocks deletion when any organization would lose its sole owner', () => {
    expect(canDeleteAccount(0)).toEqual({ ok: true });
    expect(canDeleteAccount(1)).toEqual({ ok: false, reason: 'ownership_transfer_required' });
    expect(canDeleteAccount(3)).toEqual({ ok: false, reason: 'ownership_transfer_required' });
  });
});

describe('settings API contract', () => {
  it('exposes only authenticated user-scoped settings procedures', () => {
    const procedures = appRouter._def.procedures as Record<string, unknown>;
    expect(procedures).toHaveProperty('settings.getProfile');
    expect(procedures).toHaveProperty('settings.updateProfile');
    expect(procedures).toHaveProperty('settings.getPreferences');
    expect(procedures).toHaveProperty('settings.updatePreferences');
    expect(procedures).toHaveProperty('settings.listSessions');
    expect(procedures).toHaveProperty('settings.revokeSession');
    expect(procedures).toHaveProperty('settings.revokeOtherSessions');
    expect(procedures).toHaveProperty('settings.deleteAccount');
  });

  it('rejects unauthenticated profile access', async () => {
    const caller = appRouter.createCaller({ db: {} as any, user: null, sessionId: null, headers: {} });
    await expect(caller.settings.getProfile()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
