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
  previewPasscodeRequired?: boolean;
}

let csrfToken: string | null = null;
// Held in memory first. Used when the framed preview drops cookies. A copy goes to
// sessionStorage only if the browser allows it; partitioned or blocked storage
// (Safari, Chrome third-party blocking) throws or is empty, and that is fine.
const TOKEN_KEY = 'omnifact.previewSession';
let sessionToken: string | null = readStoredToken();
const REQUEST_TIMEOUT_MS = 15000;

function safeStorage(): Storage | null {
  try {
    const store = typeof window !== 'undefined' ? window.sessionStorage : null;
    if (!store) return null;
    const probe = '__omnifact_probe__';
    store.setItem(probe, '1');
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

function readStoredToken(): string | null {
  try {
    return safeStorage()?.getItem(TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

function setSessionToken(token: string | null): void {
  sessionToken = token;
  try {
    const store = safeStorage();
    if (!store) return;
    if (token) store.setItem(TOKEN_KEY, token);
    else store.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: memory copy is enough */
  }
}

export function getSessionTokenForTests(): string | null {
  return sessionToken;
}

export function resetClientAuthForTests(): void {
  csrfToken = null;
  sessionToken = null;
}

function remember(data: Partial<SessionResponse> | null | undefined): void {
  if (!data) return;
  if (data.csrfToken) setCsrfToken(data.csrfToken);
  if (data.sessionToken) setSessionToken(data.sessionToken);
}

export type SignInErrorCode = 'wrong_passcode' | 'not_configured' | 'too_many_attempts' | 'network' | 'timeout' | 'server_error' | 'session_expired';

export const SIGN_IN_MESSAGES: Record<SignInErrorCode, string> = {
  wrong_passcode: "Wrong preview passcode. Copy AUTH_PREVIEW_PASSCODE from this app's Secrets and try again.",
  not_configured: 'Test sign-in is not configured on this server. Check the AUTH_PREVIEW_* secrets in AI Studio.',
  too_many_attempts: 'Too many wrong passcodes. Wait 15 minutes, then try again.',
  network: 'Network error: could not reach the server. Check your connection and reload the preview.',
  timeout: 'Test sign-in timed out after 15 seconds. Reload the preview and try again.',
  server_error: 'The server hit an error while signing you in. Reload the preview and try again.',
  session_expired: 'Your sign-in session expired. Reload the preview and try again.',
};

/** Map an HTTP failure to a clear, user-facing message. Exported for tests. */
export function signInErrorFor(status: number, body: { error?: unknown; code?: unknown } | null): { code: SignInErrorCode; error: string } {
  const code = typeof body?.code === 'string' ? body.code : '';
  if (code === 'wrong_passcode' || status === 401) return { code: 'wrong_passcode', error: SIGN_IN_MESSAGES.wrong_passcode };
  if (code === 'too_many_attempts' || status === 429) return { code: 'too_many_attempts', error: SIGN_IN_MESSAGES.too_many_attempts };
  if (code === 'not_configured' || status === 404) return { code: 'not_configured', error: SIGN_IN_MESSAGES.not_configured };
  if (code === 'csrf' || status === 403) return { code: 'session_expired', error: SIGN_IN_MESSAGES.session_expired };
  return { code: 'server_error', error: `${SIGN_IN_MESSAGES.server_error} (HTTP ${status})` };
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export async function loadSession(): Promise<SessionResponse> {
  const headers = new Headers();
  if (sessionToken) headers.set('X-Session-Token', sessionToken);
  let res: Response;
  try {
    res = await fetch('/api/auth/session', { credentials: 'include', headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new Error(SIGN_IN_MESSAGES.network);
  }
  const data = (await res.json().catch(() => null)) as SessionResponse | null;
  if (!res.ok || !data || typeof data !== 'object') {
    throw new Error(`Could not load the sign-in page (HTTP ${res.status}). The preview may still be starting; reload in a moment.`);
  }
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

async function postDevLogin(passcode?: string): Promise<Response> {
  return apiFetch('/api/auth/dev-login', {
    method: 'POST',
    body: JSON.stringify(passcode !== undefined ? { passcode } : {}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

export async function devLogin(passcode?: string): Promise<SessionResponse & { error?: string; code?: SignInErrorCode }> {
  const cleaned = passcode === undefined ? undefined : passcode.trim();
  const fail = (code: SignInErrorCode, error: string) => ({ authenticated: false, error, code }) as SessionResponse & { error: string; code: SignInErrorCode };
  let res: Response;
  try {
    res = await postDevLogin(cleaned);
    // Session gone (server restart / other instance): refresh once and retry.
    if (res.status === 403) {
      setSessionToken(null);
      await loadSession().catch(() => undefined);
      res = await postDevLogin(cleaned);
    }
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    return name === 'TimeoutError' || name === 'AbortError' ? fail('timeout', SIGN_IN_MESSAGES.timeout) : fail('network', SIGN_IN_MESSAGES.network);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const mapped = signInErrorFor(res.status, data);
    return fail(mapped.code, mapped.error);
  }
  if (!data || !data.authenticated || !data.user) return fail('server_error', `${SIGN_IN_MESSAGES.server_error} (no session returned)`);
  remember(data);
  return data;
}

export async function logout(): Promise<SessionResponse> {
  const res = await apiFetch('/api/auth/logout', { method: 'POST', body: '{}' });
  const data = (await res.json()) as SessionResponse;
  setSessionToken(null);
  remember(data);
  return data;
}
