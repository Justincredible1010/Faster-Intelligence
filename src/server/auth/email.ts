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

/** Thrown when a transport fails. Message never contains credentials. */
export class EmailSendError extends Error {
  readonly code = 'email_send_failed' as const;
  constructor(message: string) {
    super(message);
    this.name = 'EmailSendError';
  }
}

/** Thrown when the selected transport is missing required configuration. */
export class EmailConfigError extends Error {
  readonly code = 'not_configured' as const;
  constructor(message: string) {
    super(message);
    this.name = 'EmailConfigError';
  }
}

/** Parses "Name <email@x>" or "email@x". */
export function parseSender(value: string): { email: string; name: string } {
  const raw = value.trim();
  const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(raw);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: '', email: raw };
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
      throw new EmailSendError(`Email webhook returned ${response.status}`);
    }
  }
}

export class SmtpEmailSender implements EmailSender {
  readonly name = 'smtp';

  async send(message: EmailMessage): Promise<void> {
    const host = process.env.SMTP_HOST || '';
    const from = process.env.SMTP_FROM || '';
    if (!host || !from) {
      throw new EmailConfigError('SMTP_HOST and SMTP_FROM are required when AUTH_EMAIL_TRANSPORT=smtp');
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

/** Brevo transactional email over HTTPS (https://api.brevo.com/v3/smtp/email). Uses the normal Brevo API key. */
export class BrevoEmailSender implements EmailSender {
  readonly name = 'brevo';

  constructor(
    private readonly apiKey: string,
    private readonly fromEmail: string,
    private readonly fromName: string,
    private readonly url = 'https://api.brevo.com/v3/smtp/email'
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const body: Record<string, unknown> = {
      sender: this.fromName ? { email: this.fromEmail, name: this.fromName } : { email: this.fromEmail },
      to: [{ email: message.to }],
      subject: message.subject,
      textContent: message.text,
    };
    if (message.html) body.htmlContent = message.html;
    let response: Response;
    try {
      response = await fetch(this.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'api-key': this.apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      throw new EmailSendError(`Brevo request failed: ${err instanceof Error ? err.name : 'network error'}`);
    }
    if (!response.ok) {
      // Never echo the API key; status only.
      throw new EmailSendError(`Brevo returned ${response.status}`);
    }
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
    if (!url) throw new EmailConfigError('AUTH_EMAIL_WEBHOOK_URL is required when AUTH_EMAIL_TRANSPORT=http');
    return new HttpEmailSender(url, process.env.AUTH_EMAIL_WEBHOOK_BEARER || '');
  }
  if (name === 'smtp') return new SmtpEmailSender();
  if (name === 'brevo') {
    const apiKey = (process.env.BREVO_API_KEY || '').trim();
    // AUTH_EMAIL_FROM (or SMTP_FROM) may be "email" or "Name <email>". AUTH_EMAIL_FROM_NAME wins over a parsed name.
    const parsed = parseSender(process.env.AUTH_EMAIL_FROM || process.env.SMTP_FROM || '');
    if (!apiKey || !parsed.email || !parsed.email.includes('@')) {
      throw new EmailConfigError('BREVO_API_KEY and AUTH_EMAIL_FROM are required when AUTH_EMAIL_TRANSPORT=brevo');
    }
    const name = (process.env.AUTH_EMAIL_FROM_NAME || '').trim() || parsed.name || 'OmniFact';
    return new BrevoEmailSender(apiKey, parsed.email, name);
  }
  throw new EmailConfigError(`Unknown AUTH_EMAIL_TRANSPORT "${transport}"`);
}
