import { createHash } from 'crypto';
import http from 'http';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey as JoseCryptoKey } from 'jose';

export interface MockClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  hd?: string;
  name?: string;
  includeEmail: boolean;
  includeEmailVerified: boolean;
  includeHd: boolean;
}

const DEFAULT_CLAIMS: MockClaims = {
  sub: 'user-1',
  email: 'person@springernature.com',
  email_verified: true,
  hd: 'springernature.com',
  name: 'Person Example',
  includeEmail: true,
  includeEmailVerified: true,
  includeHd: true,
};

/**
 * Minimal authorization-code + PKCE issuer used to exercise Google and generic OIDC
 * without calling a real identity provider.
 */
export class MockOidcIssuer {
  readonly clientId = 'test-client';
  readonly clientSecret = 'test-secret';
  issuer = '';
  claims: MockClaims = { ...DEFAULT_CLAIMS };
  tokenIssuerOverride: string | null = null;
  tokenAudienceOverride: string | null = null;
  nonceOverride: string | null = null;
  omitNonce = false;

  private server: http.Server | null = null;
  private privateKey: JoseCryptoKey | null = null;
  private publicJwk: Record<string, unknown> | null = null;
  private codes = new Map<string, { challenge: string; nonce: string; redirectUri: string }>();

  async start(): Promise<void> {
    const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
    this.privateKey = privateKey;
    const jwk = await exportJWK(publicKey);
    jwk.kid = 'mock-key';
    jwk.alg = 'RS256';
    jwk.use = 'sig';
    this.publicJwk = jwk;

    this.server = http.createServer((req, res) => {
      this.handle(req, res).catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'mock error' }));
      });
    });
    await new Promise<void>((resolve) => {
      this.server!.listen(0, '127.0.0.1', () => resolve());
    });
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Mock issuer failed to bind');
    this.issuer = `http://127.0.0.1:${address.port}`;
  }

  async close(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => (err ? reject(err) : resolve()));
    });
    this.server = null;
  }

  reset(): void {
    this.claims = { ...DEFAULT_CLAIMS };
    this.tokenIssuerOverride = null;
    this.tokenAudienceOverride = null;
    this.nonceOverride = null;
    this.omitNonce = false;
    this.codes.clear();
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url || '/', this.issuer);
    if (req.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
      this.sendJson(res, 200, {
        issuer: this.issuer,
        authorization_endpoint: `${this.issuer}/authorize`,
        token_endpoint: `${this.issuer}/token`,
        jwks_uri: `${this.issuer}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic'],
        scopes_supported: ['openid', 'email', 'profile'],
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/jwks') {
      this.sendJson(res, 200, { keys: [this.publicJwk] });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/authorize') {
      const clientId = url.searchParams.get('client_id');
      const redirectUri = url.searchParams.get('redirect_uri');
      const state = url.searchParams.get('state');
      const nonce = url.searchParams.get('nonce');
      const challenge = url.searchParams.get('code_challenge');
      const method = url.searchParams.get('code_challenge_method');
      if (clientId !== this.clientId || !redirectUri || !state || !nonce || !challenge || method !== 'S256') {
        this.sendJson(res, 400, { error: 'invalid_request' });
        return;
      }
      const code = `code-${this.codes.size}-${Date.now()}`;
      this.codes.set(code, { challenge, nonce, redirectUri });
      const back = new URL(redirectUri);
      back.searchParams.set('code', code);
      back.searchParams.set('state', state);
      res.writeHead(302, { Location: back.toString() });
      res.end();
      return;
    }
    if (req.method === 'POST' && url.pathname === '/token') {
      const raw = await readBody(req);
      const form = new URLSearchParams(raw);
      const auth = parseBasic(req.headers.authorization || '');
      if (!auth || auth.id !== this.clientId || auth.secret !== this.clientSecret) {
        this.sendJson(res, 401, { error: 'invalid_client' });
        return;
      }
      const code = form.get('code') || '';
      const record = this.codes.get(code);
      if (!record) {
        this.sendJson(res, 400, { error: 'invalid_grant' });
        return;
      }
      this.codes.delete(code);
      const verifier = form.get('code_verifier') || '';
      const expected = createHash('sha256').update(verifier).digest('base64url');
      if (expected !== record.challenge || form.get('redirect_uri') !== record.redirectUri) {
        this.sendJson(res, 400, { error: 'invalid_grant' });
        return;
      }
      const idToken = await this.signIdToken(record.nonce);
      this.sendJson(res, 200, { id_token: idToken, token_type: 'Bearer', expires_in: 3600 });
      return;
    }
    this.sendJson(res, 404, { error: 'not_found' });
  }

  private async signIdToken(nonce: string): Promise<string> {
    if (!this.privateKey) throw new Error('Mock issuer is not started');
    const claims: Record<string, unknown> = { name: this.claims.name || 'Person Example' };
    if (this.claims.includeEmail && this.claims.email !== undefined) claims.email = this.claims.email;
    if (this.claims.includeEmailVerified && this.claims.email_verified !== undefined) {
      claims.email_verified = this.claims.email_verified;
    }
    if (this.claims.includeHd && this.claims.hd !== undefined) claims.hd = this.claims.hd;
    if (!this.omitNonce) claims.nonce = this.nonceOverride ?? nonce;
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: 'mock-key' })
      .setIssuer(this.tokenIssuerOverride || this.issuer)
      .setSubject(this.claims.sub)
      .setAudience(this.tokenAudienceOverride || this.clientId)
      .setIssuedAt()
      .setExpirationTime('10m')
      .sign(this.privateKey);
  }

  private sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  }
}

function parseBasic(header: string): { id: string; secret: string } | null {
  if (!header.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx < 0) return null;
  return {
    id: decodeURIComponent(decoded.slice(0, idx)),
    secret: decodeURIComponent(decoded.slice(idx + 1)),
  };
}

async function readBody(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}
