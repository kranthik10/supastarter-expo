export const analyticsEventNames = [
  'user_signed_in',
  'user_signed_up',
  'user_signed_out',
  'organization_created',
  'invitation_accepted',
  'notification_opened',
  'notification_marked_read',
  'push_permission_changed',
  'settings_updated',
  'theme_changed',
  'locale_changed',
  'screen_viewed',
  'organization_switched',
  'storage_upload_completed',
  'billing_screen_viewed',
  'plan_selected',
  'checkout_requested',
  'dashboard_viewed',
  'dashboard_quick_action_selected',
  'note_created',
  'note_updated',
  'note_deleted',
] as const;

export type AnalyticsEventName = (typeof analyticsEventNames)[number];
export type AnalyticsScalar = string | number | boolean;
export type AnalyticsProperties = Record<string, AnalyticsScalar>;

export type AnalyticsEventProperties = {
  user_signed_in: { method: 'password' | 'google' | 'apple' | 'unknown' };
  user_signed_up: { method: 'password' | 'google' | 'apple' | 'unknown' };
  user_signed_out: Record<string, never>;
  organization_created: { organization_id: string };
  invitation_accepted: { organization_id: string };
  notification_opened: { category: 'team' | 'billing' | 'security' | 'system'; organization_id?: string };
  notification_marked_read: { category: 'team' | 'billing' | 'security' | 'system'; organization_id?: string };
  push_permission_changed: { status: 'granted' | 'denied' | 'unavailable' };
  settings_updated: { field: 'theme' | 'locale' | 'marketing_opt_in' | 'invite_emails' | 'billing_alerts' };
  theme_changed: { theme: 'system' | 'light' | 'dark' };
  locale_changed: { locale: 'en' | 'de' };
  screen_viewed: { screen: ScreenName };
  organization_switched: { organization_id: string };
  storage_upload_completed: { scope: 'user' | 'organization'; mime_category: 'image' | 'pdf'; size_bucket: 'small' | 'medium' | 'large' };
  billing_screen_viewed: { organization_id?: string };
  plan_selected: { plan: 'free' | 'pro' | 'enterprise'; organization_id?: string };
  checkout_requested: { plan: 'free' | 'pro' | 'enterprise'; organization_id?: string };
  dashboard_viewed: { organization_id: string };
  dashboard_quick_action_selected: { action: 'invite_member' | 'manage_billing' | 'team' | 'notifications' | 'settings' };
  note_created: { organization_id: string };
  note_updated: { organization_id: string };
  note_deleted: { organization_id: string };
};

export type ScreenName =
  | 'home'
  | 'team'
  | 'billing'
  | 'settings'
  | 'notifications'
  | 'organization'
  | 'invite'
  | 'auth'
  | 'onboarding'
  | 'assistant'
  | 'notes'
  | 'unknown';

export const screenNames = ['home', 'team', 'billing', 'settings', 'notifications', 'organization', 'invite', 'auth', 'onboarding', 'assistant', 'notes', 'unknown'] as const;

const eventPropertyKeys: Record<AnalyticsEventName, readonly string[]> = {
  user_signed_in: ['method'],
  user_signed_up: ['method'],
  user_signed_out: [],
  organization_created: ['organization_id'],
  invitation_accepted: ['organization_id'],
  notification_opened: ['category', 'organization_id'],
  notification_marked_read: ['category', 'organization_id'],
  push_permission_changed: ['status'],
  settings_updated: ['field'],
  theme_changed: ['theme'],
  locale_changed: ['locale'],
  screen_viewed: ['screen'],
  organization_switched: ['organization_id'],
  storage_upload_completed: ['scope', 'mime_category', 'size_bucket'],
  billing_screen_viewed: ['organization_id'],
  plan_selected: ['plan', 'organization_id'],
  checkout_requested: ['plan', 'organization_id'],
  dashboard_viewed: ['organization_id'],
  dashboard_quick_action_selected: ['action'],
  note_created: ['organization_id'],
  note_updated: ['organization_id'],
  note_deleted: ['organization_id'],
};

const forbiddenPropertyKeys = new Set([
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'secret',
  'apikey',
  'presignedurl',
  'uploadurl',
  'downloadurl',
  'invitationtoken',
  'email',
  'name',
  'phone',
  'address',
]);

function normalizeKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isScalar(value: unknown): value is AnalyticsScalar {
  return (typeof value === 'string' && value.length <= 256) || (typeof value === 'number' && Number.isFinite(value)) || typeof value === 'boolean';
}

export function isAnalyticsEventName(value: string): value is AnalyticsEventName {
  return (analyticsEventNames as readonly string[]).includes(value);
}

export function isSafeDistinctId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
}

export function isScreenName(value: string): value is ScreenName {
  return (screenNames as readonly string[]).includes(value);
}

export function sanitizeAnalyticsProperties<E extends AnalyticsEventName>(event: E, value: unknown): AnalyticsEventProperties[E] | null {
  if (value === undefined) return {} as AnalyticsEventProperties[E];
  if (!isAnalyticsEventName(event)) return null;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const allowed = new Set(eventPropertyKeys[event]);
  const output: AnalyticsProperties = {};
  for (const [key, raw] of Object.entries(input)) {
    if (raw === undefined) continue;
    if (forbiddenPropertyKeys.has(normalizeKey(key)) || !allowed.has(key) || !isScalar(raw)) return null;
    output[key] = raw;
  }
  return output as AnalyticsEventProperties[E];
}

export function sanitizeIdentifyTraits(value: unknown): AnalyticsProperties {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const allowed = new Set(['locale', 'theme', 'plan', 'app_variant', 'app_version']);
  const output: AnalyticsProperties = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (allowed.has(key) && isScalar(raw) && !forbiddenPropertyKeys.has(normalizeKey(key))) output[key] = raw;
  }
  return output;
}

export function screenNameForPath(path: string): ScreenName {
  const cleanPath = path.split(/[?#]/, 1)[0] ?? '';
  const segments = cleanPath.split('/').filter(Boolean).filter((segment) => !segment.startsWith('('));
  const first = segments[0];
  if (!first) return 'unknown';
  if (first === 'invite') return 'invite';
  if (first === 'organization') return 'organization';
  if (['home', 'team', 'billing', 'settings', 'notifications', 'assistant', 'notes'].includes(first)) return first as ScreenName;
  if (['sign-in', 'sign-up', 'forgot-password', 'verify-email'].includes(first)) return 'auth';
  if (['onboarding', 'welcome', 'create-organization'].includes(first)) return 'onboarding';
  return 'unknown';
}
