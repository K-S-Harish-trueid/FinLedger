import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Tokens go to the device keychain on native. SecureStore has no web
 * implementation, so the browser build falls back to localStorage — fine for
 * development, and the reason the web target is treated as a preview only.
 */
export const secureGet = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  return SecureStore.getItemAsync(key);
};

export const secureSet = async (key: string, value: string): Promise<void> => {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      /* private mode */
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
};

export const secureDelete = async (key: string): Promise<void> => {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* private mode */
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
};

export const cacheGet = async <T>(key: string): Promise<T | null> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

export const cacheSet = async (key: string, value: unknown): Promise<void> => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or unavailable storage must not break the app */
  }
};

export const cacheClear = async (keys: string[]): Promise<void> => {
  try {
    await AsyncStorage.multiRemove(keys);
  } catch {
    /* ignore */
  }
};
