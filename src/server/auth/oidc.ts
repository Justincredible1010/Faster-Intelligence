import { createHash } from 'crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { AuthFlowError } from './errors';
import { randomToken } from './session';

export interface OidcClientSettings {
  issuer: string;
  clientId: string;
  clientSecret: string;
  scopes: string;
  redirectUri: string;
}

interface DiscoveryDocument {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

interface CachedDiscovery {
  document: DiscoveryDocument;
  jwks: ReturnType<typeof createRemoteJWKSet>;
}

const discoveryCache = new Map<string, CachedDiscovery>();

export function clearOidcCache(): void {
  discoveryCache.clear();
}

export function normalizeIssuer(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function asDiscovery(value: unknown): DiscoveryDocument {
  if (!value || typeof value !== 'object') {
    throw new AuthFlowError('provider_error', 'OIDC discovery document was not an object');
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.issuer !== 'string' ||
    typeof record.authorization_endpoint !== 'string' ||
    typeof record.token_endpoint !== 'string' ||
    typeof record.jwks_uri !== 'string'
  ) {
    throw new AuthFlowError('provider_error', 'OIDC discovery document is missing required endpoints');
  }
  return {
    issuer: record.issuer,
    authorization_endpoint: record.authorization_endpoint,
    token_endpoint: record.token_endpoint,
    jwks_uri: record.jwks_uri,
  };
}

export async function discover(issuer: string): Promise<CachedDiscovery> {
  const normalized = normalizeIssuer(issuer);
  if (process.env.NODE_ENV === 'production' && !normalized.startsWith('https://')) {
    throw new AuthFlowError('not_configured', 'OIDC issuer must use https in production');
  }
  const cached = discoveryCache.get(normalized);
  if (cached) return cached;
  const response = await fetch(`${normalized}/.well-known/openid-configuration`, {
    signal: AbortSignal.timeout(10000),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new AuthFlowError('provider_error', `OIDC discovery failed with HTTP ${response.status}`);
  }
  const document = asDiscovery(await response.json());
  if (normalizeIssuer(document.issuer) !== normalized) {
    throw new AuthFlowError('provider_error', 'OIDC discovery issuer does not match the configured issuer');
  }
  const entry: CachedDiscovery = {
    document,
    jwks: createRemoteJWKSet(new URL(document.jwks_uri)),
  };
  discoveryCache.set(normalized, entry);
  return entry;
}

export function createOauthTransaction(redirectUri: string) {
  const codeVerifier = randomToken(32);
  return {
    state: randomToken(24),
    nonce: randomToken(24),
    codeVerifier,
    redirectUri,
    createdAt: Date.now(),
  };
}

export async function buildAuthorizationUrl(
  settings: OidcClientSettings,
  transaction: { state: string; nonce: string; codeVerifier: string },
  extraParams?: Record<string, string>
): Promise<URL> {
  const { document } = await discover(settings.issuer);
  const url = new URL(document.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', settings.clientId);
  url.searchParams.set('redirect_uri', settings.redirectUri);
  url.searchParams.set('scope', settings.scopes);
  url.searchParams.set('state', transaction.state);
  url.searchParams.set('nonce', transaction.nonce);
  url.searchParams.set('code_challenge', pkceChallenge(transaction.codeVerifier));
  url.searchParams.set('code_challenge_method', 'S256');
  if (extraParams) {
    for (const [key, value] of Object.entries(extraParams)) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function basicAuth(clientId: string, clientSecret: string): string {
  const encodedId = encodeURIComponent(clientId);
  const encodedSecret = encodeURIComponent(clientSecret);
  return `Basic ${Buffer.from(`${encodedId}:${encodedSecret}`).toString('base64')}`;
}

export async function exchangeAuthorizationCode(
  settings: OidcClientSettings,
  transaction: { codeVerifier: string; redirectUri: string; nonce: string },
  code: string
): Promise<JWTPayload> {
  const { document, jwks } = await discover(settings.issuer);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: transaction.redirectUri,
    code_verifier: transaction.codeVerifier,
  });
  const response = await fetch(document.token_endpoint, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(settings.clientId, settings.clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
    signal: AbortSignal.timeout(10000),
  });
  const payload = (await response.json().catch(() => null)) as { id_token?: unknown; error?: unknown } | null;
  if (!response.ok || !payload || typeof payload.id_token !== 'string') {
    throw new AuthFlowError('provider_error', 'OIDC token endpoint did not return an ID token');
  }
  let verified: JWTPayload;
  try {
    const result = await jwtVerify(payload.id_token, jwks, {
      issuer: document.issuer,
      audience: settings.clientId,
      clockTolerance: 5,
    });
    verified = result.payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'ID token verification failed';
    throw new AuthFlowError('provider_error', message);
  }
  if (typeof verified.nonce !== 'string' || verified.nonce !== transaction.nonce) {
    throw new AuthFlowError('invalid_nonce');
  }
  return verified;
}
