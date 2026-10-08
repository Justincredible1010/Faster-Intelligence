import { randomBytes } from 'crypto';
import { isSubdomainOfAllowedApex, isValidHost, normalizeEmail } from './domain';

export type AuthProviderName = 'google' | 'magic_link' | 'oidc';

export interface AuthConfig {
  provider: AuthProviderName | null;
  allowedDomains: string[];
  allowedSubdomains: string[];
  adminEmails: string[];
  sessionTtlSeconds: number;
  sessionSecret: string;
  devBypass: boolean;
  devUserEmail: string;
  devUserName: string;
  googleIssuer: string;
  googleClientId: string;
  googleClientSecret: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcScopes: string;
  magicLinkTtlSeconds: number;
  emailTransport: string;
  appUrl: string | null;
}

const DEFAULT_DOMAIN = 'springernature.com';
const DEFAULT_GOOGLE_ISSUER = 'https://accounts.google.com';

let ephemeralSecret: string | null = null;

export function isDevBypassEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  // Exact match on both values. Production, test, and unset NODE_ENV never qualify.
  return env.NODE_ENV === 'development' && env.AUTH_DEV_BYPASS === 'true';
}

function intEnv(name: string, fallback: number, min: number, max: number, env: NodeJS.ProcessEnv): number {
  const raw = env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function hostList(value: string | undefined, fallback: string[]): string[] {
  if (value === undefined) return fallback;
  const hosts: string[] = [];
  for (const part of value.split(',')) {
    const host = part.trim().toLowerCase();
    if (!host) continue;
    if (!isValidHost(host)) {
      console.warn(`[auth] Ignoring invalid domain "${part.trim()}"`);
      continue;
    }
    hosts.push(host);
  }
  return hosts;
}

function emailList(value: string | undefined): string[] {
  if (!value) return [];
  const emails: string[] = [];
  for (const part of value.split(',')) {
    const email = normalizeEmail(part);
    if (!email) {
      if (part.trim()) console.warn(`[auth] Ignoring invalid admin email "${part.trim()}"`);
      continue;
    }
    emails.push(email);
  }
  return emails;
}

function sessionSecret(env: NodeJS.ProcessEnv): string {
  const configured = env.AUTH_SESSION_SECRET || '';
  if (configured.length >= 32) return configured;
  if (env.NODE_ENV === 'production') {
    throw new Error('AUTH_SESSION_SECRET must be at least 32 characters in production');
  }
  if (!ephemeralSecret) {
    ephemeralSecret = randomBytes(32).toString('base64url');
    console.warn('[auth] AUTH_SESSION_SECRET is unset; using an ephemeral development secret. Sessions reset on restart.');
  }
  return ephemeralSecret;
}

export function parseProvider(value: string | undefined): AuthProviderName | null {
  if (!value) return null;
  const name = value.trim().toLowerCase().replace(/-/g, '_');
  if (name === 'google' || name === 'magic_link' || name === 'oidc') return name;
  return null;
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const provider = parseProvider(env.AUTH_PROVIDER);
  if (env.AUTH_PROVIDER && !provider) {
    console.warn(`[auth] Unknown AUTH_PROVIDER "${env.AUTH_PROVIDER}". Sign-in is disabled.`);
  }
  const appUrl = (env.APP_URL || '').trim().replace(/\/+$/, '') || null;
  return {
    provider,
    allowedDomains: hostList(env.AUTH_ALLOWED_EMAIL_DOMAINS, [DEFAULT_DOMAIN]),
    allowedSubdomains: hostList(env.AUTH_ALLOWED_EMAIL_SUBDOMAINS, []),
    adminEmails: emailList(env.AUTH_ADMIN_EMAILS),
    sessionTtlSeconds: intEnv('AUTH_SESSION_TTL_SECONDS', 60 * 60 * 8, 5 * 60, 24 * 60 * 60, env),
    sessionSecret: sessionSecret(env),
    devBypass: isDevBypassEnabled(env),
    devUserEmail: env.AUTH_DEV_USER_EMAIL || 'dev.user@springernature.com',
    devUserName: env.AUTH_DEV_USER_NAME || 'Development User',
    googleIssuer: (env.GOOGLE_ISSUER || DEFAULT_GOOGLE_ISSUER).trim().replace(/\/+$/, ''),
    googleClientId: env.GOOGLE_CLIENT_ID || '',
    googleClientSecret: env.GOOGLE_CLIENT_SECRET || '',
    oidcIssuer: (env.OIDC_ISSUER || '').trim().replace(/\/+$/, ''),
    oidcClientId: env.OIDC_CLIENT_ID || '',
    oidcClientSecret: env.OIDC_CLIENT_SECRET || '',
    oidcScopes: env.OIDC_SCOPES || 'openid email profile',
    magicLinkTtlSeconds: intEnv('MAGIC_LINK_TTL_SECONDS', 15 * 60, 60, 60 * 60, env),
    emailTransport: (env.AUTH_EMAIL_TRANSPORT || 'console').trim().toLowerCase(),
    appUrl,
  };
}

export function providerSettings(config: AuthConfig): {
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  provider: 'google' | 'oidc';
} | null {
  if (config.provider === 'google') {
    if (!config.googleClientId || !config.googleClientSecret || !config.googleIssuer) return null;
    return {
      issuer: config.googleIssuer,
      clientId: config.googleClientId,
      clientSecret: config.googleClientSecret,
      scopes: 'openid email profile',
      provider: 'google',
    };
  }
  if (config.provider === 'oidc') {
    if (!config.oidcIssuer || !config.oidcClientId || !config.oidcClientSecret) return null;
    return {
      issuer: config.oidcIssuer,
      clientId: config.oidcClientId,
      clientSecret: config.oidcClientSecret,
      scopes: config.oidcScopes,
      provider: 'oidc',
    };
  }
  return null;
}

export function assertProductionAuthConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  const config = loadAuthConfig(env);
  if (!config.provider) {
    throw new Error('AUTH_PROVIDER must be google, magic_link, or oidc in production');
  }
  if (!config.appUrl) {
    throw new Error('APP_URL must be set in production');
  }
  let app: URL;
  try {
    app = new URL(config.appUrl);
  } catch {
    throw new Error('APP_URL must be an absolute URL in production');
  }
  const local = app.hostname === 'localhost' || app.hostname === '127.0.0.1';
  if (app.protocol !== 'https:' && !(app.protocol === 'http:' && local)) {
    throw new Error('APP_URL must use https in production (http is allowed only for localhost)');
  }
  if (config.provider === 'magic_link' && config.emailTransport === 'console') {
    throw new Error('AUTH_EMAIL_TRANSPORT=console cannot be used in production');
  }
  if (config.provider === 'google' && !providerSettings(config)) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required when AUTH_PROVIDER=google');
  }
  if (config.provider === 'oidc' && !providerSettings(config)) {
    throw new Error('OIDC_ISSUER, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET are required when AUTH_PROVIDER=oidc');
  }
  if (env.AUTH_DEV_BYPASS === 'true') {
    console.warn('[auth] AUTH_DEV_BYPASS is set but ignored because NODE_ENV is production');
  }
  for (const subdomain of config.allowedSubdomains) {
    if (!isSubdomainOfAllowedApex(subdomain, config.allowedDomains)) {
      console.warn(`[auth] AUTH_ALLOWED_EMAIL_SUBDOMAINS entry "${subdomain}" is not under an allowed apex and will never match`);
    }
  }
}
