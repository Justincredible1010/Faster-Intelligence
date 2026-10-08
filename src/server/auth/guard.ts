import type { NextFunction, Request, Response } from 'express';
import { loadAuthConfig } from './config';
import { readSession, safeEqual, type SessionRecord } from './session';

const PUBLIC_GET = new Set(['/api/auth/session', '/api/auth/login', '/api/auth/callback']);
const PUBLIC_POST = new Set([
  '/api/auth/magic-link/request',
  '/api/auth/magic-link/verify',
  '/api/auth/dev-login',
  '/api/auth/logout',
]);

function normalizeApiPath(path: string): string {
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path;
}

export function getRequestSession(res: Response): SessionRecord | null {
  return (res.locals.authSession as SessionRecord | null) ?? null;
}

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  const session = getRequestSession(res);
  const header = req.get('x-csrf-token') || '';
  if (!session || !header || !safeEqual(header, session.csrfToken)) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const session = getRequestSession(res);
  if (!session?.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  const config = loadAuthConfig();
  if (!config.adminEmails.includes(session.user.email)) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}

/**
 * Default-deny guard for every /api route. Public auth endpoints are listed
 * explicitly; everything else requires a server-side session. State-changing
 * requests also require the session CSRF token.
 */
export function apiGuard(req: Request, res: Response, next: NextFunction): void {
  if (!req.path.startsWith('/api')) {
    next();
    return;
  }

  let session: SessionRecord | null = null;
  try {
    session = readSession(req);
  } catch (err) {
    console.error('[auth] session configuration error', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Authentication is not configured' });
    return;
  }
  res.locals.authSession = session;
  res.locals.authUser = session?.user ?? null;

  const path = normalizeApiPath(req.path);
  const method = req.method.toUpperCase();
  const isPublic = (method === 'GET' || method === 'HEAD') ? PUBLIC_GET.has(path) : method === 'POST' && PUBLIC_POST.has(path);

  if (!isPublic && !session?.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    requireCsrf(req, res, next);
    return;
  }
  next();
}
