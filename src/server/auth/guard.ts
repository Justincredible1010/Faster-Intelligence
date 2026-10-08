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

function pathOnly(input: string): string {
  return input.split('?')[0]?.split('#')[0] || '/';
}

/** Raw path plus up to two percent-decodes, so double-encoded sequences are visible. */
function decodeSteps(value: string): string[] {
  const steps = [value];
  let current = value;
  for (let i = 0; i < 2; i++) {
    if (!current.includes('%')) break;
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      steps.push(next);
      current = next;
    } catch {
      break;
    }
  }
  return steps;
}

function hasEncodedSlash(value: string): boolean {
  return /%2f/i.test(value) || /%5c/i.test(value);
}

function isUnsafePath(value: string): boolean {
  return value.includes('..') || value.includes('\\') || hasEncodedSlash(value);
}

function isDirectApiPath(value: string): boolean {
  const lower = value.toLowerCase();
  return lower === '/api' || lower.startsWith('/api/');
}

function mentionsApiSegment(value: string): boolean {
  return /(^|\/)api(\/|$)/i.test(value);
}

/**
 * Lowercase, percent-decode (twice), and drop the query, hash, and trailing slash.
 * Dot segments are not collapsed. Collapsing made a cache id such as
 * `x%2F..%2Fauth%2Fsession` look like the public session route while Express
 * still routed the encoded slash to `/api/cache/journal/:journalId`.
 */
export function normalizeRequestPath(input: string): string {
  const steps = decodeSteps(pathOnly(input));
  let path = (steps[steps.length - 1] || '/').toLowerCase();
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path || '/';
}

/**
 * `reject` — an /api path contains `..`, `\`, or an encoded slash (`%2F` / `%5C`,
 * including a double-encoded form visible after one decode).
 * `api` — a safe /api path, matched exactly after normalisation.
 */
export function classifyRequestPath(input: string): 'reject' | 'api' | 'ignore' {
  const steps = decodeSteps(pathOnly(input));
  const unsafe = steps.some(isUnsafePath);
  const directApi = steps.some(isDirectApiPath);
  if (unsafe && (directApi || steps.some(mentionsApiSegment))) return 'reject';
  if (directApi) return 'api';
  return 'ignore';
}

function isApiPath(path: string): boolean {
  return path === '/api' || path.startsWith('/api/');
}

/**
 * Express matches routes case-insensitively unless case-sensitive routing is on,
 * and it decodes the path once before matching. Compare the exact normalised
 * path so `/API/...` and `/%41PI/...` cannot skip this guard. Paths with `..`,
 * backslashes, or encoded slashes are rejected instead of being collapsed.
 * `originalUrl` is required because a guard mounted at `/api` sees a stripped `req.path`.
 */
export function normalizedApiPath(req: Request): string | null {
  const candidates = [req.originalUrl, req.url, req.path];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (classifyRequestPath(candidate) !== 'api') continue;
    const path = normalizeRequestPath(candidate);
    if (isApiPath(path)) return path;
  }
  return null;
}

function rejectedApiRequest(req: Request): boolean {
  const candidates = [req.originalUrl, req.url, req.path];
  return candidates.some((candidate) => !!candidate && classifyRequestPath(candidate) === 'reject');
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
  if (rejectedApiRequest(req)) {
    res.status(400).json({ error: 'Invalid request path' });
    return;
  }

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
