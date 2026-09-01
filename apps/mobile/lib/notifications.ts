import Constants from 'expo-constants';
import { getPushToken, requestPermissions, canRegisterPush, type PushToken } from '@repo/notifications';
import { analytics } from '@repo/analytics';
import { trpc } from '@repo/api';
import { storage } from './storage';

import { isValidInstallationId, createInstallationId } from './notifications-policy';

export { isValidInstallationId, createInstallationId } from './notifications-policy';
const INSTALLATION_ID_KEY = 'notifications.installation-id.v1';
export async function getInstallationId(): Promise<string> {
  const existing = await storage.get(INSTALLATION_ID_KEY);
  if (existing && isValidInstallationId(existing)) return existing;
  const created = createInstallationId();
  await storage.set(INSTALLATION_ID_KEY, created);
  return created;
}

export async function registerPushNotifications(): Promise<'registered' | 'permission_denied' | 'unavailable'> {
  const granted = await requestPermissions();
  if (!granted) {
    const status = canRegisterPush() ? 'denied' : 'unavailable';
    analytics.capture('push_permission_changed', { status });
    return status === 'denied' ? 'permission_denied' : 'unavailable';
  }
  const token = await getPushToken();
  if (!token) {
    analytics.capture('push_permission_changed', { status: 'unavailable' });
    return 'unavailable';
  }
  const installationId = await getInstallationId();
  await trpc.notifications.registerPushToken.mutate({
    token: token.token,
    platform: token.platform,
    installationId,
    appVersion: Constants.expoConfig?.version ?? undefined,
  });
  analytics.capture('push_permission_changed', { status: 'granted' });
  return 'registered';
}

export async function unregisterPushNotifications(): Promise<void> {
  const installationId = await getInstallationId();
  await trpc.notifications.unregisterPushToken.mutate({ installationId });
}

export type { PushToken };
