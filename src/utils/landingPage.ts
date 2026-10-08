import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import type { ExtractedFactField, ExtractedPageFacts, FactVerificationStatus, MetricProvenanceSource, PageSourcedMetric } from '../types';
import { normalizeJournalUrl } from './journalUrl';

/**
 * Journal landing pages are fetched only from Springer Nature hosts.
 * Other hosts, IP literals, and redirects off this list are refused so a
 * marketer-supplied URL cannot be used to reach internal services.
 */
export const ALLOWED_DOMAIN_SUFFIXES = [
  'nature.com',
  'springer.com',
  'biomedcentral.com',
  'springernature.com',
] as const;

export const FETCH_TIMEOUT_MS = 8_000;
export const MAX_HTML_BYTES = 1_500_000;
/** Nature and Springer send browsers through an idp cookie dance (about four hops) before the journal HTML. */
export const MAX_REDIRECTS = 5;

const USER_AGENT = 'MarketingContentBot/1.0 (+https://www.springernature.com)';

const PUBLISHER_HOME_HOSTS = new Set([
  'springer.com',
  'www.springer.com',
  'link.springer.com',
  'biomedcentral.com',
  'www.biomedcentral.com',
  'springernature.com',
  'www.springernature.com',
]);

export class LandingPageError extends Error {
  code: 'ssrf' | 'timeout' | 'size' | 'http';

  constructor(message: string, code: LandingPageError['code']) {
    super(message);
    this.name = 'LandingPageError';
    this.code = code;
  }
}

export interface FetchedLandingPage {
  html: string;
  finalUrl: string;
}

export interface HttpExchange {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export interface FetchLandingPageDeps {
  /** Test double. Production connects to each vetted public address with the original Host / SNI. */
  httpGet?: (url: URL, timeoutMs: number, pinnedIp?: string, signal?: AbortSignal) => Promise<HttpExchange>;
  /** Test double. Production uses DNS and refuses private or reserved answers. */
  resolveHost?: (hostname: string, signal?: AbortSignal) => Promise<string[]>;
  /** Hard deadline for the whole fetch, including redirects. Defaults to FETCH_TIMEOUT_MS. */
  timeoutMs?: number;
}

export interface MergeableJournalFacts {
  journalName: string;
  publisher: string;
  impactFactor: number | null;
  fiveYearImpactFactor?: number | null;
  firstDecisionDays?: number | null;
  openAccessType?: string | null;
  apcUsd?: number | null;
  aimsAndScopeSummary?: string;
  verificationStatus: FactVerificationStatus;
  provenanceSource?: MetricProvenanceSource;
  isVerifiedClarivate?: boolean;
  reportingYear?: string;
  sourceAttribution: string;
  missingFields?: string[];
  submissionPortalUrl?: string | null;
  authorGuidelinesUrl?: string | null;
  extractedFacts?: ExtractedPageFacts;
  provenanceMap?: Record<string, { source: string; confidence: number; year?: number; note?: string }>;
}

type Provenance = { source: string; confidence: number; year?: number; note?: string };

export function isAllowedSpringerNatureHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return false;
  }
  if (net.isIP(host) || !/[a-z]/i.test(host)) return false;
  return ALLOWED_DOMAIN_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function isPrivateIpv4(a: number, b: number, c: number): boolean {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;
  return false;
}

/** Eight hextets, expanding "::" and a trailing dotted IPv4. */
function ipv6Hextets(address: string): number[] | null {
  let ip = address.toLowerCase().split('%')[0];
  if (net.isIP(ip) !== 6) return null;
  const dotted = ip.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    const octets = dotted[2].split('.').map((part) => Number(part));
    if (octets.some((octet) => octet > 255)) return null;
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    ip = `${dotted[1]}${hi}:${lo}`;
  }
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const parseSide = (side: string) => (side ? side.split(':').map((part) => parseInt(part, 16)) : []);
  const head = parseSide(halves[0]);
  const tail = halves.length === 2 ? parseSide(halves[1]) : [];
  if ([...head, ...tail].some((part) => Number.isNaN(part) || part > 0xffff)) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  return [...head, ...Array(missing).fill(0), ...tail];
}

export function isPrivateOrReservedIp(address: string): boolean {
  let ip = address.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) ip = mapped[1];

  if (net.isIP(ip) === 4) {
    const [a, b, c] = ip.split('.').map((part) => Number(part));
    return isPrivateIpv4(a, b, c);
  }

  if (net.isIP(ip) === 6) {
    if (ip === '::' || ip === '::1') return true;
    const head = ip.split(':')[0] || '';
    if (/^fc|^fd/.test(head)) return true;
    if (/^fe[89ab]/.test(head)) return true;
    if (/^ff/.test(head)) return true;

    const hextets = ipv6Hextets(ip);
    if (!hextets) return true;
    // IPv4-mapped IPv6, including the hex form ::ffff:7f00:1.
    if (hextets.slice(0, 5).every((part) => part === 0) && hextets[5] === 0xffff) {
      return isPrivateIpv4(hextets[6] >> 8, hextets[6] & 0xff, hextets[7] >> 8);
    }
    // NAT64 well-known prefix 64:ff9b::/96 and 6to4 2002::/16.
    if (hextets[0] === 0x64 && hextets[1] === 0xff9b && hextets.slice(2, 6).every((part) => part === 0)) return true;
    if (hextets[0] === 0x2002) return true;
    return false;
  }

  return true;
}

/** IPv4 first so an IPv6-first DNS answer is not the only attempt. */
export function preferIpv4(addresses: string[]): string[] {
  return [...addresses].sort((left, right) => {
    const leftV4 = net.isIP(left) === 4;
    const rightV4 = net.isIP(right) === 4;
    if (leftV4 === rightV4) return 0;
    return leftV4 ? -1 : 1;
  });
}

