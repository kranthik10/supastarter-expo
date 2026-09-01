import { describe, expect, it } from 'vitest';
import {
  analyticsEventNames,
  sanitizeAnalyticsProperties,
  sanitizeIdentifyTraits,
  screenNameForPath,
} from './policy';

describe('analytics policy', () => {
  it('uses one lower_snake_case event catalog', () => {
    expect(analyticsEventNames).toContain('user_signed_in');
    expect(analyticsEventNames).toContain('organization_created');
    expect(analyticsEventNames.some((event) => event.includes('.'))).toBe(false);
  });

  it('rejects forbidden or nested event properties', () => {
    expect(sanitizeAnalyticsProperties('user_signed_in', { method: 'password', password: 'secret' })).toBeNull();
    expect(sanitizeAnalyticsProperties('notification_opened', { category: 'team', invitationToken: 'raw' })).toBeNull();
    expect(sanitizeAnalyticsProperties('storage_upload_completed', { scope: 'user', metadata: { url: 'https://signed' } })).toBeNull();
  });

  it('accepts only declared scalar properties', () => {
    expect(sanitizeAnalyticsProperties('user_signed_in', { method: 'password' })).toEqual({ method: 'password' });
    expect(sanitizeAnalyticsProperties('user_signed_in', { method: 'password', extra: 'not-declared' })).toBeNull();
  });

  it('strips raw identity fields from identify traits', () => {
    expect(sanitizeIdentifyTraits({ locale: 'en', theme: 'dark', email: 'user@example.com', name: 'User' })).toEqual({ locale: 'en', theme: 'dark' });
  });

  it('sanitizes dynamic and sensitive routes to logical screens', () => {
    expect(screenNameForPath('/invite/raw-token')).toBe('invite');
    expect(screenNameForPath('/organization/acme?secret=1')).toBe('organization');
    expect(screenNameForPath('/(app)/(tabs)/notifications')).toBe('notifications');
    expect(screenNameForPath('/settings')).toBe('settings');
  });
});
