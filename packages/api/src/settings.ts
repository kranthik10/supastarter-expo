export const localeValues = ['en', 'de'] as const;
export const themeValues = ['system', 'light', 'dark'] as const;

export type UserLocale = (typeof localeValues)[number];
export type UserTheme = (typeof themeValues)[number];

export type UserPreferences = {
  locale: UserLocale;
  theme: UserTheme;
  marketingOptIn: boolean;
  analyticsEnabled: boolean;
  inviteEmails: boolean;
  billingAlerts: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
};

export type UserPreferencesPatch = Partial<UserPreferences>;

export const defaultUserPreferences: UserPreferences = {
  locale: 'en',
  theme: 'system',
  marketingOptIn: false,
  analyticsEnabled: true,
  inviteEmails: true,
  billingAlerts: true,
  quietHoursStart: null,
  quietHoursEnd: null,
};

const quietHourPattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function validateQuietHours(start: string | null, end: string | null): boolean {
  if (start === null && end === null) return true;
  if (start === null || end === null) return false;
  return quietHourPattern.test(start) && quietHourPattern.test(end);
}

export function mergeUserPreferences(current: UserPreferences, patch: UserPreferencesPatch): UserPreferences {
  return { ...current, ...patch };
}

export function canDeleteAccount(soleOwnerOrganizationCount: number): { ok: true } | { ok: false; reason: 'ownership_transfer_required' } {
  return soleOwnerOrganizationCount === 0 ? { ok: true } : { ok: false, reason: 'ownership_transfer_required' };
}
