/**
 * Springer Nature hosts a journal page may be fetched from.
 * The browser suggestion field and the server fetch use this same list.
 */
export const ALLOWED_DOMAIN_SUFFIXES = [
  'nature.com',
  'springer.com',
  'biomedcentral.com',
  'springernature.com',
] as const;

export const SPRINGER_NATURE_HOST_WARNING =
  'Only Springer Nature journal hosts are allowed (nature.com, springer.com, biomedcentral.com, springernature.com, and their subdomains).';

function isIpLiteral(host: string): boolean {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(':');
}

export function isAllowedSpringerNatureHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return false;
  }
  if (isIpLiteral(host) || !/[a-z]/i.test(host)) return false;
  return ALLOWED_DOMAIN_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** Why this URL must not be fetched. Null means the host, scheme, and port are allowed. */
export function journalUrlFetchBlockReason(raw: string): string | null {
  let cleaned = (raw || '').trim();
  if (!cleaned) return 'A journal URL is required.';
  if (!/^[a-z][a-z0-9+.-]*:/i.test(cleaned)) cleaned = `https://${cleaned}`;

  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    return 'The journal URL is not valid.';
  }

  if (url.username || url.password) return 'Journal URLs must not include credentials.';
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return 'Only http and https journal URLs can be read.';
  if (url.port && url.port !== '80' && url.port !== '443') return 'Only ports 80 and 443 are allowed.';
  if (!isAllowedSpringerNatureHost(url.hostname)) return SPRINGER_NATURE_HOST_WARNING;
  return null;
}
