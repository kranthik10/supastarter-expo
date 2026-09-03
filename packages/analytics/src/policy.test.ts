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
    expect(analyticsEventNames).toContain('dashboard_viewed');
    expect(analyticsEventNames).toContain('dashboard_quick_action_selected');
    expect(analyticsEventNames.some((event) => event.includes('.'))).toBe(false);
  });

  it('rejects forbidden or nested event properties', () => {
    expect(sanitizeAnalyticsProperties('user_signed_in', { method: 'password', password: 'secret' })).toBeNull();
    expect(sanitizeAnalyticsProperties('notification_opened', { category: 'team', invitationToken: 'raw' })).toBeNull();
    expect(sanitizeAnalyticsProperties('storage_upload_completed', { scope: 'user', metadata: { url: 'https://signed' } })).toBeNull();
  });

  it('accepts only declared scalar properties', () => {
    expect(sanitizeAnalyticsProperties('user_signed_in', { method: 'password' })).toEqual({ method: 'password' });
    expect(sanitizeAnalyticsProperties('dashboard_quick_action_selected', { action: 'invite_member' })).toEqual({ action: 'invite_member' });
    expect(sanitizeAnalyticsProperties('user_signed_in', { method: 'password', extra: 'not-declared' })).toBeNull();
  });

  it('catalogs note lifecycle events with organization context only', () => {
    expect(analyticsEventNames).toContain('note_created');
    expect(analyticsEventNames).toContain('note_updated');
    expect(analyticsEventNames).toContain('note_deleted');
    expect(sanitizeAnalyticsProperties('note_created', { organization_id: 'org-1' })).toEqual({ organization_id: 'org-1' });
  });

  it('never allows note content into analytics properties', () => {
    expect(sanitizeAnalyticsProperties('note_created', { organization_id: 'org-1', title: 'private' })).toBeNull();
    expect(sanitizeAnalyticsProperties('note_updated', { organization_id: 'org-1', body: 'private' })).toBeNull();
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
