import assert from 'node:assert/strict';
import fs from 'fs';
import type { Server } from 'http';
import os from 'os';
import path from 'path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { getAuditEventsForTests } from '../src/server/auditLog';
import { getDevOutbox } from '../src/server/auth/email';
import { resetAuthForTests } from '../src/server/auth/reset';
import { MockOidcIssuer, type MockClaims } from './mockOidcIssuer';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mcge-auth-'));
process.env.METRICS_CACHE_PATH = path.join(tmp, 'metrics-cache.json');
process.env.METRICS_AUDIT_PATH = path.join(tmp, 'metrics-audit.jsonl');
process.env.AUTH_SESSION_SECRET = 'test-session-secret-should-be-32b-min!!';
process.env.NODE_ENV = 'test';
process.env.AUTH_EMAIL_TRANSPORT = 'console';
delete process.env.GEMINI_API_KEY;

let baseUrl = '';
let appServer: Server;
let mock: MockOidcIssuer;
let resetMetricsCacheForTests: () => void;

type Jar = Map<string, string>;

function applyEnv(overrides: Record<string, string | undefined> = {}): void {
  const base: Record<string, string> = {
    NODE_ENV: 'test',
    AUTH_SESSION_SECRET: 'test-session-secret-should-be-32b-min!!',
    AUTH_PROVIDER: 'oidc',
    AUTH_ALLOWED_EMAIL_DOMAINS: 'springernature.com',
    AUTH_ALLOWED_EMAIL_SUBDOMAINS: '',
    AUTH_ADMIN_EMAILS: '',
    AUTH_DEV_BYPASS: '',
    AUTH_DEV_USER_EMAIL: 'dev.user@springernature.com',
    AUTH_DEV_USER_NAME: 'Development User',
    AUTH_EMAIL_TRANSPORT: 'console',
    OIDC_ISSUER: mock.issuer,
    OIDC_CLIENT_ID: mock.clientId,
    OIDC_CLIENT_SECRET: mock.clientSecret,
    OIDC_SCOPES: 'openid email profile',
    GOOGLE_ISSUER: mock.issuer,
    GOOGLE_CLIENT_ID: mock.clientId,
    GOOGLE_CLIENT_SECRET: mock.clientSecret,
    APP_URL: baseUrl,
    MAGIC_LINK_TTL_SECONDS: '900',
  };
  for (const [key, value] of Object.entries({ ...base, ...overrides })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function storeCookies(jar: Jar, res: Response): void {
  const listed = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const raw of listed) {
    const pair = raw.split(';')[0];
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = decodeURIComponent(pair.slice(idx + 1).trim());
    if (/Max-Age=0/i.test(raw)) jar.delete(name);
    else jar.set(name, value);
  }
}

async function api(
  url: string,
  options: {
    jar?: Jar;
    method?: string;
    body?: unknown;
    csrf?: string;
    redirect?: RequestRedirect;
    headers?: Record<string, string>;
  } = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.jar && options.jar.size > 0) {
    headers.set('Cookie', [...options.jar.entries()].map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('; '));
  }
  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
    if (options.csrf) headers.set('X-CSRF-Token', options.csrf);
  } else if (options.csrf) {
    headers.set('X-CSRF-Token', options.csrf);
  }
  const full = url.startsWith('http') ? url : `${baseUrl}${url}`;
  const res = await fetch(full, {
    method: options.method || (options.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    redirect: options.redirect || 'manual',
  });
  if (options.jar) storeCookies(options.jar, res);
  return res;
}

async function session(jar: Jar): Promise<{ csrfToken: string; authenticated: boolean; user: { email: string; provider: string } | null; devBypass: boolean; admin: boolean }> {
  const res = await api('/api/auth/session', { jar });
  assert.equal(res.status, 200);
  return res.json();
}

