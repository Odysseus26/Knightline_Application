import AsyncStorage from '@react-native-async-storage/async-storage';
import { FIRST_TIME_KEY } from './types';

export async function isFirstTime(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(FIRST_TIME_KEY);
    return value == null;
  } catch {
    return true;
  }
}

export async function markFirstTimeComplete(): Promise<void> {
  try {
    await AsyncStorage.setItem(FIRST_TIME_KEY, 'false');
  } catch {}
}