const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

let accessToken = null;
let csrfTokenCache = null;

export function setAccessToken(token) {
  accessToken = token || null;
}

export function getAccessToken() {
  return accessToken;
}

export function setCsrfToken(token) {
  csrfTokenCache = token || null;
}

function readCookie(name) {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.split('=').slice(1).join('=')) : null;
}

async function ensureCsrfToken() {
  const fromCookie = readCookie('tf_csrf');
  if (fromCookie) {
    csrfTokenCache = fromCookie;
    return fromCookie;
  }
  if (csrfTokenCache) return csrfTokenCache;

  const res = await fetch(`${API_BASE}/auth/csrf-token`, { credentials: 'include' });
  const data = await res.json();
  csrfTokenCache = data.csrfToken;
  return csrfTokenCache;
}

async function refreshStaffToken() {
  const csrf = await ensureCsrfToken();
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrf || '',
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    setAccessToken(null);
    return null;
  }
  const data = await res.json();
  setAccessToken(data.accessToken);
  if (data.csrfToken) setCsrfToken(data.csrfToken);
  return data;
}

export async function apiRequest(path, { method = 'GET', body = null, isFormData = false, auth = false, csrf = false, _retried = false } = {}) {
  const headers = {};
  if (!isFormData && body !== null) {
    headers['Content-Type'] = 'application/json';
  }
  if (auth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  if (csrf && method !== 'GET') {
    headers['X-CSRF-Token'] = (await ensureCsrfToken()) || '';
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: 'include',
    headers,
    body: body === null ? undefined : isFormData ? body : JSON.stringify(body),
  });

  if (res.status === 401 && auth && !_retried) {
    const refreshed = await refreshStaffToken();
    if (refreshed?.accessToken) {
      return apiRequest(path, { method, body, isFormData, auth, csrf, _retried: true });
    }
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const message = data?.error?.message || 'Request failed';
    const err = new Error(message);
    err.status = res.status;
    err.code = data?.error?.code;
    err.details = data?.error?.details;
    throw err;
  }

  if (data?.csrfToken) {
    setCsrfToken(data.csrfToken);
  }
  return data;
}

export { refreshStaffToken };
