import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { describe, it } from 'node:test';
import { BrevoEmailSender, EmailConfigError, EmailSendError, createEmailSender, parseSender } from '../src/server/auth/email';
import { resolveAppUrl } from '../src/server/auth/routes';

describe('brevo email transport', () => {
  it('posts the Brevo payload with the api-key header', async () => {
    const box: { got?: { headers: Record<string, unknown>; body: any } } = {};
    const server = createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        box.got = { headers: req.headers, body: JSON.parse(raw) };
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end('{"messageId":"x"}');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const port = (server.address() as { port: number }).port;
    try {
      const sender = new BrevoEmailSender('test-key', 'from@example.com', 'OmniFact', `http://127.0.0.1:${port}/v3/smtp/email`);
      await sender.send({ to: 'a@springernature.com', subject: 'S', text: 'T', html: '<p>T</p>' });
      const got = box.got;
      assert.ok(got);
      assert.equal(got!.headers['api-key'], 'test-key');
      assert.deepEqual(got!.body, {
        sender: { email: 'from@example.com', name: 'OmniFact' },
        to: [{ email: 'a@springernature.com' }],
        subject: 'S',
        textContent: 'T',
        htmlContent: '<p>T</p>',
      });
    } finally {
      server.close();
    }
  });

  it('fails without a key or sender and does not leak the key on errors', async () => {
    const saved = { ...process.env };
    try {
      delete process.env.BREVO_API_KEY;
      delete process.env.AUTH_EMAIL_FROM;
      delete process.env.SMTP_FROM;
      assert.throws(() => createEmailSender('brevo'), /BREVO_API_KEY and AUTH_EMAIL_FROM/);
      process.env.BREVO_API_KEY = 'secret-key';
      process.env.AUTH_EMAIL_FROM = 'from@example.com';
      assert.equal(createEmailSender('brevo').name, 'brevo');
      assert.throws(() => { delete process.env.BREVO_API_KEY; createEmailSender('brevo'); }, EmailConfigError);
    } finally {
      process.env = saved;
    }
  });

  it('maps HTTP and network failures to EmailSendError without leaking the key (stubbed fetch)', async () => {
    const realFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => new Response('{"message":"unauthorized"}', { status: 401 })) as typeof fetch;
      const sender = new BrevoEmailSender('secret-key', 'f@example.com', '');
      await assert.rejects(sender.send({ to: 'a@b.com', subject: 's', text: 't' }), (e: Error) =>
        e instanceof EmailSendError && e.code === 'email_send_failed' && /401/.test(e.message) && !e.message.includes('secret-key'));
      globalThis.fetch = (async () => { throw new TypeError('fetch failed secret-key'); }) as typeof fetch;
      await assert.rejects(sender.send({ to: 'a@b.com', subject: 's', text: 't' }), (e: Error) =>
        e instanceof EmailSendError && !e.message.includes('secret-key'));
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('parses "Name <email>" sender and applies name precedence', async () => {
    assert.deepEqual(parseSender('MEM PM <pm@example.com>'), { name: 'MEM PM', email: 'pm@example.com' });
    assert.deepEqual(parseSender('"MEM PM" <pm@example.com>'), { name: 'MEM PM', email: 'pm@example.com' });
    assert.deepEqual(parseSender('pm@example.com'), { name: '', email: 'pm@example.com' });
    const saved = { ...process.env };
    const realFetch = globalThis.fetch;
    let body: any;
    try {
      globalThis.fetch = (async (_u: unknown, init: RequestInit) => { body = JSON.parse(String(init.body)); return new Response('{}', { status: 201 }); }) as typeof fetch;
      process.env.BREVO_API_KEY = 'k';
      process.env.AUTH_EMAIL_FROM = 'MEM PM <pm@example.com>';
      delete process.env.AUTH_EMAIL_FROM_NAME;
      await createEmailSender('brevo').send({ to: 'a@b.com', subject: 's', text: 't' });
      assert.deepEqual(body.sender, { email: 'pm@example.com', name: 'MEM PM' });
      process.env.AUTH_EMAIL_FROM_NAME = 'Override';
      await createEmailSender('brevo').send({ to: 'a@b.com', subject: 's', text: 't' });
      assert.deepEqual(body.sender, { email: 'pm@example.com', name: 'Override' });
      process.env.AUTH_EMAIL_FROM = 'pm@example.com';
      delete process.env.AUTH_EMAIL_FROM_NAME;
      await createEmailSender('brevo').send({ to: 'a@b.com', subject: 's', text: 't' });
      assert.deepEqual(body.sender, { email: 'pm@example.com', name: 'OmniFact' });
    } finally {
      globalThis.fetch = realFetch;
      process.env = saved;
    }
  });

  it('builds magic-link base URL from APP_BASE_URL or trusted forwarded headers', () => {
    const saved = { ...process.env };
    const req = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()], protocol: 'http', socket: { localPort: 3000 } }) as any;
    try {
      delete process.env.APP_URL;
      delete process.env.TRUST_PROXY;
      process.env.NODE_ENV = 'development';
      const fwd = { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'ais-dev-abc.run.app', host: 'internal:3000' };
      assert.equal(resolveAppUrl(req(fwd)), 'http://localhost:3000');
      process.env.TRUST_PROXY = 'true';
      assert.equal(resolveAppUrl(req(fwd)), 'https://ais-dev-abc.run.app');
      process.env.APP_BASE_URL = 'https://omnifact.example.com/';
      assert.equal(resolveAppUrl(req(fwd)), 'https://omnifact.example.com');
    } finally {
      process.env = saved;
    }
  });
});
