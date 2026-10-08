import assert from 'node:assert/strict';
import fs from 'fs';
import http from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'os';
import path from 'path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { getAuditEventsForTests } from '../src/server/auditLog';
import { getDevOutbox } from '../src/server/auth/email';
import { MagicLinkRejected, requestMagicLink } from '../src/server/auth/magicLink';
import { loadAuthConfig } from '../src/server/auth/config';
import { resetAuthForTests } from '../src/server/auth/reset';
import { setPageFactsClientForTests } from '../src/utils/metricSources';
import type { ExtractedFactField, ExtractedPageFacts } from '../src/types';
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
let setLandingPageFetchForTests: (fetchPage: ((url: string) => Promise<string>) | null) => void;

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
    sourceAttribution: 'editor@springernature.com',
    verificationStatus: 'user_provided',
    reportingYear: 'User Provided (2025/2026)',
    jcrYear: 2024,
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
    setLandingPageFetchForTests = serverMod.setLandingPageFetchForTests;
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
    setPageFactsClientForTests(null);
    setLandingPageFetchForTests(async () => '<html><head></head><body></body></html>');
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
      body: { landingPageUrl: 'https://www.nature.com', funnelStage: 'CON', channels: ['search'], outputLanguage: 'EN' },
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
      body: { facts: validFacts({ impactFactor: 8.1, issn: '1234-5678' }) },
    });
    assert.equal(saved.status, 200);
    const body = await saved.json();
    assert.equal(body.audit.actorEmail, 'dev.user@springernature.com');
    assert.equal(body.facts.verificationStatus, 'user_provided');
    assert.equal(body.facts.provenanceSource, 'user_provided');
    assert.equal(body.facts.isVerifiedClarivate, false);
    assert.equal(body.facts.sourceAttribution, 'Manually entered (unverified)');
    assert.equal(body.facts.reportingYear, 'JCR 2024');
    assert.equal(body.facts.jcrYear, 2024);
    assert.equal(body.facts.sourceAttribution.includes('@'), false);
    assert.match(body.message, /Saved manually entered metrics/);
    assert.doesNotMatch(body.message, /verified/i);
    assert.equal('arbitrary' in body.facts, false);
    const audit = getAuditEventsForTests();
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actorEmail, 'dev.user@springernature.com');
    assert.ok(audit[0].changedFields.some((change) => change.field === 'impactFactor' && change.after === 8.1));

    const cached = await api(`/api/cache/journal/${encodeURIComponent('issn:1234-5678')}`, { jar });
    assert.equal(cached.status, 200);
    const cachedBody = await cached.json();
    assert.equal(cachedBody.cachedJournal.lastModifiedBy.email, 'dev.user@springernature.com');
    assert.equal(cachedBody.cachedJournal.metrics.impactFactor.year, 2024);
    assert.equal(cachedBody.cachedJournal.metrics.impactFactor.source, 'Manually entered (unverified)');
    assert.equal(cachedBody.cachedJournal.fullFacts.sourceAttribution.includes('@'), false);
    assert.equal(String(cachedBody.cachedJournal.metrics.impactFactor.source).includes('@'), false);
  });

  it('strips a Clarivate label from browser-supplied campaign facts', async () => {
    const jar: Jar = new Map();
    const user = await devLogin(jar);
    const generated = await api('/api/generate-campaign', {
      jar,
      csrf: user.csrfToken,
      body: {
        landingPageUrl: 'https://www.nature.com/example-journal',
        funnelStage: 'CON',
        channels: ['search'],
        outputLanguage: 'EN',
        userProvidedFacts: validFacts({
          impactFactor: 9.9,
          verificationStatus: 'user_provided',
          provenanceSource: 'clarivate_wos_journals_api',
          isVerifiedClarivate: true,
          sourceAttribution: 'clarivate_wos_journals_api JCR 2024 (retrieved 2024-06-01T00:00:00.000Z)',
        }),
      },
    });
    assert.equal(generated.status, 200);
    const body = await generated.json();
    const facts = body.campaign.clarivateFacts;
    assert.equal(facts.verificationStatus, 'user_provided');
    assert.equal(facts.provenanceSource, 'user_provided');
    assert.equal(facts.isVerifiedClarivate, false);
    assert.equal(facts.impactFactor, 9.9);
    assert.equal(facts.sourceAttribution, 'Manually entered (unverified)');
    assert.equal(String(facts.sourceAttribution).includes('clarivate_wos_journals_api'), false);
  });

  it('generates after editing fetched catalog and page-sourced facts', async () => {
    const jar: Jar = new Map();
    const user = await devLogin(jar);

    const catalogRes = await api('/api/fetch-clarivate-facts', {
      jar,
      csrf: user.csrfToken,
      body: { url: 'https://www.nature.com/ncomms' },
    });
    assert.equal(catalogRes.status, 200);
    const catalogFacts = (await catalogRes.json()).facts;
    assert.equal(catalogFacts.verificationStatus, 'catalog_snapshot');
    assert.equal(catalogFacts.jcrYear, undefined);
    assert.ok(Array.isArray(catalogFacts.slugs));
    assert.equal(typeof catalogFacts.cachedAt, 'string');
    assert.equal(typeof catalogFacts.cacheExpiresAt, 'string');
    assert.equal(catalogFacts.isFromCache, false);

    const catalogGenerated = await api('/api/generate-campaign', {
      jar,
      csrf: user.csrfToken,
      body: {
        landingPageUrl: 'https://www.nature.com/ncomms',
        funnelStage: 'CON',
        channels: ['search'],
        outputLanguage: 'EN',
        userProvidedFacts: {
          ...catalogFacts,
          impactFactor: 15.1,
          jcrYear: 2024,
          verificationStatus: 'user_provided',
          provenanceSource: 'clarivate_wos_journals_api',
          isVerifiedClarivate: true,
        },
      },
    });
    const catalogBody = await catalogGenerated.json();
    assert.equal(catalogGenerated.status, 200, catalogBody.error || 'catalog edit should generate');
    assert.equal(catalogBody.campaign.clarivateFacts.impactFactor, 15.1);
    assert.equal(catalogBody.campaign.clarivateFacts.jcrYear, 2024);
    assert.equal(catalogBody.campaign.clarivateFacts.verificationStatus, 'user_provided');
    assert.equal(catalogBody.campaign.clarivateFacts.provenanceSource, 'user_provided');
    assert.equal(catalogBody.campaign.clarivateFacts.isVerifiedClarivate, false);
    assert.equal(catalogBody.campaign.clarivateFacts.sourceAttribution, 'Manually entered (unverified)');
    assert.deepEqual(catalogBody.campaign.clarivateFacts.slugs, []);
    assert.equal('cachedAt' in catalogBody.campaign.clarivateFacts, false);
    assert.equal('cacheExpiresAt' in catalogBody.campaign.clarivateFacts, false);
    assert.equal('isFromCache' in catalogBody.campaign.clarivateFacts, false);

    const pageUrl = 'https://www.nature.com/page-sourced-journal';
    const pageLinks = stubPageLinks(pageUrl);
    setPageFactsClientForTests({
      async extractFromPage(canonicalUrl: string) {
        if (canonicalUrl !== pageUrl) return null;
        return {
          journalName: 'Page Sourced Journal',
          publisher: 'Nature Portfolio',
          impactFactor: 2.5,
          fiveYearImpactFactor: null,
          jcrQuartile: 'Q2',
          casZone: null,
          firstDecisionDays: 40,
          indexing: ['Scopus'],
          openAccessType: 'Hybrid Open Access',
          apcUsd: 1000,
          chinaWaiverAvailable: false,
          aimsAndScopeSummary: 'Read from the journal page.',
          primaryDiscipline: 'Biology',
          sourceAttribution: 'Read from the journal page',
          verificationStatus: 'page_sourced',
          provenanceSource: 'page_sourced',
          isVerifiedClarivate: false,
          submissionPortalUrl: pageLinks.submissionPortalUrl.value,
          authorGuidelinesUrl: pageLinks.authorGuidelinesUrl.value,
          extractedFacts: pageLinks,
        };
      },
    });
    const firstPage = await api('/api/fetch-clarivate-facts', {
      jar,
      csrf: user.csrfToken,
      body: { url: pageUrl },
    });
    assert.equal(firstPage.status, 200);
    assert.equal((await firstPage.json()).facts.verificationStatus, 'page_sourced');
    const secondPage = await api('/api/fetch-clarivate-facts', {
      jar,
      csrf: user.csrfToken,
      body: { url: pageUrl },
    });
    assert.equal(secondPage.status, 200);
    const pageFacts = (await secondPage.json()).facts;
    assert.equal(pageFacts.verificationStatus, 'page_sourced');
    assert.equal(pageFacts.jcrYear, undefined);
    assert.ok(Array.isArray(pageFacts.slugs));
    assert.equal(pageFacts.isFromCache, true);
    assert.equal(typeof pageFacts.cachedAt, 'string');
    assert.equal(typeof pageFacts.cacheExpiresAt, 'string');

    const pageGenerated = await api('/api/generate-campaign', {
      jar,
      csrf: user.csrfToken,
      body: {
        landingPageUrl: pageUrl,
        funnelStage: 'CON',
        channels: ['search'],
        outputLanguage: 'EN',
        userProvidedFacts: {
          url: pageFacts.url,
          journalName: pageFacts.journalName,
          publisher: pageFacts.publisher,
          impactFactor: 2.8,
          fiveYearImpactFactor: pageFacts.fiveYearImpactFactor,
          jcrQuartile: pageFacts.jcrQuartile,
          casZone: pageFacts.casZone,
          firstDecisionDays: pageFacts.firstDecisionDays,
          indexing: pageFacts.indexing,
          openAccessType: pageFacts.openAccessType,
          apcUsd: pageFacts.apcUsd,
          chinaWaiverAvailable: pageFacts.chinaWaiverAvailable,
          aimsAndScopeSummary: pageFacts.aimsAndScopeSummary,
          primaryDiscipline: pageFacts.primaryDiscipline,
          jcrYear: 2023,
          verificationStatus: 'user_provided',
        },
      },
    });
    const pageBody = await pageGenerated.json();
    assert.equal(pageGenerated.status, 200, pageBody.error || 'page-sourced edit should generate');
    assert.equal(pageBody.campaign.clarivateFacts.journalName, 'Page Sourced Journal');
    assert.equal(pageBody.campaign.clarivateFacts.impactFactor, 2.8);
    assert.equal(pageBody.campaign.clarivateFacts.jcrYear, 2023);
    assert.equal(pageBody.campaign.clarivateFacts.verificationStatus, 'user_provided');
    assert.equal(pageBody.campaign.clarivateFacts.provenanceSource, 'user_provided');
    assert.equal(pageBody.campaign.clarivateFacts.isVerifiedClarivate, false);
    assert.equal(pageBody.campaign.clarivateFacts.submissionPortalUrl, 'https://mts-example.nature.com');
    assert.equal(pageBody.campaign.clarivateFacts.authorGuidelinesUrl, `${pageUrl}/submit`);
    const articlesLink = pageBody.campaign.searchAds.sitelinks.find((link: { title: string }) => link.title === 'Article Types & Formats');
    assert.equal(articlesLink?.urlPath, `${pageUrl}/research-articles`);
    assert.equal(pageBody.campaign.recommendedDestination.url, pageUrl);
    assert.deepEqual(pageBody.campaign.clarivateFacts.slugs, []);
    assert.equal('cachedAt' in pageBody.campaign.clarivateFacts, false);
    assert.equal('cacheExpiresAt' in pageBody.campaign.clarivateFacts, false);
    assert.equal('isFromCache' in pageBody.campaign.clarivateFacts, false);
  });

  it('keeps unchanged catalog rankings out of copy after one metric is edited', async () => {
    const jar: Jar = new Map();
    const user = await devLogin(jar);
    const fetched = await api('/api/fetch-clarivate-facts', {
      jar,
      csrf: user.csrfToken,
      body: { url: 'https://www.nature.com/ncomms' },
    });
    assert.equal(fetched.status, 200);
    const catalog = (await fetched.json()).facts;
    assert.equal(catalog.verificationStatus, 'catalog_snapshot');
    assert.equal(catalog.provenanceMap?.jcrQuartile?.source, 'catalog_snapshot');
    assert.equal(catalog.provenanceMap?.casZone?.source, 'catalog_snapshot');
    assert.equal(catalog.provenanceMap?.indexing?.source, 'catalog_snapshot');

    const edited = {
      url: catalog.url,
      journalName: catalog.journalName,
      publisher: catalog.publisher,
      impactFactor: 15.1,
      fiveYearImpactFactor: catalog.fiveYearImpactFactor,
      jcrQuartile: catalog.jcrQuartile,
      casZone: catalog.casZone,
      firstDecisionDays: catalog.firstDecisionDays,
      indexing: catalog.indexing,
      openAccessType: catalog.openAccessType,
      apcUsd: catalog.apcUsd,
      chinaWaiverAvailable: catalog.chinaWaiverAvailable,
      aimsAndScopeSummary: catalog.aimsAndScopeSummary,
      primaryDiscipline: catalog.primaryDiscipline,
      issn: catalog.issn,
      eIssn: catalog.eIssn,
      jcrYear: 2024,
      verificationStatus: 'user_provided',
    };

    const generated = await api('/api/generate-campaign', {
      jar,
      csrf: user.csrfToken,
      body: {
        landingPageUrl: catalog.url,
        funnelStage: 'CON',
        channels: ['search'],
        outputLanguage: 'EN',
        userProvidedFacts: edited,
      },
    });
    const generatedBody = await generated.json();
    assert.equal(generated.status, 200, generatedBody.error || 'edited catalog journal should generate');
    const facts = generatedBody.campaign.clarivateFacts;
    assert.equal(facts.impactFactor, 15.1);
    assert.equal(facts.provenanceMap?.impactFactor?.source, 'user_provided');
    assert.equal(facts.jcrQuartile, 'Q1');
    assert.equal(facts.provenanceMap?.jcrQuartile?.source, 'catalog_snapshot');
    assert.equal(facts.provenanceMap?.casZone?.source, 'catalog_snapshot');
    assert.equal(facts.provenanceMap?.indexing?.source, 'catalog_snapshot');
    const copy = campaignText(generatedBody.campaign);
    assert.doesNotMatch(copy, /15\.1/);
    assert.doesNotMatch(copy, /Q1/);
    assert.doesNotMatch(copy, /1区/);
    assert.doesNotMatch(copy, /SCIE/);
    assert.doesNotMatch(copy, /14\.7/);

    const saved = await api('/api/update-journal-metrics', {
      jar,
      csrf: user.csrfToken,
      body: { facts: edited },
    });
    const savedBody = await saved.json();
    assert.equal(saved.status, 200, savedBody.error || 'edited catalog journal should save');
    assert.equal(savedBody.facts.provenanceMap?.impactFactor?.source, 'user_provided');
    assert.equal(savedBody.facts.provenanceMap?.jcrQuartile?.source, 'catalog_snapshot');
    assert.equal(savedBody.facts.provenanceMap?.casZone?.source, 'catalog_snapshot');
    assert.equal(savedBody.facts.provenanceMap?.indexing?.source, 'catalog_snapshot');

    const afterSave = await api('/api/generate-campaign', {
      jar,
      csrf: user.csrfToken,
      body: {
        landingPageUrl: catalog.url,
        funnelStage: 'CON',
        channels: ['search'],
        outputLanguage: 'EN',
        userProvidedFacts: edited,
      },
    });
    const afterSaveBody = await afterSave.json();
    assert.equal(afterSave.status, 200, afterSaveBody.error || 'generate after save should keep catalog labels');
    const savedCopy = campaignText(afterSaveBody.campaign);
    assert.doesNotMatch(savedCopy, /15\.1/);
    assert.doesNotMatch(savedCopy, /Q1/);
    assert.doesNotMatch(savedCopy, /1区/);
    assert.doesNotMatch(savedCopy, /SCIE/);
    assert.equal(afterSaveBody.campaign.clarivateFacts.provenanceMap?.jcrQuartile?.source, 'catalog_snapshot');

    const changedQuartile = await api('/api/generate-campaign', {
      jar,
      csrf: user.csrfToken,
      body: {
        landingPageUrl: catalog.url,
        funnelStage: 'CON',
        channels: ['search'],
        outputLanguage: 'EN',
        userProvidedFacts: { ...edited, jcrQuartile: 'Q2' },
      },
    });
    const changedBody = await changedQuartile.json();
    assert.equal(changedQuartile.status, 200, changedBody.error || 'an edited quartile should generate');
    assert.equal(changedBody.campaign.clarivateFacts.provenanceMap?.jcrQuartile?.source, 'user_provided');
    assert.equal(changedBody.campaign.clarivateFacts.provenanceMap?.casZone?.source, 'catalog_snapshot');
    assert.equal(changedBody.campaign.clarivateFacts.provenanceMap?.indexing?.source, 'catalog_snapshot');
    const changedCopy = campaignText(changedBody.campaign);
    assert.match(changedCopy, /Q2/);
    assert.doesNotMatch(changedCopy, /1区/);
    assert.doesNotMatch(changedCopy, /SCIE/);
  });

  it('keeps a page download count in copy after one metric is edited', async () => {
    setLandingPageFetchForTests(async () => `<html><head><title>Nature Communications</title>
      <meta name="description" content="114M annual downloads"/>
      </head><body><p>article downloads of 349,945,839 (2025)</p></body></html>`);
    const jar: Jar = new Map();
    const user = await devLogin(jar);
    const fetched = await api('/api/fetch-clarivate-facts', {
      jar,
      csrf: user.csrfToken,
      body: { url: 'https://www.nature.com/ncomms', forceRefresh: true },
    });
    const fetchedBody = await fetched.json();
    assert.equal(fetched.status, 200, fetchedBody.error || 'download page should load');
    const catalog = fetchedBody.facts;
    assert.equal(catalog.articleDownloads, 349945839);
    assert.equal(catalog.provenanceMap?.articleDownloads?.source, 'page_sourced');
    assert.equal(catalog.provenanceMap?.articleDownloads?.year, undefined);
    assert.equal(catalog.provenanceMap?.jcrQuartile?.source, 'catalog_snapshot');
    assert.equal('downloadDate' in catalog, false);

    const edited = {
      url: catalog.url,
      journalName: catalog.journalName,
      publisher: catalog.publisher,
      impactFactor: 15.1,
      fiveYearImpactFactor: catalog.fiveYearImpactFactor,
      jcrQuartile: catalog.jcrQuartile,
      casZone: catalog.casZone,
      firstDecisionDays: catalog.firstDecisionDays,
      indexing: catalog.indexing,
      openAccessType: catalog.openAccessType,
      apcUsd: catalog.apcUsd,
      chinaWaiverAvailable: catalog.chinaWaiverAvailable,
      aimsAndScopeSummary: catalog.aimsAndScopeSummary,
      primaryDiscipline: catalog.primaryDiscipline,
      issn: catalog.issn,
      eIssn: catalog.eIssn,
      jcrYear: 2024,
      verificationStatus: 'user_provided',
    };
    const generated = await api('/api/generate-campaign', {
      jar,
      csrf: user.csrfToken,
      body: {
        landingPageUrl: catalog.url,
        funnelStage: 'CON',
        channels: ['search'],
        outputLanguage: 'EN',
        userProvidedFacts: edited,
      },
    });
    const generatedBody = await generated.json();
    assert.equal(generated.status, 200, generatedBody.error || 'edited journal should keep the download count');
    const facts = generatedBody.campaign.clarivateFacts;
    assert.equal(facts.articleDownloads, 349945839);
    assert.equal(facts.provenanceMap?.articleDownloads?.source, 'page_sourced');
    assert.equal(facts.impactFactor, 15.1);
    assert.equal(facts.provenanceMap?.impactFactor?.source, 'user_provided');
    assert.equal(facts.provenanceMap?.jcrQuartile?.source, 'catalog_snapshot');
    const copy = campaignText(generatedBody.campaign);
    assert.match(copy, /349,945,839/);
    assert.doesNotMatch(copy, /15\.1/);
    assert.doesNotMatch(copy, /114M/);
    assert.doesNotMatch(copy, /2025/);
    assert.doesNotMatch(copy, /Q1/);
    assert.doesNotMatch(copy, /1区/);
    assert.doesNotMatch(copy, /SCIE/);
  });

  it('returns 400 for a non-Springer-Nature URL after sign-in', async () => {
    const jar: Jar = new Map();
    const user = await devLogin(jar);
    const evil = 'https://evil.example/paper';
    for (const route of [
      { path: '/api/fetch-clarivate-facts', body: { url: evil } },
      { path: '/api/generate-campaign', body: { landingPageUrl: evil, funnelStage: 'CON', channels: ['search'], outputLanguage: 'EN' } },
      { path: '/api/compare-stages', body: { landingPageUrl: evil, outputLanguage: 'EN' } },
      { path: '/api/update-journal-metrics', body: { facts: validFacts({ url: evil, jcrYear: 2024 }) } },
      { path: '/api/generate-campaign', body: { landingPageUrl: evil, userProvidedFacts: validFacts({ url: evil, jcrYear: 2024 }) } },
    ]) {
      const res = await api(route.path, { jar, csrf: user.csrfToken, body: route.body });
      assert.equal(res.status, 400, route.path);
      assert.match((await res.json()).error, /Springer Nature/);
    }

    applyEnv({ NODE_ENV: 'development', AUTH_DEV_BYPASS: 'true', AUTH_ADMIN_EMAILS: 'dev.user@springernature.com' });
    const refresh = await api('/api/cache/refresh/nature', {
      jar,
      csrf: user.csrfToken,
      body: { url: evil },
    });
    assert.equal(refresh.status, 400);
    assert.match((await refresh.json()).error, /Springer Nature/);
  });

  it('returns 401 for mixed-case and percent-encoded /api paths', async () => {
    const blocked = [
      { method: 'POST', path: '/API/generate-campaign' },
      { method: 'GET', path: '/Api/cache/list' },
      { method: 'GET', path: '/API/cache/list?unused=1' },
      { method: 'GET', path: '/%61pi/cache/list' },
      { method: 'GET', path: '/%41PI/cache/list' },
      { method: 'POST', path: '/%2561pi/generate-campaign' },
    ];
    for (const route of blocked) {
      const res = await rawApi(route.method, route.path);
      assert.equal(res.status, 401, `${route.method} ${route.path}`);
      assert.equal(res.body.error, 'Authentication required');
    }
  });

  it('rejects API paths that contain dot segments, backslashes, or encoded slashes', async () => {
    const blocked = [
      '/api/cache/journal/x%2F..%2F..%2F..%2Fauth%2Fsession',
      '/api/cache/journal/x%5C..%5Cauth%5Csession',
      '/api/cache/journal/x%252F..%252Fauth%252Fsession',
      '/api/cache/journal/x%255C..%255Cauth%255Csession',
      '/api/auth/..%2Fauth/session',
      '/%252e%252e/API/cache/list',
      '/api/cache/journal/x\\..\\auth\\session',
    ];
    for (const requestPath of blocked) {
      const res = await rawApi('GET', requestPath);
      assert.equal(res.status, 400, requestPath);
      assert.equal(res.body.error, 'Invalid request path');
    }

    const sessionRes = await rawApi('GET', '/api/auth/session');
    assert.equal(sessionRes.status, 200);

    const jar: Jar = new Map();
    await devLogin(jar);
    const authed = await rawApi('GET', '/api/cache/journal/x%2F..%2F..%2F..%2Fauth%2Fsession', jar);
    assert.equal(authed.status, 400);
    assert.equal(authed.body.error, 'Invalid request path');
  });

  it('rate limits magic-link requests per email and per IP', async () => {
    applyEnv({ AUTH_PROVIDER: 'magic_link' });
    const config = loadAuthConfig();
    for (let i = 0; i < 5; i++) {
      await requestMagicLink('same.person@springernature.com', config, 'http://localhost:3000', `203.0.113.${i}`);
    }
    await assert.rejects(
      () => requestMagicLink('same.person@springernature.com', config, 'http://localhost:3000', '203.0.113.99'),
      (err: unknown) => err instanceof MagicLinkRejected && err.status === 429
    );

    resetAuthForTests();
    for (let i = 0; i < 5; i++) {
      await requestMagicLink(`person${i}@springernature.com`, config, 'http://localhost:3000', '198.51.100.10');
    }
    await assert.rejects(
      () => requestMagicLink('person5@springernature.com', config, 'http://localhost:3000', '198.51.100.10'),
      (err: unknown) => err instanceof MagicLinkRejected && err.status === 429
    );

    resetAuthForTests();
    const jar: Jar = new Map();
    const anon = await session(jar);
    for (let i = 0; i < 5; i++) {
      const res = await api('/api/auth/magic-link/request', {
        jar,
        csrf: anon.csrfToken,
        body: { email: `ip${i}@springernature.com` },
      });
      assert.equal(res.status, 200, `ip request ${i}`);
    }
    const blocked = await api('/api/auth/magic-link/request', {
      jar,
      csrf: anon.csrfToken,
      body: { email: 'ip5@springernature.com' },
    });
    assert.equal(blocked.status, 429);
  });

  it('does not build magic links from X-Forwarded-Host outside production', async () => {
    applyEnv({ AUTH_PROVIDER: 'magic_link' });
    const jar: Jar = new Map();
    const anon = await session(jar);
    const forwarded = {
      'X-Forwarded-Host': 'evil.example',
      'X-Forwarded-Proto': 'https',
    };
    const configured = await api('/api/auth/magic-link/request', {
      jar,
      csrf: anon.csrfToken,
      body: { email: 'person@springernature.com' },
      headers: forwarded,
    });
    assert.equal(configured.status, 200);
    const configuredLink = getDevOutbox().at(-1)?.text || '';
    assert.match(configuredLink, new RegExp(`${baseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/#magic=`));
    assert.doesNotMatch(configuredLink, /evil\.example/);

    applyEnv({ AUTH_PROVIDER: 'magic_link', APP_URL: undefined });
    const fallback = await api('/api/auth/magic-link/request', {
      jar,
      csrf: anon.csrfToken,
      body: { email: 'other.person@springernature.com' },
      headers: forwarded,
    });
    assert.equal(fallback.status, 200);
    const port = (appServer.address() as AddressInfo).port;
    const fallbackLink = getDevOutbox().at(-1)?.text || '';
    assert.match(fallbackLink, new RegExp(`http://localhost:${port}/#magic=`));
    assert.doesNotMatch(fallbackLink, /evil\.example/);
    assert.doesNotMatch(fallbackLink, /x-forwarded-host/i);
  });

  it('rejects a request body over 1mb', async () => {
    const res = await api('/api/update-journal-metrics', {
      body: { blob: 'x'.repeat(1_200_000) },
    });
    assert.equal(res.status, 413);
  });
});

