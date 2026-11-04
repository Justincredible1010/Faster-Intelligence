import assert from 'node:assert/strict';
import { it } from 'node:test';
import { loadAuthConfig } from '../src/server/auth/config';

const base = {
  NODE_ENV: 'development', AUTH_PREVIEW_ALLOWED_EMAIL: 'a@springernature.com',
  AUTH_PREVIEW_PASSCODE: 'preview-passcode-1234', AUTH_PROVIDER: 'magic_link',
} as NodeJS.ProcessEnv;

it('derives a stable preview session secret for case/whitespace variants of AUTH_PREVIEW_BYPASS', () => {
  const ref = loadAuthConfig({ ...base, AUTH_PREVIEW_BYPASS: 'true' }).sessionSecret;
  for (const v of ['True', ' TRUE ', 'true\n']) {
    assert.equal(loadAuthConfig({ ...base, AUTH_PREVIEW_BYPASS: v }).sessionSecret, ref);
  }
  assert.notEqual(loadAuthConfig({ ...base, AUTH_PREVIEW_BYPASS: 'false' }).sessionSecret, ref);
});
