import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { isPreviewBypassEnabled, loadAuthConfig, previewBypassEmail, type AuthConfig } from './config';
import { appendCookie, readCookies, serializeCookie, SESSION_COOKIE } from './cookies';
import { getOauthStateStore, getSessionStore } from './stores';

export type AuthProviderId = 'google' | 'magic_link' | 'oidc' | 'dev';

export interface AuthUser {
  sub: string;
  email: string;
  name?: string;
  emailVerified: true;
  provider: AuthProviderId;
  hd?: string;
}

export interface OauthTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
}

export interface SessionRecord {
  id: string;
  csrfToken: string;
  createdAt: number;
  expiresAt: number;
  user: AuthUser | null;
  oauth?: OauthTransaction;
}

export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

function sign(id: string, secret: string): string {
  return createHmac('sha256', secret).update(id).digest('base64url');
}

export function sealSessionId(id: string, secret: string): string {
  return `${id}.${sign(id, secret)}`;
}

export function openSessionId(token: string, secret: string): string | null {
  const idx = token.lastIndexOf('.');
  if (idx <= 0) return null;
  const id = token.slice(0, idx);
  const signature = token.slice(idx + 1);
  if (!id || !signature) return null;
  if (!safeEqual(signature, sign(id, secret))) return null;
  return id;
}

export function cookieSecure(): boolean {
  if (process.env.NODE_ENV !== 'production') return false;
  return (process.env.APP_URL || '').trim().toLowerCase().startsWith('https://');
}

/** Header used by the framed AI Studio preview, where third-party cookies are dropped. */
export const SESSION_HEADER = 'x-session-token';

/** Preview only: a cross-site iframe needs SameSite=None; Secure for the cookie to be kept. */
function cookieSameSite(): 'Lax' | 'None' {
  return isPreviewBypassEnabled() ? 'None' : 'Lax';
}

function ttlFor(session: SessionRecord, config: AuthConfig): number {
  if (session.user) return config.sessionTtlSeconds;
  return 30 * 60;
}

export function writeSessionCookie(res: Response, session: SessionRecord, config: AuthConfig = loadAuthConfig()): void {
  const token = sealSessionId(session.id, config.sessionSecret);
  appendCookie(
    res,
    serializeCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: cookieSameSite(),
      maxAge: ttlFor(session, config),
      path: '/',
    })
  );
}

export function clearSessionCookie(res: Response): void {
  appendCookie(
    res,
    serializeCookie(SESSION_COOKIE, '', {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: cookieSameSite(),
      maxAge: 0,
      path: '/',
    })
  );
}

export function createSession(user: AuthUser | null, ttlSeconds?: number): SessionRecord {
  const now = Date.now();
  const config = loadAuthConfig();
  const ttl = (ttlSeconds ?? (user ? config.sessionTtlSeconds : 30 * 60)) * 1000;
  const session: SessionRecord = {
    id: randomToken(32),
    csrfToken: randomToken(32),
    createdAt: now,
    expiresAt: now + ttl,
    user,
  };
  getSessionStore().set(session);
  return session;
}

// Signed-out preview tokens. In memory: a restart forgets them, but tokens still expire on their own.
const revokedPreview = new Set<string>();

export function destroySession(id: string): void {
  if (id.startsWith('preview:')) revokedPreview.add(id);
  getSessionStore().delete(id);
  getOauthStateStore().delete(id);
}

export function getSession(id: string): SessionRecord | null {
  const session = getSessionStore().get(id);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    destroySession(id);
    return null;
  }
  return session;
}

export function saveOauthTransaction(session: SessionRecord, transaction: OauthTransaction): void {
  getOauthStateStore().set(session.id, transaction);
  session.oauth = transaction;
}

export function readOauthTransaction(session: SessionRecord): OauthTransaction | null {
  const transaction = getOauthStateStore().get(session.id);
  if (!transaction) return null;
  if (Date.now() - transaction.createdAt > 10 * 60 * 1000) {
    getOauthStateStore().delete(session.id);
    delete session.oauth;
    return null;
  }
  session.oauth = transaction;
  return transaction;
}

const PREVIEW_TOKEN_PREFIX = 'pv1.';