function rawApi(
  method: string,
  requestPath: string,
  jar?: Jar
): Promise<{ status: number; body: { error?: string } }> {
  const address = appServer.address() as AddressInfo;
  const payload = method === 'GET' || method === 'HEAD' ? null : Buffer.from('{}');
  const headers: Record<string, string> = {};
  if (payload) {
    headers['content-type'] = 'application/json';
    headers['content-length'] = String(payload.length);
  }
  if (jar && jar.size > 0) {
    headers.Cookie = [...jar.entries()].map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('; ');
  }
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: '127.0.0.1', port: address.port, path: requestPath, method, headers },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let body: { error?: string } = {};
          try {
            body = JSON.parse(text);
          } catch {
            body = {};
          }
          resolve({ status: res.statusCode || 0, body });
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function campaignText(campaign: {
  searchAds?: { headlines?: { text?: string }[]; descriptions?: { text?: string }[]; callouts?: string[] };
  displayAds?: {
    shortHeadline?: string;
    longHeadline?: string;
    description?: string;
    bannerHeadlineZh?: string;
    bannerSubtextZh?: string;
  };
}): string {
  const search = campaign.searchAds;
  const display = campaign.displayAds;
  return [
    ...(search?.headlines || []).map((item) => item.text || ''),
    ...(search?.descriptions || []).map((item) => item.text || ''),
    ...(search?.callouts || []),
    display?.shortHeadline,
    display?.longHeadline,
    display?.description,
    display?.bannerHeadlineZh,
    display?.bannerSubtextZh,
  ].join('\n');
}

