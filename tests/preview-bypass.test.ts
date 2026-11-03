import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import { isPreviewBypassEnabled, previewBypassEmail } from '../src/server/auth/config';
import { serializeCookie } from '../src/server/auth/cookies';
import { apiGuard } from '../src/server/auth/guard';
import { resetAuthForTests } from '../src/server/auth/reset';
import { registerAuthRoutes } from '../src/server/auth/routes';

const KEYS = ['NODE_ENV', 'AUTH_PREVIEW_BYPASS', 'AUTH_PREVIEW_ALLOWED_EMAIL', 'AUTH_DEV_BYPASS', 'AUTH_SESSION_SECRET', 'AUTH_PROVIDER', 'AUTH_ALLOWED_EMAIL_DOMAINS', 'APP_URL', 'AUTH_EMAIL_TRANSPORT'];
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];

function env(over: Record<string, string | undefined>): void {
  const base: Record<string, string | undefined> = {
    NODE_ENV: 'test', AUTH_SESSION_SECRET: 'preview-test-secret-at-least-32-chars!!', AUTH_PROVIDER: 'magic_link',
    AUTH_ALLOWED_EMAIL_DOMAINS: undefined, AUTH_PREVIEW_BYPASS: undefined, AUTH_PREVIEW_ALLOWED_EMAIL: undefined,
    AUTH_DEV_BYPASS: undefined, APP_URL: undefined, AUTH_EMAIL_TRANSPORT: 'console',
  };
  for (const [k, v] of Object.entries({ ...base, ...over })) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
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
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server.close(); for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
beforeEach(() => resetAuthForTests());

describe('preview bypass config', () => {
  it('is off unless both secrets are set to an allowed address', () => {
    assert.equal(isPreviewBypassEnabled({}), false);
    assert.equal(isPreviewBypassEnabled({ AUTH_PREVIEW_BYPASS: 'true' }), false);
    assert.equal(isPreviewBypassEnabled({ AUTH_PREVIEW_BYPASS: '1', AUTH_PREVIEW_ALLOWED_EMAIL: 'a@springernature.com' }), false);
    assert.equal(isPreviewBypassEnabled({ AUTH_PREVIEW_BYPASS: 'true', AUTH_PREVIEW_ALLOWED_EMAIL: 'a@evil.com' }), false);
    assert.equal(isPreviewBypassEnabled({ AUTH_PREVIEW_BYPASS: 'true', AUTH_PREVIEW_ALLOWED_EMAIL: 'a@x.springernature.com' }), false);
    assert.equal(previewBypassEmail({ NODE_ENV: 'production', AUTH_PREVIEW_BYPASS: 'true', AUTH_PREVIEW_ALLOWED_EMAIL: 'Hong.Chen@SpringerNature.com' }), 'hong.chen@springernature.com');
  });
  it('uses SameSite=None with Secure only when asked', () => {
    assert.match(serializeCookie('a', 'b', { sameSite: 'None' }), /; Secure; SameSite=None$/);
    assert.match(serializeCookie('a', 'b', {}), /SameSite=Lax$/);
    assert.doesNotMatch(serializeCookie('a', 'b', {}), /Secure/);
  });
});

describe('preview bypass over HTTP without cookies (framed iframe)', () => {
  it('signs in the listed email using only header tokens, even with NODE_ENV=production', async () => {
    env({ NODE_ENV: 'production', APP_URL: 'https://example.test', AUTH_PREVIEW_BYPASS: 'true', AUTH_PREVIEW_ALLOWED_EMAIL: 'hong.chen@springernature.com', AUTH_EMAIL_TRANSPORT: 'brevo' });
    const s = await fetch(`${base}/api/auth/session`);
    assert.match(s.headers.get('set-cookie') || '', /SameSite=None/);
    const anon = await s.json();
    assert.equal(anon.devBypass, true);
    assert.ok(anon.sessionToken);
    const login = await fetch(`${base}/api/auth/dev-login`, {
      method: 'POST', body: '{}',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': anon.csrfToken, 'X-Session-Token': anon.sessionToken },
    });
    assert.equal(login.status, 200);
    const user = await login.json();
    assert.equal(user.user.email, 'hong.chen@springernature.com');
    const priv = await fetch(`${base}/api/private`, { headers: { 'X-Session-Token': user.sessionToken } });
    assert.equal(priv.status, 200);
  });

  it('ignores the header token and hides the endpoint when the bypass is off', async () => {
    env({ AUTH_PREVIEW_BYPASS: 'true', AUTH_PREVIEW_ALLOWED_EMAIL: 'hong.chen@springernature.com' });
    const anon = await (await fetch(`${base}/api/auth/session`)).json();
    const login = await fetch(`${base}/api/auth/dev-login`, {
      method: 'POST', body: '{}',
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
