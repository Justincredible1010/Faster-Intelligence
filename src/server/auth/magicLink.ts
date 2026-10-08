import { createHash } from 'crypto';
import type { AuthConfig } from './config';
import { isEmailDomainAllowed, normalizeEmail } from './domain';
import { createEmailSender, type EmailMessage } from './email';
import { randomToken } from './session';

interface MagicRecord {
  email: string;
  expiresAt: number;
  createdAt: number;
}

const links = new Map<string, MagicRecord>();
const recentRequests = new Map<string, number[]>();

const MAX_REQUESTS = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function clearMagicLinks(): void {
  links.clear();
  recentRequests.clear();
}

function sweep(now = Date.now()): void {
  for (const [hash, record] of links) {
    if (record.expiresAt <= now) links.delete(hash);
  }
}

function tooMany(email: string, now = Date.now()): boolean {
  const stamps = (recentRequests.get(email) || []).filter((stamp) => now - stamp < RATE_WINDOW_MS);
  recentRequests.set(email, stamps);
  return stamps.length >= MAX_REQUESTS;
}

function remember(email: string, now = Date.now()): void {
  const stamps = recentRequests.get(email) || [];
  stamps.push(now);
  recentRequests.set(email, stamps);
}

export interface MagicLinkRequestResult {
  ok: true;
}

export function assertMagicLinkEmail(email: unknown, config: AuthConfig): string {
  const normalized = typeof email === 'string' ? normalizeEmail(email) : null;
  if (!normalized || !isEmailDomainAllowed(normalized, config.allowedDomains, config.allowedSubdomains)) {
    throw new MagicLinkRejected('Use a verified @' + (config.allowedDomains[0] || 'springernature.com') + ' email address.');
  }
  return normalized;
}

export class MagicLinkRejected extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
    this.name = 'MagicLinkRejected';
  }
}

export async function requestMagicLink(email: unknown, config: AuthConfig, appUrl: string): Promise<MagicLinkRequestResult> {
  const normalized = assertMagicLinkEmail(email, config);
  sweep();
  if (tooMany(normalized)) {
    throw new MagicLinkRejected('Too many sign-in emails were requested. Try again later.', 429);
  }
  const token = randomToken(32);
  const tokenHash = hashToken(token);
  const now = Date.now();
  links.set(tokenHash, {
    email: normalized,
    createdAt: now,
    expiresAt: now + config.magicLinkTtlSeconds * 1000,
  });
  if (links.size > 1000) {
    const oldest = [...links.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
    if (oldest && oldest[0] !== tokenHash) links.delete(oldest[0]);
  }
  const link = `${appUrl.replace(/\/+$/, '')}/#magic=${token}`;
  const safeLink = escapeHtml(link);
  const minutes = Math.round(config.magicLinkTtlSeconds / 60);
  const message: EmailMessage = {
    to: normalized,
    subject: 'Sign in to Marketing Content Generation Engine',
    text: [
      `Use this link to sign in. It expires in ${minutes} minutes and can be used once:`,
      link,
      '',
      'Open the link, then confirm sign-in in the browser. If you did not request this, you can ignore the email.',
    ].join('\n'),
    html: `<p>Use this link to sign in. It expires in ${minutes} minutes and can be used once.</p><p><a href="${safeLink}">Sign in</a></p><p>Open the link, then confirm sign-in in the browser. If you did not request this, you can ignore the email.</p>`,
  };
  try {
    const sender = createEmailSender(config.emailTransport);
    await sender.send(message);
  } catch (err) {
    links.delete(tokenHash);
    throw err;
  }
  remember(normalized, now);
  return { ok: true };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

export function consumeMagicLink(token: unknown, config: AuthConfig): string | null {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  sweep();
  const tokenHash = hashToken(token);
  const record = links.get(tokenHash);
  if (!record) return null;
  links.delete(tokenHash);
  if (record.expiresAt <= Date.now()) return null;
  if (!isEmailDomainAllowed(record.email, config.allowedDomains, config.allowedSubdomains)) return null;
  return record.email;
}
