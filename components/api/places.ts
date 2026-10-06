import { getJSON, GetOptions } from './client';
import type {
  PlacesPointerResponse,
  PlacesBlobResponse,
  PlaceResponse,
  PlacesMetaResponse,
} from './types';

export const placesApi = {
  placesPointer: (opts: GetOptions = {}) =>
    getJSON<PlacesPointerResponse>('/v1/places', {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  placesMeta: (opts: GetOptions = {}) =>
    getJSON<PlacesMetaResponse>('/v1/places/meta', {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  placesLatest: (opts: GetOptions = {}) =>
    getJSON<PlacesBlobResponse>('/v1/places/latest', {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  placesBlob: (hash: string, opts: GetOptions = {}) =>
    getJSON<PlacesBlobResponse>(`/v1/places/${encodeURIComponent(hash)}`, {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  place: (hash: string, id: string, opts: GetOptions = {}) =>
    getJSON<PlaceResponse>(
      `/v1/places/${encodeURIComponent(hash)}/items/${encodeURIComponent(id)}`,
      { signal: opts.signal, timeoutMs: opts.timeoutMs },
    ),
};