import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import { assertProductionAuthConfig, isPreviewBypassEnabled, previewBypassEmail } from '../src/server/auth/config';
import { serializeCookie } from '../src/server/auth/cookies';
import { apiGuard, requireAdmin } from '../src/server/auth/guard';
import { resetAuthForTests } from '../src/server/auth/reset';
import { registerAuthRoutes } from '../src/server/auth/routes';

const KEYS = ['NODE_ENV', 'AUTH_PREVIEW_BYPASS', 'AUTH_PREVIEW_ALLOWED_EMAIL', 'AUTH_DEV_BYPASS', 'AUTH_SESSION_SECRET', 'AUTH_PROVIDER', 'AUTH_ALLOWED_EMAIL_DOMAINS', 'APP_URL', 'AUTH_EMAIL_TRANSPORT', 'AUTH_PREVIEW_PASSCODE', 'AUTH_ADMIN_EMAILS'];
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];

function env(over: Record<string, string | undefined>): void {
  const base: Record<string, string | undefined> = {
    NODE_ENV: 'test', AUTH_SESSION_SECRET: 'preview-test-secret-at-least-32-chars!!', AUTH_PROVIDER: 'magic_link',
    AUTH_ALLOWED_EMAIL_DOMAINS: undefined, AUTH_PREVIEW_BYPASS: undefined, AUTH_PREVIEW_ALLOWED_EMAIL: undefined,
    AUTH_DEV_BYPASS: undefined, APP_URL: undefined, AUTH_PREVIEW_PASSCODE: undefined, AUTH_ADMIN_EMAILS: undefined, AUTH_EMAIL_TRANSPORT: 'console',
  };
  for (const [k, v] of Object.entries({ ...base, ...over })) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}

const PASS = 'preview-passcode-1234';
const PREVIEW = { AUTH_PREVIEW_BYPASS: 'true', AUTH_PREVIEW_ALLOWED_EMAIL: 'hong.chen@springernature.com', AUTH_PREVIEW_PASSCODE: PASS };

