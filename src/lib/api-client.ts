'use client';

let csrfCache: string | null = null;

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

async function ensureCsrfToken(): Promise<string> {
  const fromCookie = readCookie('tf_csrf');
  if (fromCookie) {
    csrfCache = fromCookie;
    return fromCookie;
  }
  if (csrfCache) return csrfCache;

  const res = await fetch('/api/csrf', { credentials: 'include' });
  const data = (await res.json()) as { csrfToken?: string };
  csrfCache = data.csrfToken || '';
  return csrfCache;
}

export async function apiFetch<T>(
  path: string,
  {
    method = 'GET',
    body = null,
    csrf = true,
  }: {
    method?: string;
    body?: unknown;
    csrf?: boolean;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
  }
  const isMutating = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  if (isMutating && csrf) {
    headers['X-CSRF-Token'] = await ensureCsrfToken();
  }

  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || 'Request failed') as Error & {
      status?: number;
      code?: string;
      details?: Record<string, unknown>;
    };
    err.status = res.status;
    err.code = data?.error?.code;
    err.details = data?.error?.details;
    throw err;
  }
  return data as T;
}

