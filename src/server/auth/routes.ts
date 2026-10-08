import type { Express, Request } from 'express';
import { isDevBypassEnabled, loadAuthConfig, providerSettings } from './config';
import { isEmailDomainAllowed, normalizeEmail } from './domain';
import { AUTH_ERROR_CODES, AuthFlowError, mapIdentityProviderError, safeAuthError, type AuthErrorCode } from './errors';
import { getRequestSession } from './guard';
import { evaluateIdentity } from './identity';
import { consumeMagicLink, MagicLinkRejected, requestMagicLink } from './magicLink';
import { buildAuthorizationUrl, createOauthTransaction, exchangeAuthorizationCode } from './oidc';
import {
  createSession,
  destroySession,
  isAdminEmail,
  publicSessionUser,
  readOauthTransaction,
  readSession,
  rotateSession,
  safeEqual,
  saveOauthTransaction,
  writeSessionCookie,
  ensureSession,
  type SessionRecord,
} from './session';

const SAFE_ERRORS = new Set<string>(AUTH_ERROR_CODES);

export function resolveAppUrl(req: Request): string {
  const configured = loadAuthConfig().appUrl;
  if (configured) return configured;
  // Outside production, never trust X-Forwarded-Host (or Host). Links stay on this process.
  if (process.env.NODE_ENV !== 'production') {
    const port = req.socket?.localPort || Number(process.env.PORT) || 3000;
    return `http://localhost:${port}`;
  }
  const proto = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  const host = (req.get('x-forwarded-host') || req.get('host') || '127.0.0.1:3000').split(',')[0].trim();
  return `${proto}://${host}`;
}

/** Socket address by default. Forwarded client IP is used only in production behind TRUST_PROXY. */
export function requestClientIp(req: Request): string {
  if (process.env.NODE_ENV === 'production' && process.env.TRUST_PROXY === 'true') {
    const forwarded = req.ip?.trim();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress?.trim() || 'unknown';
}

function loginRedirect(req: Request, error?: string): string {
  const base = resolveAppUrl(req);
  if (!error || !SAFE_ERRORS.has(error)) return `${base}/`;
  return `${base}/?auth_error=${encodeURIComponent(error)}`;
}

function sessionPayload(session: SessionRecord) {
  const config = loadAuthConfig();
  const user = session.user;
  return {
    authenticated: Boolean(user),
    user: user ? publicSessionUser(user) : null,
    csrfToken: session.csrfToken,
    provider: config.provider,
    allowedDomains: config.allowedDomains,
    devBypass: isDevBypassEnabled(),
    admin: user ? isAdminEmail(user.email, config) : false,
  };
}

function onlyKeys(body: unknown, allowed: string[]): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => !allowed.includes(key))) return null;
  return record;
}

