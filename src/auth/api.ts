export interface SessionUser {
  email: string;
  name: string;
  provider: 'google' | 'magic_link' | 'oidc' | 'dev';
  sub: string;
}

export interface SessionResponse {
  authenticated: boolean;
  user: SessionUser | null;
  csrfToken: string;
  provider: 'google' | 'magic_link' | 'oidc' | null;
  allowedDomains: string[];
  devBypass: boolean;
  admin: boolean;
}

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export async function loadSession(): Promise<SessionResponse> {
  const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
  const data = (await res.json()) as SessionResponse;
  if (data.csrfToken) setCsrfToken(data.csrfToken);
  return data;
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  const method = (init.method || 'GET').toUpperCase();
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (method !== 'GET' && method !== 'HEAD' && csrfToken) {
    headers.set('X-CSRF-Token', csrfToken);
  }
  const res = await fetch(input, {
    ...init,
    headers,
    credentials: 'same-origin',
  });
  if (res.status === 401 && !input.includes('/api/auth/')) {
    window.dispatchEvent(new Event('auth:expired'));
  }
  return res;
}

export async function requestMagicLink(email: string): Promise<{ ok: boolean; error?: string }> {
  const res = await apiFetch('/api/auth/magic-link/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data.error || 'Could not send the sign-in email' };
  return { ok: true };
}

export async function verifyMagicLink(token: string): Promise<SessionResponse & { error?: string }> {
  const res = await apiFetch('/api/auth/magic-link/verify', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.csrfToken) setCsrfToken(data.csrfToken);
  if (!res.ok) return { ...data, authenticated: false, error: data.error || 'This sign-in link is invalid or has expired.' };
  return data;
}

export async function devLogin(): Promise<SessionResponse & { error?: string }> {
  const res = await apiFetch('/api/auth/dev-login', { method: 'POST', body: '{}' });
  const data = await res.json().catch(() => ({}));
  if (data.csrfToken) setCsrfToken(data.csrfToken);
  if (!res.ok) return { ...data, authenticated: false, error: data.error || 'Development sign-in is unavailable' };
  return data;
}

export async function logout(): Promise<SessionResponse> {
  const res = await apiFetch('/api/auth/logout', { method: 'POST', body: '{}' });
  const data = (await res.json()) as SessionResponse;
  if (data.csrfToken) setCsrfToken(data.csrfToken);
  return data;
}
