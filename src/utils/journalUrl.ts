/**
 * One normalizer for every journal URL the app stores, matches, or links to.
 * It never adds a path segment. Callers must not build journal URLs by hand.
 */
export interface NormalizedJournalUrl {
  /** https://host/path, lowercase host, no query, no hash, no trailing slash. */
  canonical: string;
  host: string;
  /** Host with a leading www. removed, so www and apex share an identity. */
  hostKey: string;
  /** '' for the site root, otherwise '/segment/...' */
  pathname: string;
  segments: string[];
  /**
   * Cache key. A path URL keeps its last segment.
   * A URL with no path uses host:<hostKey>, which cannot equal a path slug
   * such as "nature". A later change will replace this with ISSN.
   */
  cacheKey: string;
}

const EMPTY: NormalizedJournalUrl = {
  canonical: '',
  host: '',
  hostKey: '',
  pathname: '',
  segments: [],
  cacheKey: 'unknown',
};

/** Official Nature homepage. No /nature path. */
export const NATURE_HOMEPAGE_URL = 'https://www.nature.com';

export function normalizeJournalUrl(raw: string | null | undefined): NormalizedJournalUrl {
  const cleaned = (raw || '').trim();
  if (!cleaned) return EMPTY;

  const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    return EMPTY;
  }

  const host = parsed.hostname.toLowerCase();
  if (!host) return EMPTY;

  const hostKey = host.replace(/^www\./, '');
  const segments = parsed.pathname
    .split('/')
    .map((segment) => segment.trim().toLowerCase())
    .filter(Boolean);
  const pathname = segments.length > 0 ? `/${segments.join('/')}` : '';
  const last = segments[segments.length - 1] || '';
  const cacheKey =
    segments.length === 0 ? `host:${hostKey}` : last.startsWith('host:') ? `path:${last}` : last;

  return {
    canonical: `https://${host}${pathname}`,
    host,
    hostKey,
    pathname,
    segments,
    cacheKey,
  };
}

/** Same site and same path. www and a trailing slash do not make a second journal. */
export function journalUrlsMatch(a: NormalizedJournalUrl, b: NormalizedJournalUrl): boolean {
  if (!a.hostKey || !b.hostKey) return false;
  return a.hostKey === b.hostKey && a.pathname === b.pathname;
}

/** Append a destination path onto a canonical journal URL. Never invents a slug. */
export function joinJournalUrl(base: string | null | undefined, suffix: string | null | undefined): string {
  const root = normalizeJournalUrl(base).canonical;
  if (!root) return '';
  const extra = (suffix || '').trim();
  if (!extra || extra === '/') return root;
  const path = extra.startsWith('/') ? extra : `/${extra}`;
  return `${root}${path}`.replace(/([^:]\/)\/+/g, '$1');
}