export function parseAllowedJournalUrl(raw: string): URL {
  let cleaned = (raw || '').trim();
  if (!cleaned) throw new LandingPageError('A journal URL is required.', 'ssrf');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(cleaned)) cleaned = `https://${cleaned}`;

  let url: URL;
  try {
    url = new URL(cleaned);
  } catch {
    throw new LandingPageError('The journal URL is not valid.', 'ssrf');
  }

  if (url.username || url.password) {
    throw new LandingPageError('Journal URLs must not include credentials.', 'ssrf');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new LandingPageError('Only http and https journal URLs can be read.', 'ssrf');
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new LandingPageError('Only ports 80 and 443 are allowed.', 'ssrf');
  }
  if (!isAllowedSpringerNatureHost(url.hostname)) {
    throw new LandingPageError(
      'Only Springer Nature journal hosts are allowed (nature.com, springer.com, biomedcentral.com, springernature.com, and their subdomains).',
      'ssrf'
    );
  }
  return url;
}

/** www.nature.com/ is the Nature flagship journal, not a publisher portal. */
export function isNatureFlagshipHome(rawUrl: string): boolean {
  try {
    const url = parseAllowedJournalUrl(rawUrl);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return (host === 'nature.com' || host === 'www.nature.com') && path === '/';
  } catch {
    return false;
  }
}

/**
 * Publisher sites with no journal path are not journals.
 * www.nature.com/ is excluded because that URL is the Nature journal homepage.
 */
export function isPublisherHomepage(rawUrl: string): boolean {
  try {
    const url = parseAllowedJournalUrl(rawUrl);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path !== '/') return false;
    if (isNatureFlagshipHome(url.toString())) return false;
    return PUBLISHER_HOME_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function normalizeIssn(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.toUpperCase().match(/\b(\d{4}-\d{3}[\dX])\b/);
  return match ? match[1] : null;
}

/**
 * Cache identity is the print ISSN when the page states one, otherwise the
 * electronic ISSN, otherwise the canonical URL without a query string.
 * The last path segment is intentionally not used.
 */
export function journalCacheKey(input: {
  issnPrint?: string | null;
  issnElectronic?: string | null;
  canonicalUrl?: string | null;
  requestUrl?: string | null;
}): string {
  const print = normalizeIssn(input.issnPrint);
  const electronic = normalizeIssn(input.issnElectronic);
  if (print) return `issn:${print}`;
  if (electronic) return `issn:${electronic}`;

  const norm = normalizeJournalUrl(input.canonicalUrl || input.requestUrl);
  if (!norm.canonical) return 'url:unknown';
  return `url:${norm.hostKey}${norm.pathname}`;
}

export function normalizedRequestUrl(raw: string): string {
  return normalizeJournalUrl(raw).canonical;
}

async function defaultResolveHost(hostname: string, signal?: AbortSignal): Promise<string[]> {
  if (signal?.aborted) throw new LandingPageError('Landing page request timed out.', 'timeout');
  try {
    const records = await dnsLookup(hostname, { all: true, verbatim: false });
    if (signal?.aborted) throw new LandingPageError('Landing page request timed out.', 'timeout');
    return preferIpv4(records.map((record) => record.address));
  } catch (err) {
    if (err instanceof LandingPageError) throw err;
    if (signal?.aborted) throw new LandingPageError('Landing page request timed out.', 'timeout');
    throw new LandingPageError(`Could not resolve ${hostname}.`, 'http');
  }
}

async function assertPublicResolution(
  hostname: string,
  resolveHost: ((hostname: string, signal?: AbortSignal) => Promise<string[]>) | undefined,
  signal: AbortSignal
): Promise<string[]> {
  const addresses = await (resolveHost ?? defaultResolveHost)(hostname, signal);
  if (!addresses.length) {
    throw new LandingPageError(`Could not resolve ${hostname}.`, 'http');
  }
  if (addresses.some((address) => isPrivateOrReservedIp(address))) {
    throw new LandingPageError('Refusing to fetch a host that resolves to a private or reserved address.', 'ssrf');
  }
  return preferIpv4(addresses);
}

function headerValue(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const direct = headers[name.toLowerCase()] ?? headers[name];
  if (Array.isArray(direct)) return direct[0];
  return direct;
}

function nodeHttpGet(url: URL, pinnedIp: string, timeoutMs: number, signal: AbortSignal): Promise<HttpExchange> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const succeed = (value: HttpExchange) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
    if (port !== 80 && port !== 443) {
      fail(new LandingPageError('Only ports 80 and 443 are allowed.', 'ssrf'));
      return;
    }
    if (signal.aborted) {
      fail(new LandingPageError('Landing page request timed out.', 'timeout'));
      return;
    }

    const lib = url.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        host: pinnedIp,
        servername: url.hostname,
        port,
        method: 'GET',
        path: `${url.pathname || '/'}${url.search}`,
        headers: {
          Host: url.host,
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml;q=0.9',
          'Accept-Language': 'en',
        },
        timeout: timeoutMs,
        signal,
      },
      (res) => {
        const status = res.statusCode || 0;
        const headers: Record<string, string | string[] | undefined> = {};
        for (const [key, value] of Object.entries(res.headers)) headers[key.toLowerCase()] = value;

        if (status >= 300 && status < 400) {
          res.resume();
          succeed({ status, headers, body: '' });
          return;
        }

        const contentLength = Number(headerValue(headers, 'content-length') || 0);
        if (contentLength > MAX_HTML_BYTES) {
          res.resume();
          fail(new LandingPageError('Landing page exceeded the size limit.', 'size'));
          return;
        }

        const chunks: Buffer[] = [];
        let received = 0;
        res.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_HTML_BYTES) {
            req.destroy();
            fail(new LandingPageError('Landing page exceeded the size limit.', 'size'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => succeed({ status, headers, body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', (err) => fail(err));
      }
    );

    signal.addEventListener(
      'abort',
      () => {
        req.destroy();
        fail(new LandingPageError('Landing page request timed out.', 'timeout'));
      },
      { once: true }
    );
    req.on('timeout', () => {
      req.destroy();
      fail(new LandingPageError('Landing page request timed out.', 'timeout'));
    });
    req.on('error', (err) => {
      if (signal.aborted || err.name === 'AbortError') {
        fail(new LandingPageError('Landing page request timed out.', 'timeout'));
        return;
      }
      if (err instanceof LandingPageError) fail(err);
      else fail(new LandingPageError('Landing page request failed.', 'http'));
    });
    req.end();
  });
}

