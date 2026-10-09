import type { FieldIssue } from '@/lib/validation';

export interface ApiError {
  status: number;
  code: string;
  message: string;
  issues: FieldIssue[];
  details?: unknown;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/**
 * Calls the app's own JSON API. Never throws: network failures and server
 * errors both come back as a readable message the UI can show next to the
 * action that failed.
 */
export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  const { method = 'GET', body } = options;
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch {
    return {
      ok: false,
      error: { status: 0, code: 'NETWORK', message: 'Could not reach the server. Check the connection and try again.', issues: [] },
    };
  }

  const payload = await response.json().catch(() => null);
  if (response.ok) return { ok: true, data: payload as T };

  const error = payload?.error ?? {};
  return {
    ok: false,
    error: {
      status: response.status,
      code: error.code ?? 'UNKNOWN',
      message: error.message ?? `Request failed (${response.status}).`,
      issues: error.details?.issues ?? [],
      details: error.details,
    },
  };
}
