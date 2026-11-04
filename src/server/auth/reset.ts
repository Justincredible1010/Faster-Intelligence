import { resetAuditLogForTests } from '../auditLog';
import { clearDevOutbox } from './email';
import { clearMagicLinks } from './magicLink';
import { clearOidcCache } from './oidc';
import { clearPasscodeFailures } from './routes';
import { clearAllSessions } from './session';

export function resetAuthForTests(): void {
  clearAllSessions();
  clearMagicLinks();
  clearPasscodeFailures();
  clearDevOutbox();
  clearOidcCache();
  resetAuditLogForTests();
}
