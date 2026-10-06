import { API_BASE } from './config';

export class ApiError extends Error {
  code: string;
  status: number;
  retryAfterMs?: number;

  constructor(code: string, message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export type GetOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};


export async function getJSON<T>(
  path: string,
  { timeoutMs = 10_000, signal }: GetOptions = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    const text = await res.text();
    const body = text ? JSON.parse(text) : null;

    if (!res.ok) {
      const err = body?.error ?? {};
      throw new ApiError(
        err.code ?? 'HTTP_ERROR',
        err.message ?? `Request failed with ${res.status}`,
        res.status,
        err.retryAfterMs,
      );
    }

    return body as T;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new ApiError('TIMEOUT', `Request timed out after ${timeoutMs}ms`, 0);
    }
    if (err instanceof ApiError) throw err;
    throw new ApiError('NETWORK', err.message ?? 'Network error', 0);
  } finally {
    clearTimeout(timer);
  }
}