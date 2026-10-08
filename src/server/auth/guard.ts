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

function decodeRepeated(value: string, times = 2): string {
  let current = value;
  for (let i = 0; i < times; i++) {
    if (!current.includes('%')) break;
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current;
}

function collapseDotSegments(path: string): string {
  const parts: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `/${parts.join('/')}`;
}

/** Lowercase, percent-decode (twice), and drop the query, hash, and trailing slash. */
export function normalizeRequestPath(input: string): string {
  const raw = input.split('?')[0]?.split('#')[0] || '/';
  const decoded = decodeRepeated(raw).replace(/\\/g, '/').toLowerCase();
  let path = collapseDotSegments(decoded);
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path || '/';
}

function isApiPath(path: string): boolean {
  return path === '/api' || path.startsWith('/api/');
}

/**
 * Express matches routes case-insensitively unless case-sensitive routing is on,
 * and it decodes the path once before matching. Compare a normalised path so
 * `/API/...` and `/%41PI/...` cannot skip this guard and still hit a handler.
 * `originalUrl` is required because a guard mounted at `/api` sees a stripped `req.path`.
 */
export function normalizedApiPath(req: Request): string | null {
  const candidates = [req.originalUrl, req.url, req.path];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const path = normalizeRequestPath(candidate);
    if (isApiPath(path)) return path;
  }
  return null;
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
  const path = normalizedApiPath(req);
  if (!path) {
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