export function registerAuthRoutes(app: Express): void {
  app.get('/api/auth/session', (req, res) => {
    try {
      const session = ensureSession(req, res);
      res.json(sessionPayload(session));
    } catch (err) {
      console.error('[auth] session bootstrap failed', err instanceof Error ? err.message : err);
      res.status(500).json({ error: 'Authentication is not configured' });
    }
  });

  app.get('/api/auth/login', async (req, res) => {
    const config = loadAuthConfig();
    const settings = providerSettings(config);
    if (!settings) {
      res.redirect(loginRedirect(req, 'not_configured'));
      return;
    }
    try {
      const session = ensureSession(req, res);
      const redirectUri = `${resolveAppUrl(req)}/api/auth/callback`;
      const transaction = createOauthTransaction(redirectUri);
      saveOauthTransaction(session, transaction);
      const extra: Record<string, string> = {};
      if (settings.provider === 'google' && config.allowedDomains.length === 1) {
        extra.hd = config.allowedDomains[0];
      }
      const url = await buildAuthorizationUrl({ ...settings, redirectUri }, transaction, extra);
      res.redirect(url.toString());
    } catch (err) {
      console.error('[auth] login start failed', err instanceof Error ? err.message : err);
      res.redirect(loginRedirect(req, safeAuthError(err)));
    }
  });

  app.get('/api/auth/callback', async (req, res) => {
    const config = loadAuthConfig();
    const settings = providerSettings(config);
    if (!settings) {
      res.redirect(loginRedirect(req, 'not_configured'));
      return;
    }
    try {
      const session = readSession(req);
      const oauth = session ? readOauthTransaction(session) : null;
      if (!session || !oauth) throw new AuthFlowError('invalid_state');
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      if (!state || !safeEqual(state, oauth.state)) throw new AuthFlowError('invalid_state');
      if (typeof req.query.error === 'string' && req.query.error) {
        throw new AuthFlowError(mapIdentityProviderError(req.query.error));
      }
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      if (!code) throw new AuthFlowError('provider_error');
      const claims = await exchangeAuthorizationCode(
        { ...settings, redirectUri: oauth.redirectUri },
        oauth,
        code
      );
      const user = evaluateIdentity(claims, config, settings.provider);
      rotateSession(res, user, session);
      console.info(`[auth] ${settings.provider} sign-in succeeded for ${user.email}`);
      res.redirect(loginRedirect(req));
    } catch (err) {
      const code = safeAuthError(err) as AuthErrorCode;
      console.warn(`[auth] callback rejected (${code})`);
      res.redirect(loginRedirect(req, code));
    }
  });

  app.post('/api/auth/magic-link/request', async (req, res) => {
    const config = loadAuthConfig();
    if (config.provider !== 'magic_link') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const body = onlyKeys(req.body, ['email']);
    if (!body || typeof body.email !== 'string') {
      res.status(400).json({ error: 'Email is required' });
      return;
    }
    try {
      await requestMagicLink(body.email, config, resolveAppUrl(req), requestClientIp(req));
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof MagicLinkRejected) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      console.error('[auth] magic link send failed', err instanceof Error ? err.message : err);
      res.status(502).json({ error: 'The sign-in email could not be sent' });
    }
  });

  app.post('/api/auth/magic-link/verify', (req, res) => {
    const config = loadAuthConfig();
    if (config.provider !== 'magic_link') {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const body = onlyKeys(req.body, ['token']);
    if (!body || typeof body.token !== 'string') {
      res.status(400).json({ error: 'This sign-in link is invalid or has expired.' });
      return;
    }
    const email = consumeMagicLink(body.token, config);
    if (!email) {
      res.status(400).json({ error: 'This sign-in link is invalid or has expired.' });
      return;
    }
    const session = rotateSession(
      res,
      {
        sub: `magic:${email}`,
        email,
        name: email,
        emailVerified: true,
        provider: 'magic_link',
      },
      getRequestSession(res)
    );
    console.info(`[auth] magic link sign-in succeeded for ${email}`);
    res.json(sessionPayload(session));
  });

  app.post('/api/auth/dev-login', (req, res) => {
    if (!isDevBypassEnabled()) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body) && Object.keys(req.body).length > 0) {
      res.status(400).json({ error: 'Unexpected fields in request' });
      return;
    }
    const config = loadAuthConfig();
    const email = normalizeEmail(config.devUserEmail);
    if (!email || !isEmailDomainAllowed(email, config.allowedDomains, config.allowedSubdomains)) {
      res.status(400).json({ error: 'AUTH_DEV_USER_EMAIL is not an allowed email domain' });
      return;
    }
    const session = rotateSession(
      res,
      {
        sub: 'dev-bypass',
        email,
        name: config.devUserName,
        emailVerified: true,
        provider: 'dev',
      },
      getRequestSession(res)
    );
    console.info(`[auth] development bypass sign-in for ${email}`);
    res.json(sessionPayload(session));
  });

  app.post('/api/auth/logout', (_req, res) => {
    const current = getRequestSession(res);
    if (current) destroySession(current.id);
    const fresh = createSession(null);
    writeSessionCookie(res, fresh);
    res.json(sessionPayload(fresh));
  });
}