async function loginViaIssuer(jar: Jar): Promise<{ location: string; body: Awaited<ReturnType<typeof session>> }> {
  const start = await api('/api/auth/login', { jar });
  assert.equal(start.status, 302, 'login should redirect to the issuer');
  const authorize = start.headers.get('location');
  assert.ok(authorize);
  const authorized = await fetch(authorize, { redirect: 'manual' });
  assert.equal(authorized.status, 302, 'mock issuer should redirect back to the callback');
  const callback = authorized.headers.get('location');
  assert.ok(callback);
  const done = await api(callback, { jar });
  assert.equal(done.status, 302);
  const location = done.headers.get('location') || '';
  const body = await session(jar);
  return { location, body };
}

const PROTECTED = [
  { method: 'POST', path: '/api/fetch-clarivate-facts', body: { url: 'https://www.nature.com/nature' } },
  { method: 'GET', path: '/api/cache/journal/nature' },
  { method: 'POST', path: '/api/cache/refresh/nature', body: {} },
  { method: 'GET', path: '/api/cache/list' },
  { method: 'POST', path: '/api/cache/clear', body: {} },
  { method: 'POST', path: '/api/update-journal-metrics', body: { facts: {} } },
  { method: 'POST', path: '/api/generate-campaign', body: {} },
  { method: 'POST', path: '/api/compare-stages', body: {} },
];

function validFacts(overrides: Record<string, unknown> = {}) {
  return {
    url: 'https://www.nature.com/example-journal',
    journalName: 'Example Journal',
    publisher: 'Nature Portfolio',
    impactFactor: 4.2,
    fiveYearImpactFactor: null,
    jcrQuartile: 'Q1',
    casZone: '中科院1区',
    firstDecisionDays: 28,
    indexing: ['SCIE'],
    openAccessType: 'Hybrid Open Access',
    apcUsd: 3200,
    chinaWaiverAvailable: false,
    aimsAndScopeSummary: 'Peer-reviewed research.',
    primaryDiscipline: 'Biology',
    sourceAttribution: 'Manually supplied by user (User Verified)',
    verificationStatus: 'user_provided',
    reportingYear: 'User Provided (2025/2026)',
    isVerifiedClarivate: false,
    missingFields: [],
    ...overrides,
  };
}

