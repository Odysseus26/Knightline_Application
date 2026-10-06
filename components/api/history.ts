import { getJSON, GetOptions } from './client';
import type {
  LiveResponse,
  LiveBusesResponse,
  LiveBusResponse,
  LiveAlertsResponse,
  LiveScheduleResponse,
} from './types';

export type HistoryFilterOptions = GetOptions & {
  route?: string;
  routes?: string[];
  fields?: string[];
};

function buildQuery(opts: HistoryFilterOptions = {}): string {
  const params: string[] = ['window=old'];
  if (opts.route) params.push(`route=${encodeURIComponent(opts.route)}`);
  if (opts.routes?.length) {
    params.push(`routes=${opts.routes.map(encodeURIComponent).join(',')}`);
  }
  if (opts.fields?.length) params.push(`fields=${opts.fields.join(',')}`);
  return `?${params.join('&')}`;
}

export const historyApi = {

  liveHistory: (opts: HistoryFilterOptions = {}) =>
    getJSON<LiveResponse>(`/v1/live${buildQuery(opts)}`, {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  liveBusesHistory: (opts: HistoryFilterOptions = {}) =>
    getJSON<LiveBusesResponse>(`/v1/live/buses${buildQuery(opts)}`, {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  liveBusHistory: (name: string, opts: GetOptions = {}) =>
    getJSON<LiveBusResponse>(
      `/v1/live/buses/${encodeURIComponent(name)}?window=old`,
      { signal: opts.signal, timeoutMs: opts.timeoutMs },
    ),

  liveAlertsHistory: (opts: GetOptions = {}) =>
    getJSON<LiveAlertsResponse>('/v1/live/alerts?window=old', {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),

  liveScheduleHistory: (opts: GetOptions = {}) =>
    getJSON<LiveScheduleResponse>('/v1/live/schedule?window=old', {
      signal: opts.signal,
      timeoutMs: opts.timeoutMs,
    }),
};