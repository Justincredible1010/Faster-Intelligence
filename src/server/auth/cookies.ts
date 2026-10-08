import type { Request, Response } from 'express';

export const SESSION_COOKIE = 'sn_session';

export function readCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const raw = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(raw);
    } catch {
      out[key] = raw;
    }
  }
  return out;
}

export function serializeCookie(
  name: string,
  value: string,
  options: { httpOnly?: boolean; secure?: boolean; maxAge?: number; path?: string }
): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${options.path ?? '/'}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  parts.push('SameSite=Lax');
  return parts.join('; ');
}

export function appendCookie(res: Response, cookie: string): void {
  res.append('Set-Cookie', cookie);
}
