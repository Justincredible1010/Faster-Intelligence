export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSender {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

const devOutbox: EmailMessage[] = [];

export function getDevOutbox(): EmailMessage[] {
  return devOutbox.map((message) => ({ ...message }));
}

export function clearDevOutbox(): void {
  devOutbox.length = 0;
}

export class ConsoleEmailSender implements EmailSender {
  readonly name = 'console';

  async send(message: EmailMessage): Promise<void> {
    devOutbox.push({ ...message });
    console.info(`[auth email:console] To: ${message.to}\nSubject: ${message.subject}\n${message.text}`);
  }
}

export class HttpEmailSender implements EmailSender {
  readonly name = 'http';

  constructor(
    private readonly url: string,
    private readonly bearer: string
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.bearer) headers.Authorization = `Bearer ${this.bearer}`;
    const response = await fetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      throw new Error(`Email webhook returned ${response.status}`);
    }
  }
}

export class SmtpEmailSender implements EmailSender {
  readonly name = 'smtp';

  async send(message: EmailMessage): Promise<void> {
    const host = process.env.SMTP_HOST || '';
    const from = process.env.SMTP_FROM || '';
    if (!host || !from) {
      throw new Error('SMTP_HOST and SMTP_FROM are required when AUTH_EMAIL_TRANSPORT=smtp');
    }
    const nodemailer = await import('nodemailer');
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';
    const transport = nodemailer.createTransport({
      host,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth: user ? { user, pass } : undefined,
    });
    await transport.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}

const customSenders = new Map<string, () => EmailSender>();

/** Register another transport (SES, SendGrid, internal relay) without changing call sites. */
export function registerEmailSender(name: string, factory: () => EmailSender): void {
  customSenders.set(name.trim().toLowerCase(), factory);
}

export function createEmailSender(transport = process.env.AUTH_EMAIL_TRANSPORT || 'console'): EmailSender {
  const name = transport.trim().toLowerCase();
  const custom = customSenders.get(name);
  if (custom) return custom();
  if (name === 'console') return new ConsoleEmailSender();
  if (name === 'http') {
    const url = process.env.AUTH_EMAIL_WEBHOOK_URL || '';
    if (!url) throw new Error('AUTH_EMAIL_WEBHOOK_URL is required when AUTH_EMAIL_TRANSPORT=http');
    return new HttpEmailSender(url, process.env.AUTH_EMAIL_WEBHOOK_BEARER || '');
  }
  if (name === 'smtp') return new SmtpEmailSender();
  throw new Error(`Unknown AUTH_EMAIL_TRANSPORT "${transport}"`);
}