describe('authenticated http api', { concurrency: 1 }, () => {
  before(async () => {
    mock = new MockOidcIssuer();
    await mock.start();
    const serverMod = await import('../server.ts');
    resetMetricsCacheForTests = serverMod.resetMetricsCacheForTests;
    appServer = serverMod.app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => appServer.once('listening', () => resolve()));
    const address = appServer.address();
    if (!address || typeof address === 'string') throw new Error('App failed to bind');
    baseUrl = `http://127.0.0.1:${address.port}`;
    applyEnv();
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => appServer.close((err) => (err ? reject(err) : resolve())));
    await mock.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  beforeEach(() => {
    applyEnv();
    resetAuthForTests();
    resetMetricsCacheForTests();
    mock.reset();
  });

  it('returns 401 for every protected route when there is no session', async () => {
    for (const route of PROTECTED) {
      const res = await api(route.path, { method: route.method, body: route.body });
      assert.equal(res.status, 401, `${route.method} ${route.path}`);
      const body = await res.json();
      assert.equal(body.error, 'Authentication required');
    }
  });

  it('sets an HttpOnly SameSite=Lax session cookie and requires CSRF on writes', async () => {
    const jar: Jar = new Map();
    const res = await api('/api/auth/session', { jar });
    const setCookie = res.headers.getSetCookie().find((value) => value.startsWith('sn_session='));
    assert.ok(setCookie);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.doesNotMatch(setCookie, /Secure/i);
    const body = await res.json();
    const denied = await api('/api/generate-campaign', { jar, body: { landingPageUrl: 'https://www.nature.com/nature' } });
    assert.equal(denied.status, 401);
    await devLogin(jar);
    const missingCsrf = await api('/api/generate-campaign', {
      jar,
      body: { landingPageUrl: 'https://www.nature.com/nature' },
    });
    assert.equal(missingCsrf.status, 403);
    const authed = await session(jar);
    const allowed = await api('/api/generate-campaign', {
      jar,
      csrf: authed.csrfToken,
      body: { landingPageUrl: 'https://www.nature.com/nature', funnelStage: 'CON', channels: ['search'], outputLanguage: 'EN' },
    });
    assert.equal(allowed.status, 200);
    const payload = await allowed.json();
    assert.equal(payload.success, true);
    assert.ok(body.csrfToken);
  });

  it('marks the session cookie Secure in production when APP_URL is https', async () => {
    applyEnv({ NODE_ENV: 'production', APP_URL: 'https://mcge.example' });
    const jar: Jar = new Map();
    const res = await api('/api/auth/session', { jar });
    const setCookie = res.headers.getSetCookie().find((value) => value.startsWith('sn_session='));
    assert.ok(setCookie);
    assert.match(setCookie, /Secure/i);
    assert.match(setCookie, /HttpOnly/i);
  });

  it('completes the generic OIDC callback for a verified company email', async () => {
    const jar: Jar = new Map();
    await session(jar);
    const { location, body } = await loginViaIssuer(jar);
    assert.equal(location, `${baseUrl}/`);
    assert.equal(body.authenticated, true);
    assert.equal(body.user?.email, 'person@springernature.com');
    assert.equal(body.user?.provider, 'oidc');
    const facts = await api('/api/fetch-clarivate-facts', {
      jar,
      csrf: body.csrfToken,
      body: { url: 'https://www.nature.com/nature' },
    });
    assert.equal(facts.status, 200);
  });

  it('rejects OIDC callbacks for unverified, lookalike, subdomain, and hd mismatches', async () => {
    const cases: Array<{ claims: Partial<MockClaims> & Pick<MockClaims, 'includeEmail' | 'includeEmailVerified' | 'includeHd'>; error: string }> = [
      { claims: { ...mock.claims, email_verified: false, includeEmail: true, includeEmailVerified: true, includeHd: true }, error: 'email_unverified' },
      { claims: { ...mock.claims, email: 'person@springernature.com.evil.com', includeHd: false, includeEmail: true, includeEmailVerified: true }, error: 'email_domain' },
      { claims: { ...mock.claims, email: 'person@staff.springernature.com', hd: 'staff.springernature.com', includeEmail: true, includeEmailVerified: true, includeHd: true }, error: 'email_domain' },
      { claims: { ...mock.claims, hd: 'evil.com', includeEmail: true, includeEmailVerified: true, includeHd: true }, error: 'hd_rejected' },
      { claims: { ...mock.claims, includeEmail: false, includeEmailVerified: true, includeHd: false }, error: 'email_missing' },
    ];
    for (const item of cases) {
      resetAuthForTests();
      mock.reset();
      mock.claims = { ...mock.claims, sub: 'user-1', name: 'Person Example', email: 'person@springernature.com', email_verified: true, hd: 'springernature.com', ...item.claims };
      const jar: Jar = new Map();
      await session(jar);
      const { location, body } = await loginViaIssuer(jar);
      assert.match(location, new RegExp(`auth_error=${item.error}`), item.error);
      assert.equal(body.authenticated, false);
    }
  });

  it('accepts a string email_verified and an explicitly allowed subdomain', async () => {
    mock.claims = { ...mock.claims, email_verified: 'true', includeHd: false };
    const jar: Jar = new Map();
    await session(jar);
    const verified = await loginViaIssuer(jar);
    assert.equal(verified.body.user?.email, 'person@springernature.com');

    applyEnv({ AUTH_ALLOWED_EMAIL_SUBDOMAINS: 'staff.springernature.com' });
    resetAuthForTests();
    mock.reset();
    mock.claims = {
      ...mock.claims,
      email: 'Editor@Staff.SpringerNature.com',
      hd: 'Staff.springernature.com',
    };
    const jar2: Jar = new Map();
    await session(jar2);
    const subdomain = await loginViaIssuer(jar2);
    assert.equal(subdomain.body.user?.email, 'editor@staff.springernature.com');
    assert.equal(subdomain.body.user?.provider, 'oidc');
  });

  it('rejects a tampered OAuth state and a bad token issuer', async () => {
    const jar: Jar = new Map();
    await session(jar);
    const start = await api('/api/auth/login', { jar });
    const callback = new URL('/api/auth/callback', baseUrl);
    callback.searchParams.set('code', 'not-a-real-code');
    callback.searchParams.set('state', 'tampered');
    const tampered = await api(callback.toString(), { jar });
    assert.equal(tampered.status, 302);
    assert.match(tampered.headers.get('location') || '', /auth_error=invalid_state/);

    resetAuthForTests();
    mock.tokenIssuerOverride = 'https://evil.example';
    const jar2: Jar = new Map();
    await session(jar2);
    const badIssuer = await loginViaIssuer(jar2);
    assert.match(badIssuer.location, /auth_error=provider_error/);
    assert.equal(badIssuer.body.authenticated, false);
  });

  it('completes the Google callback and checks hd when it is present', async () => {
    applyEnv({ AUTH_PROVIDER: 'google' });
    const jar: Jar = new Map();
    await session(jar);
    const start = await api('/api/auth/login', { jar });
    const authorize = new URL(start.headers.get('location') || '');
    assert.equal(authorize.searchParams.get('hd'), 'springernature.com');
    assert.equal(authorize.searchParams.get('code_challenge_method'), 'S256');
    const { body } = await loginViaIssuer(jar);
    assert.equal(body.user?.provider, 'google');
    assert.equal(body.user?.email, 'person@springernature.com');

    resetAuthForTests();
    mock.reset();
    mock.claims = { ...mock.claims, includeHd: false };
    const jar2: Jar = new Map();
    await session(jar2);
    const noHd = await loginViaIssuer(jar2);
    assert.equal(noHd.body.authenticated, true, 'a verified company email is accepted when hd is absent');
  });

  it('sends and consumes a magic link only for allowed addresses', async () => {
    applyEnv({ AUTH_PROVIDER: 'magic_link' });
    const jar: Jar = new Map();
    const anon = await session(jar);
    const lookalike = await api('/api/auth/magic-link/request', {
      jar,
      csrf: anon.csrfToken,
      body: { email: 'person@springernature.com.evil.com' },
    });
    assert.equal(lookalike.status, 400);
    assert.equal(getDevOutbox().length, 0);

    const subdomain = await api('/api/auth/magic-link/request', {
      jar,
      csrf: anon.csrfToken,
      body: { email: 'person@staff.springernature.com' },
    });
    assert.equal(subdomain.status, 400);

    const sent = await api('/api/auth/magic-link/request', {
      jar,
      csrf: anon.csrfToken,
      body: { email: 'Person@SpringerNature.COM' },
    });
    assert.equal(sent.status, 200);
    const token = getDevOutbox().at(-1)?.text.match(/#magic=([A-Za-z0-9_-]+)/)?.[1];
    assert.ok(token);
    const verified = await api('/api/auth/magic-link/verify', { jar, csrf: anon.csrfToken, body: { token } });
    assert.equal(verified.status, 200);
    const signedIn = await verified.json();
    assert.equal(signedIn.user.email, 'person@springernature.com');
    assert.equal(signedIn.user.provider, 'magic_link');

    const again = await api('/api/auth/magic-link/verify', {
      jar,
      csrf: signedIn.csrfToken,
      body: { token },
    });
    assert.equal(again.status, 400);

    applyEnv({ AUTH_PROVIDER: 'oidc' });
    const hidden = await api('/api/auth/magic-link/request', {
      jar,
      csrf: signedIn.csrfToken,
      body: { email: 'person@springernature.com' },
    });
    assert.equal(hidden.status, 404);
  });

  it('does not enable the dev bypass outside development, even when the flag is set', async () => {
    const jar: Jar = new Map();
    const anon = await session(jar);
    applyEnv({ NODE_ENV: 'production', AUTH_DEV_BYPASS: 'true' });
    const production = await api('/api/auth/dev-login', { jar, csrf: anon.csrfToken, body: {} });
    assert.equal(production.status, 404);
    const headerBypass = await api('/api/cache/list', { headers: { 'X-Dev-Bypass': 'true', 'X-Dev-User': 'dev.user@springernature.com' } });
    assert.equal(headerBypass.status, 401);

    applyEnv({ NODE_ENV: 'development', AUTH_DEV_BYPASS: '1' });
    const almost = await api('/api/auth/dev-login', { jar, csrf: anon.csrfToken, body: {} });
    assert.equal(almost.status, 404);

    applyEnv({ NODE_ENV: 'development', AUTH_DEV_BYPASS: 'true', AUTH_DEV_USER_EMAIL: 'dev.user@evil.com' });
    const badEmail = await api('/api/auth/dev-login', { jar, csrf: anon.csrfToken, body: {} });
    assert.equal(badEmail.status, 400);

    applyEnv({ NODE_ENV: 'development', AUTH_DEV_BYPASS: 'true' });
    const ok = await api('/api/auth/dev-login', { jar, csrf: anon.csrfToken, body: {} });
    assert.equal(ok.status, 200);
    const user = await ok.json();
    assert.equal(user.user.email, 'dev.user@springernature.com');
    const list = await api('/api/cache/list', { jar, csrf: user.csrfToken });
    assert.equal(list.status, 200);
  });

  it('restricts cache clear and refresh to the admin allowlist', async () => {
    const jar: Jar = new Map();
    const user = await devLogin(jar);
    const refresh = await api('/api/cache/refresh/nature', { jar, csrf: user.csrfToken, body: {} });
    assert.equal(refresh.status, 403);
    const clear = await api('/api/cache/clear', { jar, csrf: user.csrfToken, body: {} });
    assert.equal(clear.status, 403);

    applyEnv({ NODE_ENV: 'development', AUTH_DEV_BYPASS: 'true', AUTH_ADMIN_EMAILS: 'Dev.User@SpringerNature.com' });
    const adminRefresh = await api('/api/cache/refresh/nature', {
      jar,
      csrf: user.csrfToken,
      body: { url: 'https://www.nature.com/nature' },
    });
    assert.equal(adminRefresh.status, 200);
    const adminClear = await api('/api/cache/clear', { jar, csrf: user.csrfToken, body: {} });
    assert.equal(adminClear.status, 200);
  });

  it('validates journal metrics and records who changed what', async () => {
    const jar: Jar = new Map();
    const user = await devLogin(jar);
    const rejected = await api('/api/update-journal-metrics', {
      jar,
      csrf: user.csrfToken,
      body: { facts: validFacts({ arbitrary: 'nope' }) },
    });
    assert.equal(rejected.status, 400);
    assert.match((await rejected.json()).error, /Unknown journal metric fields/);
    assert.equal(getAuditEventsForTests().length, 0);

    const saved = await api('/api/update-journal-metrics', {
      jar,
      csrf: user.csrfToken,
      body: { facts: validFacts({ impactFactor: 8.1 }) },
    });
    assert.equal(saved.status, 200);
    const body = await saved.json();
    assert.equal(body.audit.actorEmail, 'dev.user@springernature.com');
    assert.equal(body.facts.verificationStatus, 'user_provided');
    assert.equal(body.facts.isVerifiedClarivate, false);
    assert.equal(body.facts.sourceAttribution, 'Manually supplied by dev.user@springernature.com');
    assert.equal('arbitrary' in body.facts, false);
    const audit = getAuditEventsForTests();
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actorEmail, 'dev.user@springernature.com');
    assert.ok(audit[0].changedFields.some((change) => change.field === 'impactFactor' && change.after === 8.1));

    const cached = await api('/api/cache/journal/example-journal', { jar });
    assert.equal(cached.status, 200);
    const cachedBody = await cached.json();
    assert.equal(cachedBody.cachedJournal.lastModifiedBy.email, 'dev.user@springernature.com');
  });

  it('rejects a request body over 1mb', async () => {
    const res = await api('/api/update-journal-metrics', {
      body: { blob: 'x'.repeat(1_200_000) },
    });
    assert.equal(res.status, 413);
  });
});

async function devLogin(jar: Jar): Promise<{ csrfToken: string; email: string }> {
  applyEnv({ NODE_ENV: 'development', AUTH_DEV_BYPASS: 'true', AUTH_PROVIDER: 'magic_link' });
  const anon = await session(jar);
  const res = await api('/api/auth/dev-login', { jar, csrf: anon.csrfToken, body: {} });
  assert.equal(res.status, 200);
  const body = await res.json();
  return { csrfToken: body.csrfToken, email: body.user.email };
}
