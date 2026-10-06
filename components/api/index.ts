import { getJSON, ApiError, type GetOptions } from './client';
import { liveApi } from './live';
import { staticApi } from './static';
import { historyApi } from './history';
import { placesApi } from './places';
import type { BootstrapResponse } from './types';

async function bootstrap(
  have?: string,
  opts: GetOptions & { includeIndex?: boolean } = {},
): Promise<BootstrapResponse> {
  const params: string[] = [];
  if (have) params.push(`have=${encodeURIComponent(have)}`);
  if (opts.includeIndex === false) params.push('index=false');
  const qs = params.length ? `?${params.join('&')}` : '';

  return getJSON<BootstrapResponse>(`/v1/bootstrap${qs}`, {
    signal: opts.signal,
    timeoutMs: opts.timeoutMs,
  });
}

export const api = {
  ...liveApi,
  ...staticApi,
  ...historyApi,
  ...placesApi,
  bootstrap,
};

export { ApiError } from './client';
export { API_BASE } from './config';
export type * from './types';