async function requestVettedAddress(
  url: URL,
  addresses: string[],
  deps: FetchLandingPageDeps,
  signal: AbortSignal
): Promise<HttpExchange> {
  let lastError: Error | null = null;
  for (const address of addresses) {
    if (signal.aborted) throw new LandingPageError('Landing page request timed out.', 'timeout');
    try {
      if (deps.httpGet) return await deps.httpGet(url, FETCH_TIMEOUT_MS, address, signal);
      return await nodeHttpGet(url, address, FETCH_TIMEOUT_MS, signal);
    } catch (err) {
      if (signal.aborted) throw new LandingPageError('Landing page request timed out.', 'timeout');
      if (err instanceof LandingPageError && err.code !== 'timeout' && err.code !== 'http') throw err;
      lastError = err instanceof LandingPageError ? err : new LandingPageError('Landing page request failed.', 'http');
    }
  }
  throw lastError ?? new LandingPageError('Landing page request failed.', 'http');
}

async function readLandingPage(rawUrl: string, deps: FetchLandingPageDeps, signal: AbortSignal): Promise<FetchedLandingPage> {
  let current = parseAllowedJournalUrl(rawUrl);
  const seen = new Set<string>();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (signal.aborted) throw new LandingPageError('Landing page request timed out.', 'timeout');
    current.hash = '';
    const fingerprint = current.toString();
    if (seen.has(fingerprint)) throw new LandingPageError('Landing page redirected to itself.', 'http');
    seen.add(fingerprint);

    const addresses = await assertPublicResolution(current.hostname, deps.resolveHost, signal);
    const response = await requestVettedAddress(current, addresses, deps, signal);

    if (response.status >= 300 && response.status < 400) {
      const location = headerValue(response.headers, 'location');
      if (!location) throw new LandingPageError('Landing page redirect was missing a location.', 'http');
      if (hop === MAX_REDIRECTS) throw new LandingPageError('Landing page redirected too many times.', 'http');
      current = parseAllowedJournalUrl(new URL(location, current).toString());
      continue;
    }

    if (response.status !== 200) {
      throw new LandingPageError(`Landing page returned HTTP ${response.status}.`, 'http');
    }

    const contentType = headerValue(response.headers, 'content-type') || '';
    if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      throw new LandingPageError('Landing page was not HTML.', 'http');
    }
    if (Buffer.byteLength(response.body || '') > MAX_HTML_BYTES) {
      throw new LandingPageError('Landing page exceeded the size limit.', 'size');
    }
    return { html: response.body || '', finalUrl: current.toString() };
  }

  throw new LandingPageError('Landing page redirected too many times.', 'http');
}

export type FetchPageResult = string | { html: string; finalUrl?: string };

export async function fetchLandingPage(
  rawUrl: string,
  deps: FetchLandingPageDeps = {},
  fetchPage?: (url: string) => Promise<FetchPageResult>
): Promise<FetchedLandingPage> {
  if (fetchPage) {
    const provided = await fetchPage(rawUrl);
    if (typeof provided === 'string') return { html: provided, finalUrl: rawUrl };
    return { html: provided.html, finalUrl: provided.finalUrl || rawUrl };
  }
  const timeoutMs = deps.timeoutMs ?? FETCH_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const deadline = new Promise<never>((_, reject) => {
    if (controller.signal.aborted) {
      reject(new LandingPageError('Landing page request timed out.', 'timeout'));
      return;
    }
    controller.signal.addEventListener(
      'abort',
      () => reject(new LandingPageError('Landing page request timed out.', 'timeout')),
      { once: true }
    );
  });
  const work = readLandingPage(rawUrl, deps, controller.signal);
  // The loser of the race can still reject after the winner settles.
  work.catch(() => {});
  deadline.catch(() => {});

  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  hellip: '…',
};

function decodeHtml(value: string): string {
  let out = value.replace(/<[^>]+>/g, ' ');
  for (let pass = 0; pass < 2; pass += 1) {
    out = out
      .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, num: string) => String.fromCodePoint(Number(num)))
      .replace(/&([a-z]+);/gi, (entity, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? entity);
  }
  return out.replace(/\s+/g, ' ').trim();
}

function field<T>(value: T, confidence: number): ExtractedFactField<T> {
  const empty =
    value === null ||
    value === undefined ||
    (typeof value === 'string' && value.length === 0) ||
    (Array.isArray(value) && value.length === 0);
  return {
    value,
    source: 'LandingPage',
    confidence: empty ? 0 : confidence,
    extractedAt: new Date().toISOString(),
    provenanceLabel: empty ? undefined : 'landing_page',
  };
}

function metaContent(html: string, key: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const attr = (name: string) => {
      const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
      return match ? decodeHtml(match[1]) : null;
    };
    const name = (attr('name') || attr('property') || attr('itemprop') || '').toLowerCase();
    if (name === key.toLowerCase()) return attr('content');
  }
  return null;
}

