import { getJSON, GetOptions } from './client';
import type {
  LiveResponse,
  LiveBusesResponse,
  LiveBusResponse,
  LiveAlertsResponse,
  LiveScheduleResponse,
} from './types';

export type LiveFilterOptions = GetOptions & {
  route?: string;
  routes?: string[];
  fields?: string[];
};

function buildQuery(opts: LiveFilterOptions = {}): string {
  const params: string[] = [];
  if (opts.route) params.push(`route=${encodeURIComponent(opts.route)}`);
  if (opts.routes?.length) {
    params.push(`routes=${opts.routes.map(encodeURIComponent).join(',')}`);
  }
  if (opts.fields?.length) params.push(`fields=${opts.fields.join(',')}`);
  return params.length ? `?${params.join('&')}` : '';
}

export const liveApi = {
  liveSnapshot: (opts: LiveFilterOptions = {}) =>
    getJSON<LiveResponse>(`/v1/live${buildQuery(opts)}`, {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  liveBuses: (opts: LiveFilterOptions = {}) =>
    getJSON<LiveBusesResponse>(`/v1/live/buses${buildQuery(opts)}`, {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  liveBus: (name: string, opts: GetOptions = {}) =>
    getJSON<LiveBusResponse>(`/v1/live/buses/${encodeURIComponent(name)}`, {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  liveAlerts: (opts: GetOptions = {}) =>
    getJSON<LiveAlertsResponse>('/v1/live/alerts', {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  liveSchedule: (opts: GetOptions = {}) =>
    getJSON<LiveScheduleResponse>('/v1/live/schedule', {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),
};