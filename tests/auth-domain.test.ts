import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertProductionAuthConfig, isDevBypassEnabled } from '../src/server/auth/config';
import { isEmailDomainAllowed, isHostAllowed, normalizeEmail, parseEmailAddress } from '../src/server/auth/domain';

const APEX = ['springernature.com'];

describe('email domain allowlist', () => {
  it('accepts the apex case-insensitively and lowercases the address', () => {
    assert.equal(isEmailDomainAllowed('person@springernature.com', APEX), true);
    assert.equal(isEmailDomainAllowed('Person@SpringerNature.COM', APEX), true);
    assert.equal(normalizeEmail('Person+Desk@SpringerNature.COM'), 'person+desk@springernature.com');
  });

  it('rejects lookalikes, suffix tricks, and extra labels', () => {
    const rejected = [
      'person@springernature.com.evil.com',
      'person@evil.springernature.com',
      'person@notspringernature.com',
      'person@springernature.co',
      'person@springernature.com.',
      'person@.springernature.com',
      'person@springernature.com.springernature.com',
      'person@springernature.com@evil.com',
      'springernature.com',
      'person@@springernature.com',
      ' person@springernature.com',
      'person@springernature.com ',
      'person@spr\u0131ngernature.com',
      '',
      null,
      undefined,
    ];
    for (const email of rejected) {
      assert.equal(isEmailDomainAllowed(email, APEX), false, `expected reject: ${String(email)}`);
    }
    assert.equal(parseEmailAddress('person@springernature.com.evil.com')?.domain, 'springernature.com.evil.com');
    assert.equal(isHostAllowed('springernature.com.evil.com', APEX), false);
    assert.equal(isHostAllowed('SpringerNature.COM', APEX), true);
  });

  it('allows a subdomain only when that full host is listed and it is under an allowed apex', () => {
    assert.equal(isEmailDomainAllowed('editor@staff.springernature.com', APEX, []), false);
    assert.equal(
      isEmailDomainAllowed('editor@staff.springernature.com', APEX, ['staff.springernature.com']),
      true
    );
    assert.equal(
      isEmailDomainAllowed('editor@other.springernature.com', APEX, ['staff.springernature.com']),
      false
    );
    assert.equal(
      isHostAllowed('springernature.com.evil.com', APEX, ['springernature.com.evil.com']),
      false
    );
    assert.equal(isHostAllowed('notspringernature.com', APEX, ['notspringernature.com']), false);
  });
});

describe('production configuration', () => {
  const secret = 'x'.repeat(32);

  it('requires a real provider, a long session secret, and refuses the console mail transport', () => {
    assert.doesNotThrow(() => assertProductionAuthConfig({ NODE_ENV: 'development' }));
    assert.throws(
      () => assertProductionAuthConfig({ NODE_ENV: 'production', AUTH_SESSION_SECRET: secret }),
      /AUTH_PROVIDER/
    );
    assert.throws(
      () =>
        assertProductionAuthConfig({
          NODE_ENV: 'production',
          AUTH_PROVIDER: 'google',
          AUTH_SESSION_SECRET: 'too-short',
          APP_URL: 'https://mcge.example',
          GOOGLE_CLIENT_ID: 'id',
          GOOGLE_CLIENT_SECRET: 'secret',
        }),
      /AUTH_SESSION_SECRET/
    );
    assert.throws(
      () =>
        assertProductionAuthConfig({
          NODE_ENV: 'production',
          AUTH_PROVIDER: 'magic_link',
          AUTH_SESSION_SECRET: secret,
          APP_URL: 'https://mcge.example',
          AUTH_EMAIL_TRANSPORT: 'console',
        }),
      /console cannot be used in production/
    );
    assert.throws(
      () =>
        assertProductionAuthConfig({
          NODE_ENV: 'production',
          AUTH_PROVIDER: 'oidc',
          AUTH_SESSION_SECRET: secret,
          APP_URL: 'http://mcge.example',
          OIDC_ISSUER: 'https://login.example/realms/sn',
          OIDC_CLIENT_ID: 'id',
          OIDC_CLIENT_SECRET: 'secret',
        }),
      /https/
    );
  });
});

describe('development bypass flag', () => {
  it('is on only for NODE_ENV=development and AUTH_DEV_BYPASS=true', () => {
    assert.equal(isDevBypassEnabled({ NODE_ENV: 'development', AUTH_DEV_BYPASS: 'true' }), true);
    assert.equal(isDevBypassEnabled({ NODE_ENV: 'production', AUTH_DEV_BYPASS: 'true' }), false);
    assert.equal(isDevBypassEnabled({ NODE_ENV: 'test', AUTH_DEV_BYPASS: 'true' }), false);
    assert.equal(isDevBypassEnabled({ NODE_ENV: 'development', AUTH_DEV_BYPASS: '1' }), false);
    assert.equal(isDevBypassEnabled({ NODE_ENV: 'development', AUTH_DEV_BYPASS: 'TRUE' }), false);
    assert.equal(isDevBypassEnabled({ NODE_ENV: 'development' }), false);
    assert.equal(isDevBypassEnabled({ AUTH_DEV_BYPASS: 'true' }), false);
  });
});