function pageField<T>(value: T): ExtractedFactField<T> {
  return { value, source: 'LandingPage', confidence: 0.8, provenanceLabel: 'landing_page' };
}

function stubPageLinks(url: string): ExtractedPageFacts {
  const empty = pageField<string | null>(null);
  return {
    journalTitle: pageField('Page Sourced Journal'),
    issnPrint: empty,
    issnElectronic: empty,
    canonicalUrl: pageField(url),
    publisherName: pageField('Nature Portfolio'),
    submissionPortalUrl: pageField('https://mts-example.nature.com'),
    authorGuidelinesUrl: pageField(`${url}/submit`),
    aboutUrl: empty,
    articlesUrl: pageField(`${url}/research-articles`),
    editorsUrl: empty,
    collectionsUrl: empty,
    aimsUrl: empty,
    metricsUrl: empty,
    checklistUrl: empty,
    aimsAndScopeSummary: pageField('Read from the journal page.'),
    articleProcessingChargeUsd: pageField<number | null>(null),
    apcInfoUrl: empty,
    firstDecisionDays: pageField<number | null>(40),
    acceptedArticleTypes: pageField<string[]>([]),
    editorInChief: empty,
    peerReviewModel: empty,
    openAccessPolicy: empty,
    specialIssuesAvailable: pageField(false),
    pageMetrics: [],
    pageFeatures: [],
    layout: 'unknown',
    rawConfidenceAverage: 0.5,
    extractedDate: '2026-10-08T00:00:00.000Z',
  };
}

async function devLogin(jar: Jar): Promise<{ csrfToken: string; email: string }> {
  applyEnv({ NODE_ENV: 'development', AUTH_DEV_BYPASS: 'true', AUTH_PROVIDER: 'magic_link' });
  const anon = await session(jar);
  const res = await api('/api/auth/dev-login', { jar, csrf: anon.csrfToken, body: {} });
  assert.equal(res.status, 200);
  const body = await res.json();
  return { csrfToken: body.csrfToken, email: body.user.email };
}
