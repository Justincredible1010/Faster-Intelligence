export const AUTH_ERROR_CODES = [
  'email_domain',
  'email_unverified',
  'email_missing',
  'hd_rejected',
  'invalid_state',
  'invalid_nonce',
  'access_denied',
  'provider_error',
  'not_configured',
  'expired',
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export class AuthFlowError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message?: string) {
    super(message || code);
    this.code = code;
    this.name = 'AuthFlowError';
  }
}

export function safeAuthError(value: unknown): AuthErrorCode {
  if (value instanceof AuthFlowError) return value.code;
  return 'provider_error';
}

export function mapIdentityProviderError(value: unknown): AuthErrorCode {
  const text = typeof value === 'string' ? value : '';
  if (text === 'access_denied' || text === 'interaction_required' || text === 'login_required') {
    return 'access_denied';
  }
  return 'provider_error';
}
