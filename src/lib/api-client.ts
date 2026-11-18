'use client';

let csrfCache: string | null = null;

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`));
  if (!match) return null;
  const val = decodeURIComponent(match.split('=').slice(1).join('=')).trim();
  // Ensure token has valid minimum length and characters
  if (val.length < 16 || !/^[A-Za-z0-9_-]+$/.test(val)) {
    return null;
  }
  return val;
}

export function clearCsrfCache(): void {
  csrfCache = null;
}

export async function ensureCsrfToken(forceFresh = false): Promise<string> {
  if (!forceFresh) {
    const fromCookie = readCookie('tf_csrf');
    if (fromCookie) {
      csrfCache = fromCookie;
      return fromCookie;
    }
    if (csrfCache && csrfCache.length >= 16) {
      return csrfCache;
    }
  }

  // Clear cache and fetch fresh token from server (which sets/refreshes tf_csrf cookie)
  csrfCache = null;
  try {
    const res = await fetch('/api/csrf?refresh=1', { credentials: 'include' });
    const data = (await res.json()) as { csrfToken?: string };
    if (data?.csrfToken && data.csrfToken.length >= 16) {
      csrfCache = data.csrfToken;
      return data.csrfToken;
    }
  } catch {
    // network or endpoint error fallback
  }

  // Final check if cookie was set by response
  const cookieNow = readCookie('tf_csrf');
  if (cookieNow) {
    csrfCache = cookieNow;
    return cookieNow;
  }

  return csrfCache || '';
}

export async function apiFetch<T>(
  path: string,
  {
    method = 'GET',
    body = null,
    csrf = true,
    _retry = 0,
  }: {
    method?: string;
    body?: unknown;
    csrf?: boolean;
    _retry?: number;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== null) {
    headers['Content-Type'] = 'application/json';
  }
  const isMutating = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  if (isMutating && csrf) {
    headers['X-CSRF-Token'] = await ensureCsrfToken(_retry > 0);
  }

  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const isCsrfError =
      res.status === 403 &&
      (data?.error?.code === 'CSRF_INVALID' ||
        data?.error?.code === 'CSRF_TOKEN_INVALID' ||
        data?.error?.code === 'CSRF_MISSING' ||
        data?.error?.message?.toLowerCase?.()?.includes('csrf'));

    // Auto-retry once with a freshly re-issued CSRF token if the first attempt failed due to CSRF
    if (isCsrfError && _retry === 0 && isMutating && csrf) {
      clearCsrfCache();
      return apiFetch<T>(path, { method, body, csrf, _retry: 1 });
    }

    const message = isCsrfError
      ? 'Session expired, please refresh the page'
      : data?.error?.message || 'Request failed';

    const err = new Error(message) as Error & {
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
