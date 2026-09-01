import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { NotificationCategory, SafeNotificationData } from './policy';
import { parseNotificationData } from './policy';

export type PushToken = {
  token: string;
  platform: 'ios' | 'android';
};

export type { NotificationCategory, SafeNotificationData } from './policy';

export function canRegisterPush(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Device.isDevice : false;
}

export async function getPermissionStatus(): Promise<Notifications.PermissionStatus | 'unsupported'> {
  if (!canRegisterPush()) return 'unsupported';
  const permissions = await Notifications.getPermissionsAsync();
  return permissions.status;
}

export async function requestPermissions(): Promise<boolean> {
  if (!canRegisterPush()) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.status === Notifications.PermissionStatus.GRANTED) return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === Notifications.PermissionStatus.GRANTED;
}

function getEasProjectId(): string | null {
  const configured = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (typeof configured !== 'string' || !configured || /^0+$/.test(configured.replaceAll('-', ''))) return null;
  return configured;
}

export async function getPushToken(): Promise<PushToken | null> {
  if (!canRegisterPush()) return null;
  const projectId = getEasProjectId();
  if (!projectId) return null;
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId });
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    return { token: result.data, platform };
  } catch {
    return null;
  }
}

export function addNotificationResponseListener(listener: (data: SafeNotificationData) => void): Notifications.EventSubscription {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const data = parseNotificationData(response.notification.request.content.data);
    if (data) listener(data);
  });
}

export async function getLastNotificationData(): Promise<SafeNotificationData | null> {
  if (!canRegisterPush()) return null;
  const response = await Notifications.getLastNotificationResponseAsync();
  return response ? parseNotificationData(response.notification.request.content.data) : null;
}
