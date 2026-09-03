export const notificationCategories = ['team', 'billing', 'security', 'system', 'booking'] as const;
export type NotificationCategory = (typeof notificationCategories)[number];

export type SafeNotificationData = {
  route?: string;
  orgId?: string;
};

export type NotificationPreferenceSnapshot = {
  billingAlerts: boolean;
};

const expoPushTokenPattern = /^(?:Expo|Exponent)PushToken\[[A-Za-z0-9_-]{1,256}\]$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const routePattern = /^\/(?:home|team|billing|settings|notifications|bookings|booking\/[A-Za-z0-9._~-]{1,128}|invitations|organization\/[a-z0-9][a-z0-9-]{1,119})$/;

export function isExpoPushToken(value: string): boolean {
  return expoPushTokenPattern.test(value);
}

export function parseNotificationData(value: unknown): SafeNotificationData | null {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) return null;

  const input = value as Record<string, unknown>;
  const result: SafeNotificationData = {};
  if (input.route !== undefined) {
    if (typeof input.route !== 'string' || !routePattern.test(input.route)) return null;
    result.route = input.route;
  }
  if (input.orgId !== undefined) {
    if (typeof input.orgId !== 'string' || !idPattern.test(input.orgId)) return null;
    result.orgId = input.orgId;
  }
  return result;
}

export function shouldSendPush(category: NotificationCategory, preferences: NotificationPreferenceSnapshot): boolean {
  return category !== 'billing' || preferences.billingAlerts;
}

export type NotificationCursor = { id: string; createdAt: string };

export function encodeNotificationCursor(input: { id: string; createdAt: Date }): string {
  return encodeURIComponent(`${input.createdAt.toISOString()}|${input.id}`);
}

export function decodeNotificationCursor(value: string): NotificationCursor | null {
  try {
    const decoded = decodeURIComponent(value);
    const separator = decoded.lastIndexOf('|');
    if (separator <= 0 || separator === decoded.length - 1) return null;
    const createdAt = decoded.slice(0, separator);
    const id = decoded.slice(separator + 1);
    const parsed = new Date(createdAt);
    if (!idPattern.test(id) || Number.isNaN(parsed.getTime()) || parsed.toISOString() !== createdAt) return null;
    return { id, createdAt };
  } catch {
    return null;
  }
}
