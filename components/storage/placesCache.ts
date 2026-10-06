import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PlacesBlobResponse } from '../api';

const KEY_PREFIX = 'places:';
const MAX_BLOB_BYTES = 2 * 1024 * 1024;

export async function readCachedPlaces(
  hash: string,
): Promise<PlacesBlobResponse | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_PREFIX + hash);
    return raw ? (JSON.parse(raw) as PlacesBlobResponse) : null;
  } catch {
    return null;
  }
}

export async function writeCachedPlaces(
  hash: string,
  blob: PlacesBlobResponse,
): Promise<void> {
  const serialized = JSON.stringify(blob);
  if (serialized.length > MAX_BLOB_BYTES) {
    throw new Error(
      `places blob too large to cache: ${serialized.length} > ${MAX_BLOB_BYTES}`,
    );
  }
  try {
    await AsyncStorage.setItem(KEY_PREFIX + hash, serialized);
  } catch {
    /* best-effort */
  }
}