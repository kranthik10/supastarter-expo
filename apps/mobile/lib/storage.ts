import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const storage = {
  async get(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {}
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch {}
  },
};

const secureAvailable = Platform.OS === 'ios' || Platform.OS === 'android';

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    if (!secureAvailable) return storage.get(key);
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    if (!secureAvailable) return storage.set(key, value);
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {}
  },
  async remove(key: string): Promise<void> {
    if (!secureAvailable) return storage.remove(key);
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {}
  },
};
