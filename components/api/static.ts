import { getJSON, GetOptions } from './client';
import type {
  StaticPointerResponse,
  StaticBlobResponse,
  IndexBlobResponse,
  RoutesListResponse,
  RouteDefinition,
  RouteStreetsResponse,
  StopsListResponse,
  StopResponse,
  StopRoutesResponse,
  StreetsListResponse,
  StreetResponse,
  ActiveRoutesResponse,
} from './types';

export const staticApi = {
  staticPointer: (opts: GetOptions = {}) =>
    getJSON<StaticPointerResponse>('/v1/static', {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  staticBlob: (hash: string, opts: GetOptions = {}) =>
    getJSON<StaticBlobResponse>(`/v1/static/${encodeURIComponent(hash)}`, {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  staticIndex: (hash: string, opts: GetOptions = {}) =>
    getJSON<IndexBlobResponse>(`/v1/static/${encodeURIComponent(hash)}/index`, {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  routes: (opts: GetOptions = {}) =>
    getJSON<RoutesListResponse>('/v1/routes', {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  routesActive: (opts: GetOptions = {}) =>
    getJSON<ActiveRoutesResponse>('/v1/routes/active', {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  route: (name: string, opts: GetOptions = {}) =>
    getJSON<RouteDefinition>(`/v1/routes/${encodeURIComponent(name)}`, {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  routeStreets: (name: string, opts: GetOptions = {}) =>
    getJSON<RouteStreetsResponse>(
      `/v1/routes/${encodeURIComponent(name)}/streets`,
      { signal: opts.signal, timeoutMs: opts.timeoutMs },
    ),

  stops: (opts: GetOptions = {}) =>
    getJSON<StopsListResponse>('/v1/stops', {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  stop: (stopId: string, opts: GetOptions = {}) =>
    getJSON<StopResponse>(`/v1/stops/${encodeURIComponent(stopId)}`, {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  stopRoutes: (stopId: string, opts: GetOptions = {}) =>
    getJSON<StopRoutesResponse>(
      `/v1/stops/${encodeURIComponent(stopId)}/routes`,
      { signal: opts.signal, timeoutMs: opts.timeoutMs },
    ),

  streets: (opts: GetOptions = {}) =>
    getJSON<StreetsListResponse>('/v1/streets', {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  street: (name: string, opts: GetOptions = {}) =>
    getJSON<StreetResponse>(`/v1/streets/${encodeURIComponent(name)}`, {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),
};