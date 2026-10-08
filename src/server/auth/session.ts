import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import type { Request, Response } from 'express';
import { loadAuthConfig, type AuthConfig } from './config';
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

export function destroySession(id: string): void {
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

export function readSession(req: Request, config: AuthConfig = loadAuthConfig()): SessionRecord | null {
  const token = readCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const id = openSessionId(token, config.sessionSecret);
  if (!id) return null;
  return getSession(id);
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
  getSessionStore().clear();
  getOauthStateStore().clear();
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