async function previewLogin(passcode: string = PASS) {
  const anon = await (await fetch(`${base}/api/auth/session`)).json();
  const res = await fetch(`${base}/api/auth/dev-login`, { method: 'POST', body: JSON.stringify({ passcode }), headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': anon.csrfToken, 'X-Session-Token': anon.sessionToken } });
  return { anon, res };
}

let server: Server;
let base = '';
before(async () => {
  env({});
  const app = express();
  app.use(express.json());
  app.use(apiGuard);
  registerAuthRoutes(app);
  app.get('/api/private', (_req, res) => res.json({ ok: true }));
  app.post('/api/admin-only', requireAdmin, (_req, res) => res.json({ ok: true }));
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server.close(); for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
beforeEach(() => resetAuthForTests());

describe('preview bypass config', () => {
  it('is off unless both secrets are set to an allowed address', () => {
    assert.equal(isPreviewBypassEnabled({}), false);
    assert.equal(isPreviewBypassEnabled({ AUTH_PREVIEW_BYPASS: 'true' }), false);
    assert.equal(isPreviewBypassEnabled({ AUTH_PREVIEW_BYPASS: '1', AUTH_PREVIEW_ALLOWED_EMAIL: 'a@springernature.com', AUTH_PREVIEW_PASSCODE: PASS }), false);
    assert.equal(isPreviewBypassEnabled({ AUTH_PREVIEW_BYPASS: 'true', AUTH_PREVIEW_ALLOWED_EMAIL: 'a@springernature.com' }), false, 'passcode required');
    assert.equal(isPreviewBypassEnabled({ AUTH_PREVIEW_BYPASS: 'true', AUTH_PREVIEW_ALLOWED_EMAIL: 'a@springernature.com', AUTH_PREVIEW_PASSCODE: 'short' }), false);
    assert.equal(isPreviewBypassEnabled({ AUTH_PREVIEW_BYPASS: 'true', AUTH_PREVIEW_ALLOWED_EMAIL: 'a@evil.com', AUTH_PREVIEW_PASSCODE: PASS }), false);
    assert.equal(isPreviewBypassEnabled({ AUTH_PREVIEW_BYPASS: 'true', AUTH_PREVIEW_ALLOWED_EMAIL: 'a@x.springernature.com', AUTH_PREVIEW_PASSCODE: PASS }), false);
    assert.equal(previewBypassEmail({ NODE_ENV: 'production', AUTH_PREVIEW_BYPASS: 'true', AUTH_PREVIEW_ALLOWED_EMAIL: 'Hong.Chen@SpringerNature.com', AUTH_PREVIEW_PASSCODE: PASS }), 'hong.chen@springernature.com');
  });
  it('uses SameSite=None with Secure only when asked', () => {
    assert.match(serializeCookie('a', 'b', { sameSite: 'None' }), /; Secure; SameSite=None$/);
    assert.match(serializeCookie('a', 'b', {}), /SameSite=Lax$/);
    assert.doesNotMatch(serializeCookie('a', 'b', {}), /Secure/);
  });
});

describe('preview bypass over HTTP without cookies (framed iframe)', () => {
  it('signs in the listed email using only header tokens, even with NODE_ENV=production', async () => {
    env({ NODE_ENV: 'production', APP_URL: 'https://example.test', AUTH_PREVIEW_BYPASS: 'true', AUTH_PREVIEW_ALLOWED_EMAIL: 'hong.chen@springernature.com', AUTH_PREVIEW_PASSCODE: PASS, AUTH_EMAIL_TRANSPORT: 'brevo' });
    const s = await fetch(`${base}/api/auth/session`);
    assert.match(s.headers.get('set-cookie') || '', /SameSite=None/);
    const anon = await s.json();
    assert.equal(anon.devBypass, true);
    assert.ok(anon.sessionToken);
    const login = await fetch(`${base}/api/auth/dev-login`, {
      method: 'POST', body: JSON.stringify({ passcode: PASS }),
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': anon.csrfToken, 'X-Session-Token': anon.sessionToken },
    });
    assert.equal(login.status, 200);
    const user = await login.json();
    assert.equal(user.user.email, 'hong.chen@springernature.com');
    const priv = await fetch(`${base}/api/private`, { headers: { 'X-Session-Token': user.sessionToken } });
    assert.equal(priv.status, 200);
  });

  it('ignores the header token and hides the endpoint when the bypass is off', async () => {
    env({ AUTH_PREVIEW_BYPASS: 'true', AUTH_PREVIEW_ALLOWED_EMAIL: 'hong.chen@springernature.com', AUTH_PREVIEW_PASSCODE: PASS });
    const anon = await (await fetch(`${base}/api/auth/session`)).json();
    const login = await fetch(`${base}/api/auth/dev-login`, {
      method: 'POST', body: JSON.stringify({ passcode: PASS }),
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': anon.csrfToken, 'X-Session-Token': anon.sessionToken },
    });
    const user = await login.json();
    env({});
    const priv = await fetch(`${base}/api/private`, { headers: { 'X-Session-Token': user.sessionToken } });
    assert.equal(priv.status, 401);
    const s = await (await fetch(`${base}/api/auth/session`)).json();
    assert.equal(s.devBypass, false);
    assert.equal(s.sessionToken, undefined);
    const again = await fetch(`${base}/api/auth/dev-login`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
    assert.notEqual(again.status, 200);
  });

  it('reproduces the original failure: no cookie and no header means CSRF rejection', async () => {
    env({ NODE_ENV: 'development', AUTH_DEV_BYPASS: 'true' });
    const anon = await (await fetch(`${base}/api/auth/session`)).json();
    assert.equal(anon.devBypass, true);
    const login = await fetch(`${base}/api/auth/dev-login`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': anon.csrfToken } });
    assert.equal(login.status, 403);
  });
});

describe('preview bypass hardening', () => {
  it('fails production startup when the bypass is on without a passcode', () => {
    const prod = { NODE_ENV: 'production', AUTH_SESSION_SECRET: 'x'.repeat(40), APP_URL: 'https://a.test', AUTH_PROVIDER: 'magic_link', AUTH_EMAIL_TRANSPORT: 'brevo', AUTH_PREVIEW_BYPASS: 'true', AUTH_PREVIEW_ALLOWED_EMAIL: 'hong.chen@springernature.com' };
    assert.throws(() => assertProductionAuthConfig(prod), /AUTH_PREVIEW_PASSCODE/);
    assert.doesNotThrow(() => assertProductionAuthConfig({ ...prod, AUTH_PREVIEW_PASSCODE: PASS }));
  });

  it('rejects a wrong or missing passcode', async () => {
    env(PREVIEW);
    assert.equal((await previewLogin('wrong-passcode-xx')).res.status, 401);
    assert.equal((await previewLogin('')).res.status, 401);
    const { anon } = await previewLogin();
    assert.equal(anon.previewPasscodeRequired, true);
  });

  it('never grants admin to preview-bypass sessions', async () => {
    env({ ...PREVIEW, AUTH_ADMIN_EMAILS: 'hong.chen@springernature.com' });
    const { res } = await previewLogin();
    const user = await res.json();
    assert.equal(user.admin, false);
    const admin = await fetch(`${base}/api/admin-only`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': user.csrfToken, 'X-Session-Token': user.sessionToken } });
    assert.equal(admin.status, 403);
  });

  it('sets SameSite=None; Secure cookies and logout invalidates the old token', async () => {
    env(PREVIEW);
    const { res } = await previewLogin();
    assert.match(res.headers.get('set-cookie') || '', /HttpOnly; Secure; SameSite=None/);
    const user = await res.json();
    const out = await fetch(`${base}/api/auth/logout`, { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': user.csrfToken, 'X-Session-Token': user.sessionToken } });
    assert.equal(out.status, 200);
    assert.match(out.headers.get('set-cookie') || '', /SameSite=None/);
    const fresh = await out.json();
    assert.equal(fresh.authenticated, false);
    assert.notEqual(fresh.sessionToken, user.sessionToken);
    const priv = await fetch(`${base}/api/private`, { headers: { 'X-Session-Token': user.sessionToken } });
    assert.equal(priv.status, 401);
  });

  it('names AUTH_PREVIEW_ALLOWED_EMAIL in the bad-email error', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync(new URL('../src/server/auth/routes.ts', import.meta.url), 'utf8');
    assert.match(src, /'AUTH_PREVIEW_ALLOWED_EMAIL is not an allowed email domain'/);
  });
});
