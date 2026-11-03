import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { describe, it } from 'node:test';
import { BrevoEmailSender, createEmailSender } from '../src/server/auth/email';

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
      const sender = new BrevoEmailSender('secret-key', 'f@example.com', '', 'http://127.0.0.1:9/none');
      await assert.rejects(sender.send({ to: 'a@b.com', subject: 's', text: 't' }), (e: Error) => !e.message.includes('secret-key'));
    } finally {
      process.env = saved;
    }
  });
});
