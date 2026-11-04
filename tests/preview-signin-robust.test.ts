import assert from 'node:assert/strict';
import express from 'express';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';
import { previewBypassEmail } from '../src/server/auth/config';
import { apiGuard } from '../src/server/auth/guard';
import { resetAuthForTests } from '../src/server/auth/reset';
import { registerAuthRoutes } from '../src/server/auth/routes';
import { clearAllSessions } from '../src/server/auth/session';
import { SIGN_IN_MESSAGES, signInErrorFor } from '../src/auth/api';

const PASS = 'preview-passcode-1234';
const KEYS = ['NODE_ENV', 'AUTH_PREVIEW_BYPASS', 'AUTH_PREVIEW_ALLOWED_EMAIL', 'AUTH_PREVIEW_PASSCODE', 'AUTH_SESSION_SECRET', 'AUTH_PROVIDER', 'AUTH_EMAIL_TRANSPORT', 'AUTH_DEV_BYPASS', 'AUTH_ALLOWED_EMAIL_DOMAINS'];
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];

let server: Server;
let base = '';
before(async () => {
  Object.assign(process.env, {
    NODE_ENV: 'development', AUTH_PREVIEW_BYPASS: 'true', AUTH_PREVIEW_ALLOWED_EMAIL: 'Hong.Chen@SpringerNature.com',
    AUTH_PREVIEW_PASSCODE: PASS, AUTH_PROVIDER: 'magic_link', AUTH_EMAIL_TRANSPORT: 'console',
  });
  delete process.env.AUTH_SESSION_SECRET; delete process.env.AUTH_DEV_BYPASS; delete process.env.AUTH_ALLOWED_EMAIL_DOMAINS;
  const app = express();
  app.use(express.json());
  app.use(apiGuard);
  registerAuthRoutes(app);
  app.get('/api/private', (_req, res) => res.json({ ok: true }));
  app.post('/api/private', (_req, res) => res.json({ ok: true }));
  await new Promise<void>((r) => { server = app.listen(0, '127.0.0.1', () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(() => { server.close(); for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
beforeEach(() => resetAuthForTests());

const json = { 'Content-Type': 'application/json' };
async function login(passcode: string, headers: Record<string, string> = {}) {
  return fetch(`${base}/api/auth/dev-login`, { method: 'POST', headers: { ...json, ...headers }, body: JSON.stringify({ passcode }) });
}

describe('preview sign-in robustness', () => {
  it('accepts a mixed-case allowed email secret', () => {
    assert.equal(previewBypassEmail(), 'hong.chen@springernature.com');
    assert.equal(previewBypassEmail({ AUTH_PREVIEW_BYPASS: ' True ', AUTH_PREVIEW_ALLOWED_EMAIL: ' A@springernature.com\n', AUTH_PREVIEW_PASSCODE: PASS }), 'a@springernature.com');
  });

  it('trims whitespace and newlines around a pasted passcode', async () => {
    const res = await login(`  ${PASS}\n`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).user.email, 'hong.chen@springernature.com');
  });

  it('works with no cookies, no storage and no prior session (header token only)', async () => {
    const res = await login(PASS);
    const data = await res.json();
    assert.ok(data.sessionToken.startsWith('pv1.'));
    const ok = await fetch(`${base}/api/private`, { headers: { 'X-Session-Token': data.sessionToken } });
    assert.equal(ok.status, 200);
    const post = await fetch(`${base}/api/private`, { method: 'POST', headers: { ...json, 'X-Session-Token': data.sessionToken, 'X-CSRF-Token': data.csrfToken }, body: '{}' });
    assert.equal(post.status, 200);
  });

  it('keeps the preview session after the server loses its in-memory sessions', async () => {
    const data = await (await login(PASS)).json();
    clearAllSessions();
    const ok = await fetch(`${base}/api/private`, { headers: { 'X-Session-Token': data.sessionToken } });
    assert.equal(ok.status, 200);
  });

  it('uses the header token even when a stale cookie is sent', async () => {
    const data = await (await login(PASS)).json();
    const ok = await fetch(`${base}/api/private`, { headers: { Cookie: 'sn_session=stale.value', 'X-Session-Token': data.sessionToken } });
    assert.equal(ok.status, 200);
  });

  it('rejects a tampered preview token', async () => {
    const data = await (await login(PASS)).json();
    const bad = data.sessionToken.slice(0, -2) + 'xx';
    assert.equal((await fetch(`${base}/api/private`, { headers: { 'X-Session-Token': bad } })).status, 401);
  });

  it('ignores the Origin header (AI Studio origin is not rejected)', async () => {
    const res = await login(PASS, { Origin: 'https://aistudio.google.com' });
    assert.equal(res.status, 200);
  });

  it('returns a coded wrong-passcode error and locks out after 10 failures', async () => {
    const wrong = await login('nope-nope-nope');
    assert.equal(wrong.status, 401);
    assert.equal((await wrong.json()).code, 'wrong_passcode');
    for (let i = 0; i < 9; i++) await login('nope-nope-nope');
    const locked = await login(PASS);
    assert.equal(locked.status, 429);
    assert.equal((await locked.json()).code, 'too_many_attempts');
  });

  it('magic-link GET of the app never consumes the token; only POST verify does', async () => {
    // The link is /#magic=<token>: the fragment never reaches the server, so a scanner's GET cannot use it.
    const { requestMagicLink } = await import('../src/server/auth/magicLink');
    const { loadAuthConfig } = await import('../src/server/auth/config');
    const { getDevOutbox } = await import('../src/server/auth/email');
    await requestMagicLink('hong.chen@springernature.com', loadAuthConfig(), base, '127.0.0.1');
    const mail = getDevOutbox().at(-1)!;
    const link = /https?:\/\/\S+#magic=[\w-]+/.exec(mail.text)![0];
    const token = link.split('#magic=')[1];
    await fetch(link); await fetch(link);
    const anon = await (await fetch(`${base}/api/auth/session`)).json();
    const verify = await fetch(`${base}/api/auth/magic-link/verify`, { method: 'POST', headers: { ...json, 'X-CSRF-Token': anon.csrfToken, 'X-Session-Token': anon.sessionToken }, body: JSON.stringify({ token }) });
    assert.equal(verify.status, 200);
  });
});

describe('client sign-in messages', () => {
  it('maps every failure to a clear message', () => {
    assert.equal(signInErrorFor(401, { code: 'wrong_passcode' }).error, SIGN_IN_MESSAGES.wrong_passcode);
    assert.equal(signInErrorFor(404, null).code, 'not_configured');
    assert.equal(signInErrorFor(429, null).code, 'too_many_attempts');
    assert.equal(signInErrorFor(403, { code: 'csrf' }).code, 'session_expired');
    assert.match(signInErrorFor(500, null).error, /HTTP 500/);
  });
});
