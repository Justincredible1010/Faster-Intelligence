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
  /** Present only while the server's AI Studio preview bypass is on. */
  sessionToken?: string;
}

let csrfToken: string | null = null;
// Memory only (never localStorage). Used when the framed preview drops cookies.
let sessionToken: string | null = null;
const REQUEST_TIMEOUT_MS = 15000;

function remember(data: Partial<SessionResponse> | null | undefined): void {
  if (!data) return;
  if (data.csrfToken) setCsrfToken(data.csrfToken);
  if (data.sessionToken) sessionToken = data.sessionToken;
}

async function failureMessage(res: Response, fallback: string): Promise<string> {
  const data = await res.clone().json().catch(() => null);
  if (data && typeof data.error === 'string') return data.error;
  return `${fallback} (HTTP ${res.status})`;
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export async function loadSession(): Promise<SessionResponse> {
  const headers = new Headers();
  if (sessionToken) headers.set('X-Session-Token', sessionToken);
  const res = await fetch('/api/auth/session', { credentials: 'include', headers });
  const data = (await res.json()) as SessionResponse;
  remember(data);
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
  if (sessionToken) headers.set('X-Session-Token', sessionToken);
  const res = await fetch(input, {
    ...init,
    headers,
    credentials: 'include',
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
  remember(data);
  if (!res.ok) return { ...data, authenticated: false, error: data.error || 'This sign-in link is invalid or has expired.' };
  return data;
}

export async function devLogin(): Promise<SessionResponse & { error?: string }> {
  let res: Response;
  try {
    res = await apiFetch('/api/auth/dev-login', { method: 'POST', body: '{}', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    return { authenticated: false, error: 'Test sign-in timed out. Reload the preview and try again.' } as SessionResponse & { error: string };
  }
  if (!res.ok) {
    const error = await failureMessage(res, 'Development sign-in is unavailable');
    return { authenticated: false, error } as SessionResponse & { error: string };
  }
  const data = await res.json().catch(() => ({}));
  remember(data);
  return data;
}

export async function logout(): Promise<SessionResponse> {
  const res = await apiFetch('/api/auth/logout', { method: 'POST', body: '{}' });
  const data = (await res.json()) as SessionResponse;
  sessionToken = null;
  remember(data);
  return data;
}
