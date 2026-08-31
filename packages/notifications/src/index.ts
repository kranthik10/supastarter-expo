import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from '@repo/api';

export type PushToken = {
  token: string;
  platform: 'ios' | 'android' | 'web';
};

/**
 * Push notification flow:
 * 1. requestPermissions() — ask the user for notification permission
 * 2. getPushToken() — obtain the device token (implement after installing
 *    expo-notifications: `npx expo install expo-notifications`, then use
 *    Notifications.getDevicePushTokenAsync / getExpoPushTokenAsync)
 * 3. registerPushToken() — send it to your backend (POST /push/register)
 */
export async function requestPermissions(): Promise<boolean> {
  if (!Device.isDevice) return false;

  if (Platform.OS === 'web') {
    return typeof Notification !== 'undefined' && Notification.permission === 'granted';
  }

  return false;
}

export async function getPushToken(): Promise<PushToken | null> {
  return null;
}

export async function registerPushToken(token: PushToken): Promise<void> {
  await api.post('/push/register', token);
}
