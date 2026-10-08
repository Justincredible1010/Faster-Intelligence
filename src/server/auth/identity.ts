import type { JWTPayload } from 'jose';
import type { AuthConfig } from './config';
import { isEmailDomainAllowed, isHostAllowed, normalizeEmail } from './domain';
import { AuthFlowError } from './errors';
import type { AuthUser } from './session';

export function evaluateIdentity(
  payload: JWTPayload,
  config: AuthConfig,
  provider: 'google' | 'oidc'
): AuthUser {
  if (typeof payload.sub !== 'string' || !payload.sub) {
    throw new AuthFlowError('provider_error', 'ID token is missing sub');
  }
  if (typeof payload.email !== 'string' || !payload.email.trim()) {
    throw new AuthFlowError('email_missing');
  }
  const verified = payload.email_verified === true || payload.email_verified === 'true';
  if (!verified) throw new AuthFlowError('email_unverified');
  if (!isEmailDomainAllowed(payload.email, config.allowedDomains, config.allowedSubdomains)) {
    throw new AuthFlowError('email_domain');
  }
  let hd: string | undefined;
  if (payload.hd !== undefined && payload.hd !== null && payload.hd !== '') {
    if (typeof payload.hd !== 'string' || !payload.hd.trim()) {
      throw new AuthFlowError('hd_rejected');
    }
    hd = payload.hd.trim();
    if (!isHostAllowed(hd, config.allowedDomains, config.allowedSubdomains)) {
      throw new AuthFlowError('hd_rejected');
    }
    hd = hd.toLowerCase();
  }
  const email = normalizeEmail(payload.email);
  if (!email) throw new AuthFlowError('email_domain');
  const name = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : undefined;
  return {
    sub: payload.sub,
    email,
    name,
    emailVerified: true,
    provider,
    hd,
  };
}