/**
 * Preview only: a self-contained signed token for the one preview user. It needs no
 * cookie, no browser storage and no shared server memory, so it keeps working when
 * the AI Studio dev server restarts or a request lands on another instance.
 */
export function issuePreviewToken(email: string, csrfToken: string, config: AuthConfig = loadAuthConfig()): string {
  const payload = Buffer.from(JSON.stringify({ e: email, c: csrfToken, x: Date.now() + config.sessionTtlSeconds * 1000 })).toString('base64url');
  const body = `${PREVIEW_TOKEN_PREFIX}${payload}`;
  return `${body}.${sign(body, config.sessionSecret)}`;
}

export function readPreviewToken(token: string, config: AuthConfig = loadAuthConfig()): SessionRecord | null {
  if (!token.startsWith(PREVIEW_TOKEN_PREFIX) || token.length > 1024) return null;
  const allowed = previewBypassEmail();
  if (!allowed) return null;
  const idx = token.lastIndexOf('.');
  const body = token.slice(0, idx);
  const signature = token.slice(idx + 1);
  if (!signature || !safeEqual(signature, sign(body, config.sessionSecret))) return null;
  try {
    const data = JSON.parse(Buffer.from(body.slice(PREVIEW_TOKEN_PREFIX.length), 'base64url').toString('utf8'));
    if (data.e !== allowed || typeof data.c !== 'string' || typeof data.x !== 'number' || data.x <= Date.now()) return null;
    const id = `preview:${createHmac('sha256', config.sessionSecret).update(token).digest('base64url').slice(0, 32)}`;
    if (revokedPreview.has(id)) return null;
    return {
      id,
      csrfToken: data.c,
      createdAt: data.x - config.sessionTtlSeconds * 1000,
      expiresAt: data.x,
      user: { sub: PREVIEW_BYPASS_SUB, email: allowed, name: config.devUserName, emailVerified: true, provider: 'dev' },
    };
  } catch {
    return null;
  }
}

function sessionFromToken(token: string, config: AuthConfig): SessionRecord | null {
  if (token.startsWith(PREVIEW_TOKEN_PREFIX)) return readPreviewToken(token, config);
  const id = openSessionId(token, config.sessionSecret);
  return id ? getSession(id) : null;
}

export function readSession(req: Request, config: AuthConfig = loadAuthConfig()): SessionRecord | null {
  const cookie = readCookies(req)[SESSION_COOKIE];
  const fromCookie = cookie ? sessionFromToken(cookie, config) : null;
  if (fromCookie) return fromCookie;
  // Header fallback is accepted only while the explicit preview bypass is on. It is
  // also tried when a stale or foreign cookie is present, not only when none is sent.
  if (isPreviewBypassEnabled()) {
    const header = (req.get?.(SESSION_HEADER) || '').trim();
    if (header && header.length <= 1024) return sessionFromToken(header, config);
  }
  return null;
}

/** Reuse a live anonymous-or-user session, or issue a new anonymous one and set the cookie. */
export function ensureSession(req: Request, res: Response): SessionRecord {
  const existing = readSession(req);
  if (existing) return existing;
  const session = createSession(null);
  writeSessionCookie(res, session);
  return session;
}

/**
 * Replace the browser session id after a privilege change so a pre-login
 * cookie cannot be replayed as the authenticated session.
 */
export function rotateSession(res: Response, user: AuthUser, previous?: SessionRecord | null): SessionRecord {
  if (previous) destroySession(previous.id);
  const session = createSession(user);
  writeSessionCookie(res, session);
  return session;
}

export function clearAllSessions(): void {
  revokedPreview.clear();
  getSessionStore().clear();
  getOauthStateStore().clear();
}

export const PREVIEW_BYPASS_SUB = 'preview-bypass';

/** Preview-bypass sessions are never admins, whatever AUTH_ADMIN_EMAILS says. */
export function isPreviewBypassUser(user: AuthUser | null | undefined): boolean {
  return !!user && user.provider === 'dev' && user.sub === PREVIEW_BYPASS_SUB;
}

export function isAdminEmail(email: string, config: AuthConfig = loadAuthConfig()): boolean {
  return config.adminEmails.includes(email.trim().toLowerCase());
}

export function publicSessionUser(user: AuthUser) {
  return {
    email: user.email,
    name: user.name || user.email,
    provider: user.provider,
    sub: user.sub,
  };
}