function canonicalHref(html: string): string | null {
  const tags = html.match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    const rel = tag.match(/\brel\s*=\s*["']([^"']+)["']/i);
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (rel && href && rel[1].toLowerCase().split(/\s+/).includes('canonical')) {
      return decodeHtml(href[1]);
    }
  }
  return null;
}

interface Anchor {
  href: string;
  text: string;
}

function anchors(html: string): Anchor[] {
  const found: Anchor[] = [];
  const re = /<a\b([^>]*?)>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const hrefMatch = match[1].match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    found.push({ href: decodeHtml(hrefMatch[1]), text: decodeHtml(match[2]) });
  }
  return found;
}

function absoluteUrl(href: string, pageUrl: string): string | null {
  try {
    const url = new URL(href, pageUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function labelledIssn(html: string, kind: 'online' | 'print'): string | null {
  const re = /itemprop=["']issn["']>\s*(\d{4}-\d{3}[\dXx])\s*<\/span>\s*\((online|print)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    if (match[2].toLowerCase() === kind) return normalizeIssn(match[1]);
  }
  return null;
}

function springerIssn(html: string, testId: 'springer-electronic-issn' | 'springer-print-issn'): string | null {
  const re = new RegExp(`data-test=["']${testId}["'][\\s\\S]{0,500}?<dd\\b[^>]*>\\s*([^<]+)`, 'i');
  const match = html.match(re);
  return match ? normalizeIssn(decodeHtml(match[1])) : null;
}

function dataTestValue(html: string, testId: string): string | null {
  const re = new RegExp(`data-test=["']${testId}["'][^>]*>\\s*(?:<span\\b[^>]*>)?\\s*([^<]+)`, 'i');
  const match = html.match(re);
  return match ? decodeHtml(match[1]) : null;
}

function parseMetricNumber(text: string | null): { value: number; year: number | null } | null {
  if (!text) return null;
  const match = text.match(/(\d+(?:\.\d+)?)(?:\s*\((\d{4})\))?/);
  if (!match) return null;
  return { value: Number(match[1]), year: match[2] ? Number(match[2]) : null };
}

function jsonLdPeriodical(html: string): { name?: string; description?: string; publisher?: string } | null {
  const scripts = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
  for (const script of scripts) {
    const body = script.replace(/^[\s\S]*?>/, '').replace(/<\/script>$/i, '');
    if (!/"@type"\s*:\s*"Periodical"/i.test(body)) continue;
    try {
      const parsed = JSON.parse(body);
      const publisher = parsed.publisher?.name;
      return {
        name: typeof parsed.name === 'string' ? decodeHtml(parsed.name) : undefined,
        description: typeof parsed.description === 'string' ? decodeHtml(parsed.description) : undefined,
        publisher: typeof publisher === 'string' ? decodeHtml(publisher) : undefined,
      };
    } catch {
      return null;
    }
  }
  return null;
}

function cleanDocumentTitle(title: string): string | null {
  const parts = title
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean);
  const siteNames = new Set(['home', 'springer nature link', 'springerlink', 'nature portfolio']);
  const filtered = parts.filter((part, index) => {
    const key = part.toLowerCase();
    if (key === 'home') return false;
    if (index > 0 && siteNames.has(key)) return false;
    if (index === parts.length - 1 && siteNames.has(key)) return false;
    return true;
  });
  if (filtered.length === 0) return null;
  const first = filtered[0];
  if (filtered.length > 1 && /journal information|open access|aims|editors|fees|funding|about/i.test(first)) {
    return filtered[filtered.length - 1];
  }
  return first;
}

function chooseAims(html: string, jsonLd: { description?: string } | null): string | null {
  const promo = html.match(/data-test=["']darwin-journal-homepage-promo-text["'][^>]*>([\s\S]*?)<\/div>/i);
  if (promo) {
    const text = decodeHtml(promo[1]);
    if (text.length > 40) return text;
  }
  if (jsonLd?.description && jsonLd.description.length > 40 && !/^journal information$/i.test(jsonLd.description)) {
    return jsonLd.description;
  }

  const candidates = [metaContent(html, 'og:description'), metaContent(html, 'description')].filter(
    (value): value is string => Boolean(value && value.length > 40 && !/^journal information$/i.test(value))
  );
  const withoutMetrics = candidates.filter((value) => !/impact factor/i.test(value));
  const pool = withoutMetrics.length > 0 ? withoutMetrics : candidates;
  if (pool.length === 0) return null;
  return pool.sort((a, b) => b.length - a.length)[0].replace(/\s*\.\.\.$/, '').trim();
}

function submissionPortal(pageAnchors: Anchor[], pageUrl: string): string | null {
  const portal = pageAnchors.find((anchor) =>
    /mts-[a-z0-9-]+\.nature\.com|submission\.springernature\.com|editorialmanager\.com/i.test(anchor.href)
  );
  if (portal) return absoluteUrl(portal.href, pageUrl);
  const labelled = pageAnchors.find((anchor) => /submit (your )?manuscript/i.test(anchor.text));
  return labelled ? absoluteUrl(labelled.href, pageUrl) : null;
}

function authorGuidelines(pageAnchors: Anchor[], pageUrl: string): string | null {
  const labelled = pageAnchors.find(
    (anchor) =>
      /for authors|author guidelines|submission guidelines/i.test(anchor.text) ||
      /for-authors|submission-guidelines|author-guidelines/i.test(anchor.href)
  );
  return labelled ? absoluteUrl(labelled.href, pageUrl) : null;
}

const ARTICLE_TYPE_SLUGS = new Set([
  'research-articles',
  'reviews-and-analysis',
  'news-and-comment',
  'letters',
  'articles',
  'correspondence',
  'resources',
  'perspectives',
  'comments',
  'reviews',
]);

function articleTypes(pageAnchors: Anchor[], html: string): string[] {
  const labels: string[] = [];
  for (const anchor of pageAnchors) {
    try {
      const path = new URL(anchor.href, 'https://www.nature.com').pathname.replace(/\/+$/, '');
      const slug = path.split('/').filter(Boolean).pop() || '';
      if (!ARTICLE_TYPE_SLUGS.has(slug)) continue;
      if (/^\/subjects\//.test(path)) continue;
      if (anchor.text && !labels.includes(anchor.text)) labels.push(anchor.text);
    } catch {
      continue;
    }
  }
  const prose = html.match(/article types that includes?\s+([^.<]+)/i);
  if (prose) {
    const extra = decodeHtml(prose[1]);
    if (extra && !labels.includes(extra)) labels.push(extra);
  }
  return labels;
}

function editors(html: string): string | null {
  const block = html.match(
    /<dt>\s*(?:Chief Editor|Editors?[-\s]in[-\s]Chief|Editor[-\s]in[-\s]Chief)\s*<\/dt>[\s\S]{0,700}?<ul\b[^>]*>([\s\S]*?)<\/ul>/i
  );
  if (!block) return null;
  const names = [...block[1].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => decodeHtml(match[1])).filter(Boolean);
  return names.length ? names.join(', ') : null;
}

function openAccess(html: string): string | null {
  const model = html.match(/data-test=["']darwin-publishing-model["'][\s\S]{0,500}?<dd\b[^>]*>([\s\S]*?)<\/dd>/i);
  if (model) {
    const text = decodeHtml(model[1]);
    if (/hybrid/i.test(text)) return 'Hybrid';
    if (/open access/i.test(text)) return 'Gold Open Access';
    if (text) return text;
  }
  const plain = decodeHtml(html);
  if (/fully open access|are open access|gold open access/i.test(plain)) return 'Gold Open Access';
  return null;
}

function visiblePageText(html: string): string {
  const withoutHidden = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  return decodeHtml(withoutHidden);
}

function apcUsd(html: string): number | null {
  const text = visiblePageText(html);
  const cue = /(?:article processing charges?|\bAPCs?\b)/gi;
  let match: RegExpExecArray | null;
  while ((match = cue.exec(text)) !== null) {
    const window = text.slice(match.index, match.index + match[0].length + 160);
    for (const dollar of window.matchAll(/\$\s*([\d,]+(?:\.\d+)?)/g)) {
      const amount = Number(dollar[1].replace(/,/g, ''));
      if (!Number.isFinite(amount) || amount < 100 || amount > 20000) continue;
      const before = window.slice(Math.max(0, (dollar.index ?? 0) - 24), dollar.index ?? 0);
      if (/subscri|donation|membership|shipping|grant|million|billion/i.test(before)) continue;
      return Math.round(amount);
    }
  }
  return null;
}

function apcInfoUrl(pageAnchors: Anchor[], pageUrl: string): string | null {
  const link = pageAnchors.find(
    (anchor) => /article processing charges?/i.test(anchor.text) || /article-processing-charges|open-access/i.test(anchor.href)
  );
  return link ? absoluteUrl(link.href, pageUrl) : null;
}

function pushMetric(metrics: PageSourcedMetric[], metric: PageSourcedMetric) {
  if (metrics.some((item) => item.kind === metric.kind)) return;
  metrics.push(metric);
}

export function extractLandingPageFacts(html: string, pageUrl: string): ExtractedPageFacts {
  const jsonLd = jsonLdPeriodical(html);
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const ogTitle = metaContent(html, 'og:title');
  const documentTitle = titleTag ? cleanDocumentTitle(decodeHtml(titleTag[1])) : null;
  const journalTitle = ogTitle || jsonLd?.name || documentTitle;

  const issnElectronic =
    labelledIssn(html, 'online') ||
    springerIssn(html, 'springer-electronic-issn') ||
    normalizeIssn(metaContent(html, 'prism.issn'));
  const issnPrint = labelledIssn(html, 'print') || springerIssn(html, 'springer-print-issn');

  const pageAnchors = anchors(html);
  const metrics: PageSourcedMetric[] = [];

  const impactText = dataTestValue(html, 'impact-factor-value');
  const impactParsed = parseMetricNumber(impactText);
  if (impactText && impactParsed) {
    pushMetric(metrics, {
      label: 'Journal Impact Factor',
      value: impactText,
      numericValue: impactParsed.value,
      year: impactParsed.year,
      kind: 'impact_factor',
      provenance: 'page-sourced',
    });
  } else {
    const prose = html.match(/2-year impact factor(?:\s+of|:)\s*([\d.]+)\s*\((\d{4})\)/i);
    if (prose) {
      pushMetric(metrics, {
        label: '2-year impact factor',
        value: `${prose[1]} (${prose[2]})`,
        numericValue: Number(prose[1]),
        year: Number(prose[2]),
        kind: 'impact_factor',
        provenance: 'page-sourced',
      });
    } else {
      const meta = metaContent(html, 'description') || '';
      const metaImpact = meta.match(/([\d.]+)\s+Impact Factor/i);
      if (metaImpact) {
        pushMetric(metrics, {
          label: 'Impact Factor',
          value: metaImpact[1],
          numericValue: Number(metaImpact[1]),
          year: null,
          kind: 'impact_factor',
          provenance: 'page-sourced',
        });
      }
    }
  }

  const fiveYearText = dataTestValue(html, 'five-year-impact-factor-value');
  const fiveYearParsed = parseMetricNumber(fiveYearText);
  if (fiveYearText && fiveYearParsed) {
    pushMetric(metrics, {
      label: '5-year Journal Impact Factor',
      value: fiveYearText,
      numericValue: fiveYearParsed.value,
      year: fiveYearParsed.year,
      kind: 'five_year_impact_factor',
      provenance: 'page-sourced',
    });
  } else {
    const prose = html.match(/5-year Journal Impact Factor:\s*([\d.]+)\s*\((\d{4})\)/i);
    if (prose) {
      pushMetric(metrics, {
        label: '5-year Journal Impact Factor',
        value: `${prose[1]} (${prose[2]})`,
        numericValue: Number(prose[1]),
        year: Number(prose[2]),
        kind: 'five_year_impact_factor',
        provenance: 'page-sourced',
      });
    }
  }

  const speedText = dataTestValue(html, 'metrics-speed-value');
  const speedParsed = speedText ? speedText.match(/(\d+)\s+days?/i) : null;
  if (speedText && speedParsed) {
    pushMetric(metrics, {
      label: 'Submission to first decision (median)',
      value: speedText,
      numericValue: Number(speedParsed[1]),
      year: null,
      kind: 'first_decision_days',
      provenance: 'page-sourced',
    });
  } else {
    const withoutMeta = html.replace(/<meta\b[^>]*>/gi, ' ');
    const prose =
      withoutMeta.match(/(\d+)\s+days?(?:\s+\(median\))?\s+from submission to the first editorial decision/i) ||
      withoutMeta.match(/(\d+)\s+days?\s+to first decision/i);
    if (prose) {
      pushMetric(metrics, {
        label: 'First editorial decision',
        value: `${prose[1]} days`,
        numericValue: Number(prose[1]),
        year: null,
        kind: 'first_decision_days',
        provenance: 'page-sourced',
      });
    }
  }

  const downloadsText = dataTestValue(html, 'metrics-downloads-value');
  if (downloadsText) {
    pushMetric(metrics, {
      label: 'Downloads',
      value: downloadsText,
      numericValue: null,
      year: downloadsText.match(/\((\d{4})\)/) ? Number(downloadsText.match(/\((\d{4})\)/)?.[1]) : null,
      kind: 'downloads',
      provenance: 'page-sourced',
    });
  } else {
    const prose = html.match(/article downloads of\s+([\d,]+)\s*\((\d{4})\)/i);
    if (prose) {
      pushMetric(metrics, {
        label: 'Article downloads',
        value: `${prose[1]} (${prose[2]})`,
        numericValue: Number(prose[1].replace(/,/g, '')),
        year: Number(prose[2]),
        kind: 'downloads',
        provenance: 'page-sourced',
      });
    }
  }

  const apc = apcUsd(html);
  if (apc !== null) {
    pushMetric(metrics, {
      label: 'Article processing charge',
      value: `$${apc}`,
      numericValue: apc,
      year: null,
      kind: 'apc',
      provenance: 'page-sourced',
    });
  }

  const canonical = canonicalHref(html);
  const layout: ExtractedPageFacts['layout'] = /data-test=["']darwin-journal|springer-electronic-issn|Electronic ISSN/i.test(html)
    ? 'springer_link'
    : /prism\.issn|itemprop=["']issn["']|nature\.com/i.test(html)
      ? 'nature_portfolio'
      : 'unknown';

  const types = articleTypes(pageAnchors, html);
  const specialIssue = /calls for papers|data-test=["']submission-status["'][^>]*>\s*Open for submissions/i.test(html);
  const aims = chooseAims(html, jsonLd);
  const decision = metrics.find((metric) => metric.kind === 'first_decision_days');

  const facts: ExtractedPageFacts = {
    journalTitle: field(journalTitle, journalTitle ? 0.9 : 0),
    issnPrint: field(issnPrint, issnPrint ? 0.95 : 0),
    issnElectronic: field(issnElectronic, issnElectronic ? 0.95 : 0),
    canonicalUrl: field(canonical ? absoluteUrl(canonical, pageUrl) : null, canonical ? 0.9 : 0),
    publisherName: field(jsonLd?.publisher || null, jsonLd?.publisher ? 0.8 : 0),
    submissionPortalUrl: field(submissionPortal(pageAnchors, pageUrl), 0.9),
    authorGuidelinesUrl: field(authorGuidelines(pageAnchors, pageUrl), 0.75),
    aimsAndScopeSummary: field(aims, aims ? 0.8 : 0),
    articleProcessingChargeUsd: field(apc, apc !== null ? 0.9 : 0),
    apcInfoUrl: field(apc === null ? apcInfoUrl(pageAnchors, pageUrl) : null, 0.6),
    firstDecisionDays: field(decision?.numericValue ?? null, decision ? 0.8 : 0),
    acceptedArticleTypes: field(types, types.length ? 0.7 : 0),
    editorInChief: field(editors(html), 0.85),
    peerReviewModel: field(null, 0),
    openAccessPolicy: field(openAccess(html), 0.75),
    specialIssuesAvailable: field(specialIssue, specialIssue ? 0.7 : 0),
    pageMetrics: metrics,
    layout,
    rawConfidenceAverage: 0,
    extractedDate: new Date().toISOString(),
  };

  const confidences = [
    facts.journalTitle,
    facts.issnPrint,
    facts.issnElectronic,
    facts.aimsAndScopeSummary,
    facts.submissionPortalUrl,
    facts.articleProcessingChargeUsd,
    facts.firstDecisionDays,
    facts.acceptedArticleTypes,
  ].map((item) => item.confidence);
  facts.rawConfidenceAverage = confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
  return facts;
}

function metric(page: ExtractedPageFacts, kind: PageSourcedMetric['kind']): PageSourcedMetric | undefined {
  return page.pageMetrics.find((item) => item.kind === kind);
}

export const CATALOG_SNAPSHOT_NOTE = 'Hardcoded catalog snapshot. Not a Clarivate lookup and not verified.';

type NumberFactKey = 'impactFactor' | 'fiveYearImpactFactor' | 'firstDecisionDays' | 'apcUsd';

function isHardcodedCatalogRecord(base: MergeableJournalFacts): boolean {
  if (base.verificationStatus === 'user_provided' || base.verificationStatus === 'clarivate_api') return false;
  if (base.provenanceSource === 'clarivate_wos_journals_api') return false;
  if (base.verificationStatus === 'catalog_snapshot' || base.provenanceSource === 'catalog_snapshot') return true;
  const provenance = Object.values(base.provenanceMap || {});
  if (provenance.some((item) => item?.source === 'catalog_snapshot')) return true;
  // Older in-repo rows used source_verified plus a Clarivate label. They are snapshots.
  const claimsClarivate = provenance.some((item) => item?.source === 'Clarivate' || item?.source === 'Clarivate JCR');
  const hardcodedAttribution = /verified via clarivate/i.test(base.sourceAttribution || '');
  return (
    (base.verificationStatus as string) === 'source_verified' &&
    base.isVerifiedClarivate === true &&
    (claimsClarivate || hardcodedAttribution || provenance.length === 0)
  );
}

function writeNumber(result: MergeableJournalFacts, factKey: NumberFactKey, value: number) {
  if (factKey === 'impactFactor') result.impactFactor = value;
  if (factKey === 'fiveYearImpactFactor') result.fiveYearImpactFactor = value;
  if (factKey === 'firstDecisionDays') result.firstDecisionDays = value;
  if (factKey === 'apcUsd') result.apcUsd = value;
}

/**
 * Page facts override model guesses and stale catalog snapshot numbers.
 * A non-null user-provided or live source-verified value stays.
 * Null catalog and user-provided fields are filled from the page.
 * Nothing read from the page, and nothing guessed, is marked source_verified.
 */
export function mergeLandingPageFacts<T extends MergeableJournalFacts>(
  base: T,
  page: ExtractedPageFacts | null,
  notes?: { fetchError?: string }
): T {
  const catalogSnapshot = isHardcodedCatalogRecord(base);
  const userProvided = base.verificationStatus === 'user_provided';
  const verifiedLive = base.verificationStatus === 'clarivate_api' && !catalogSnapshot;
  const result: T = { ...base, provenanceMap: { ...(base.provenanceMap || {}) } };
  const provenance: Record<string, Provenance> = { ...(result.provenanceMap || {}) };

  if (catalogSnapshot) {
    result.verificationStatus = 'catalog_snapshot';
    result.provenanceSource = 'catalog_snapshot';
    result.isVerifiedClarivate = false;
    result.reportingYear = base.reportingYear && /catalog snapshot/i.test(base.reportingYear) ? base.reportingYear : 'Catalog snapshot';
    result.sourceAttribution = base.sourceAttribution && /catalog snapshot/i.test(base.sourceAttribution) ? base.sourceAttribution : CATALOG_SNAPSHOT_NOTE;
    for (const factKey of ['impactFactor', 'fiveYearImpactFactor', 'firstDecisionDays', 'apcUsd'] as const) {
      const existing = base[factKey];
      if (existing === null || existing === undefined) continue;
      provenance[factKey] = {
        source: 'catalog_snapshot',
        confidence: 0.5,
        year: base.provenanceMap?.[factKey]?.year,
        note: CATALOG_SNAPSHOT_NOTE,
      };
    }
    if (!provenance.journalName || provenance.journalName.source === 'Clarivate' || provenance.journalName.source === 'Clarivate JCR') {
      provenance.journalName = { source: 'catalog_snapshot', confidence: 0.5, note: CATALOG_SNAPSHOT_NOTE };
    }
  }

  if (notes?.fetchError) {
    provenance.landingPage = { source: 'page_sourced', confidence: 0, note: notes.fetchError };
  }
  result.provenanceMap = provenance;
  if (!page) return result;

  result.extractedFacts = page;
  const textLocked = userProvided;

  if (page.journalTitle.value && !textLocked && !verifiedLive) {
    result.journalName = page.journalTitle.value;
    provenance.journalName = { source: 'page_sourced', confidence: page.journalTitle.confidence };
  }

  const aimsMissing = !base.aimsAndScopeSummary || /not verified/i.test(base.aimsAndScopeSummary);
  if (page.aimsAndScopeSummary.value && (aimsMissing || !textLocked)) {
    result.aimsAndScopeSummary = page.aimsAndScopeSummary.value;
    provenance.aimsAndScopeSummary = { source: 'page_sourced', confidence: page.aimsAndScopeSummary.confidence };
  }

  if (page.submissionPortalUrl.value && (!textLocked || !base.submissionPortalUrl)) {
    result.submissionPortalUrl = page.submissionPortalUrl.value;
    provenance.submissionPortalUrl = { source: 'page_sourced', confidence: page.submissionPortalUrl.confidence };
  }
  if (page.authorGuidelinesUrl.value && (!textLocked || !base.authorGuidelinesUrl)) {
    result.authorGuidelinesUrl = page.authorGuidelinesUrl.value;
    provenance.authorGuidelinesUrl = { source: 'page_sourced', confidence: page.authorGuidelinesUrl.confidence };
  }
  if (page.publisherName.value && !textLocked && !verifiedLive) {
    result.publisher = page.publisherName.value;
    provenance.publisher = { source: 'page_sourced', confidence: page.publisherName.confidence };
  }
  if (page.openAccessPolicy.value && !textLocked && !verifiedLive) {
    result.openAccessType = page.openAccessPolicy.value;
    provenance.openAccessType = { source: 'page_sourced', confidence: page.openAccessPolicy.confidence, note: 'page-sourced' };
  }

  const applyNumber = (factKey: NumberFactKey, value: number | null | undefined, year?: number | null, note?: string) => {
    if (value === null || value === undefined || Number.isNaN(value)) return;
    const existing = base[factKey];
    const hasExisting = existing !== null && existing !== undefined && !Number.isNaN(existing);
    const pageNote = note || 'page-sourced';

    if ((userProvided || verifiedLive) && hasExisting) {
      const kept = provenance[factKey];
      provenance[factKey] = {
        source: userProvided ? 'user_provided' : kept?.source || 'clarivate_wos_journals_api',
        confidence: userProvided ? 0.85 : kept?.confidence ?? 0.95,
        year: kept?.year,
        note: `Existing value kept. Landing page also stated ${value}${year ? ` (${year})` : ''}, labelled page-sourced.`,
      };
      return;
    }

    if (catalogSnapshot && hasExisting) {
      const prior = provenance[factKey];
      provenance[`${factKey}CatalogSnapshot`] = {
        source: 'catalog_snapshot',
        confidence: 0.5,
        year: prior?.year,
        note: `Catalog snapshot value ${existing} is not the displayed figure.`,
      };
    }

    writeNumber(result, factKey, value);
    provenance[factKey] = { source: 'page_sourced', confidence: 0.8, year: year ?? undefined, note: pageNote };
  };

  const impact = metric(page, 'impact_factor');
  const fiveYear = metric(page, 'five_year_impact_factor');
  const decision = metric(page, 'first_decision_days');
  const apc = metric(page, 'apc');
  applyNumber('impactFactor', impact?.numericValue, impact?.year, 'page-sourced');
  applyNumber('fiveYearImpactFactor', fiveYear?.numericValue, fiveYear?.year, 'page-sourced');
  applyNumber('firstDecisionDays', decision?.numericValue, decision?.year, 'page-sourced');
  applyNumber('apcUsd', apc?.numericValue, apc?.year, 'page-sourced');

  if (!userProvided && !verifiedLive) {
    result.isVerifiedClarivate = false;
    const pageSuppliedNumber = (['impactFactor', 'fiveYearImpactFactor', 'firstDecisionDays', 'apcUsd'] as const).some(
      (key) => provenance[key]?.source === 'page_sourced'
    );
    if (pageSuppliedNumber) {
      result.verificationStatus = 'page_sourced';
      result.provenanceSource = 'page_sourced';
      result.missingFields = undefined;
      result.reportingYear = impact?.year ? `Page-sourced (${impact.year})` : 'Page-sourced';
      result.sourceAttribution = provenance.impactFactorCatalogSnapshot
        ? 'Page-sourced from the journal landing page. The catalog snapshot figure is kept only in provenance and is not Clarivate-verified.'
        : 'Page-sourced from the journal landing page. Not Clarivate-verified.';
    } else if (catalogSnapshot) {
      result.verificationStatus = 'catalog_snapshot';
      result.provenanceSource = 'catalog_snapshot';
      result.missingFields = undefined;
      result.isVerifiedClarivate = false;
    } else if (page.journalTitle.value || page.issnPrint.value || page.issnElectronic.value) {
      result.verificationStatus = 'missing';
      result.provenanceSource = 'missing';
      result.isVerifiedClarivate = false;
      result.sourceAttribution = 'Journal landing page was read, but it did not state an impact factor. Nothing on this record is a trusted metric.';
      result.missingFields = [
        result.impactFactor === null ? 'impactFactor' : '',
        'casZone',
        'jcrQuartile',
        result.firstDecisionDays == null ? 'firstDecisionDays' : '',
        result.apcUsd == null ? 'apcUsd' : '',
        'indexing',
      ].filter(Boolean);
    }
  }

  result.provenanceMap = provenance;
  return result;
}

export function formatLandingPagePromptSection(facts: MergeableJournalFacts): string {
  const page = facts.extractedFacts;
  if (!page) return 'No landing page facts were extracted.';
  const lines = [
    'LANDING PAGE FACTS (provenance: page_sourced). Metrics below are page-sourced and must not be called Clarivate-verified.',
    page.journalTitle.value ? `- Title: ${page.journalTitle.value}` : '',
    page.issnPrint.value ? `- Print ISSN: ${page.issnPrint.value}` : '',
    page.issnElectronic.value ? `- Electronic ISSN: ${page.issnElectronic.value}` : '',
    page.aimsAndScopeSummary.value ? `- Aims and scope: ${page.aimsAndScopeSummary.value}` : '',
    page.acceptedArticleTypes.value.length ? `- Article types: ${page.acceptedArticleTypes.value.join('; ')}` : '',
    page.submissionPortalUrl.value ? `- Submission URL: ${page.submissionPortalUrl.value}` : '',
    page.authorGuidelinesUrl.value ? `- Author guidelines: ${page.authorGuidelinesUrl.value}` : '',
    page.articleProcessingChargeUsd.value !== null ? `- APC stated on page: $${page.articleProcessingChargeUsd.value} USD (page-sourced)` : '',
    page.openAccessPolicy.value ? `- Publishing model on page: ${page.openAccessPolicy.value}` : '',
    page.editorInChief.value ? `- Editor: ${page.editorInChief.value}` : '',
    ...page.pageMetrics.map((item) => `- Page-sourced ${item.label}: ${item.value}`),
  ];
  return lines.filter(Boolean).join('\n');
}
