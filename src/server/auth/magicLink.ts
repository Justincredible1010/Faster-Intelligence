import { createHash } from 'crypto';
import type { AuthConfig } from './config';
import { isEmailDomainAllowed, normalizeEmail } from './domain';
import { createEmailSender, type EmailMessage } from './email';
import { randomToken } from './session';
import { getMagicLinkStore, type MagicLinkRecord } from './stores';

const recentByEmail = new Map<string, number[]>();
const recentByIp = new Map<string, number[]>();

const MAX_REQUESTS = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function clearMagicLinks(): void {
  getMagicLinkStore().clear();
  recentByEmail.clear();
  recentByIp.clear();
}

function sweep(now = Date.now()): void {
  const links = getMagicLinkStore();
  for (const [hash, record] of links.entries()) {
    if (record.expiresAt <= now) links.delete(hash);
  }
}

function tooMany(bucket: Map<string, number[]>, key: string, now = Date.now()): boolean {
  const stamps = (bucket.get(key) || []).filter((stamp) => now - stamp < RATE_WINDOW_MS);
  bucket.set(key, stamps);
  return stamps.length >= MAX_REQUESTS;
}

function remember(bucket: Map<string, number[]>, key: string, now = Date.now()): void {
  const stamps = bucket.get(key) || [];
  stamps.push(now);
  bucket.set(key, stamps);
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

export async function requestMagicLink(
  email: unknown,
  config: AuthConfig,
  appUrl: string,
  clientIp = 'unknown'
): Promise<MagicLinkRequestResult> {
  const normalized = assertMagicLinkEmail(email, config);
  const ip = clientIp.trim() || 'unknown';
  sweep();
  if (tooMany(recentByEmail, normalized) || tooMany(recentByIp, ip)) {
    throw new MagicLinkRejected('Too many sign-in emails were requested. Try again later.', 429);
  }
  const token = randomToken(32);
  const tokenHash = hashToken(token);
  const now = Date.now();
  const links = getMagicLinkStore();
  const record: MagicLinkRecord = {
    email: normalized,
    createdAt: now,
    expiresAt: now + config.magicLinkTtlSeconds * 1000,
  };
  links.set(tokenHash, record);
  if (links.size() > 1000) {
    let oldest: { hash: string; createdAt: number } | null = null;
    for (const [hash, existing] of links.entries()) {
      if (!oldest || existing.createdAt < oldest.createdAt) oldest = { hash, createdAt: existing.createdAt };
    }
    if (oldest && oldest.hash !== tokenHash) links.delete(oldest.hash);
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
    getMagicLinkStore().delete(tokenHash);
    throw err;
  }
  remember(recentByEmail, normalized, now);
  remember(recentByIp, ip, now);
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
  const links = getMagicLinkStore();
  const record = links.get(tokenHash);
  if (!record) return null;
  links.delete(tokenHash);
  if (record.expiresAt <= Date.now()) return null;
  if (!isEmailDomainAllowed(record.email, config.allowedDomains, config.allowedSubdomains)) return null;
  return record.email;
}
