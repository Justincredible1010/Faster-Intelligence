/**
 * Exact email-domain allowlisting for Springer Nature sign-in.
 *
 * A domain is allowed only when it is an exact match for an allowed apex
 * (case-insensitive) or an explicitly listed subdomain of one of those apexes.
 * Suffix checks are not used, so lookalikes and extra labels fail closed.
 */

const HOST_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export interface ParsedEmail {
  local: string;
  domain: string;
}

export function isValidHost(host: string): boolean {
  if (!host || host.length > 253) return false;
  if (host.includes('@') || host.includes(' ') || host.includes('..')) return false;
  if (host.startsWith('.') || host.endsWith('.')) return false;
  const labels = host.split('.');
  if (labels.length < 2) return false;
  return labels.every((label) => HOST_LABEL.test(label));
}

export function parseEmailAddress(raw: unknown): ParsedEmail | null {
  if (typeof raw !== 'string') return null;
  if (raw !== raw.trim()) return null;
  const email = raw;
  if (email.length < 3 || email.length > 320) return null;
  // ASCII only. Rejects homoglyphs, whitespace, and control characters.
  if (!/^[\x21-\x7e]+$/.test(email)) return null;
  const at = email.indexOf('@');
  if (at <= 0 || at !== email.lastIndexOf('@')) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  if (!isValidHost(domain)) return null;
  return { local, domain };
}

export function normalizeEmail(raw: string): string | null {
  const parsed = parseEmailAddress(raw);
  if (!parsed) return null;
  return `${parsed.local.toLowerCase()}@${parsed.domain}`;
}

function hostLabels(host: string): string[] {
  return host.toLowerCase().split('.');
}

/** True when `host` has at least one extra label in front of an allowed apex. */
export function isSubdomainOfAllowedApex(host: string, allowedDomains: readonly string[]): boolean {
  if (!isValidHost(host)) return false;
  const hostParts = hostLabels(host);
  return allowedDomains.some((apex) => {
    if (!isValidHost(apex)) return false;
    const apexParts = hostLabels(apex);
    if (hostParts.length <= apexParts.length) return false;
    return apexParts.every((label, index) => hostParts[hostParts.length - apexParts.length + index] === label);
  });
}

function normalizeHostList(hosts: readonly string[]): string[] {
  return hosts.map((host) => host.trim().toLowerCase()).filter((host) => host.length > 0 && isValidHost(host));
}

/**
 * Exact domain match, or an explicitly listed subdomain of an allowed apex.
 * `staff.springernature.com` is rejected unless that full host is listed.
 * `springernature.com.evil.com` is rejected even if someone lists it, because
 * it is not a subdomain of an allowed apex.
 */
export function isHostAllowed(
  host: string,
  allowedDomains: readonly string[],
  allowedSubdomains: readonly string[] = []
): boolean {
  if (typeof host !== 'string' || !isValidHost(host)) return false;
  const normalized = host.trim().toLowerCase();
  const domains = normalizeHostList(allowedDomains);
  const subdomains = normalizeHostList(allowedSubdomains);
  if (domains.includes(normalized)) return true;
  if (!subdomains.includes(normalized)) return false;
  return isSubdomainOfAllowedApex(normalized, domains);
}

export function isEmailDomainAllowed(
  email: unknown,
  allowedDomains: readonly string[],
  allowedSubdomains: readonly string[] = []
): boolean {
  const parsed = parseEmailAddress(email);
  if (!parsed) return false;
  return isHostAllowed(parsed.domain, allowedDomains, allowedSubdomains);
}
