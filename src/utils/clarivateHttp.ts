import {
  ClarivateWosJournalsClient,
  WOS_JOURNALS_API_BASE,
  WosJournalProfile,
  WosJournalSearchResponse,
  WosJournalYearReport,
} from './metricSources';

/** Stay under the shared ~5 requests/second budget. */
export const CLARIVATE_MIN_INTERVAL_MS = 500;
export const CLARIVATE_MAX_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 400;
const BACKOFF_CAP_MS = 30_000;

export interface RateLimiter {
  schedule<T>(task: () => Promise<T>): Promise<T>;
}

export function createRateLimiter(options: {
  minIntervalMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}): RateLimiter {
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let nextAt = 0;
  let chain: Promise<unknown> = Promise.resolve();

  return {
    schedule<T>(task: () => Promise<T>): Promise<T> {
      const run = chain.then(async () => {
        const wait = Math.max(0, nextAt - now());
        if (wait > 0) await sleep(wait);
        nextAt = now() + options.minIntervalMs;
        return task();
      });
      chain = run.then(
        () => undefined,
        () => undefined
      );
      return run;
    },
  };
}

export function retryAfterMs(header: string | null, nowMs: number): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return Math.max(0, Number(trimmed) * 1000);
  }
  const date = Date.parse(trimmed);
  if (Number.isFinite(date)) return Math.max(0, date - nowMs);
  return null;
}

type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}>;

export interface ClarivateHttpDependencies {
  fetchImpl?: FetchLike;
  apiKey?: string | null;
  minIntervalMs?: number;
  maxAttempts?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
  limiter?: RateLimiter;
  log?: (message: string) => void;
}

let missingKeyWarningLogged = false;

export function resetClarivateKeyWarning(): void {
  missingKeyWarningLogged = false;
}

export function readClarivateApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.CLARIVATE_API_KEY?.trim();
  return key || null;
}

function warnMissingKey(log: (message: string) => void): void {
  if (missingKeyWarningLogged) return;
  missingKeyWarningLogged = true;
  log('[Clarivate] CLARIVATE_API_KEY is not set. Web of Science journal lookups are disabled.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** A plain string, or the `name` on `{ name, ... }` objects the Journals API returns. */
function namedText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (isRecord(value)) return namedText(value.name);
  return undefined;
}

function parseCategories(value: unknown): { names: string[]; editions: string[] } {
  if (!Array.isArray(value)) return { names: [], editions: [] };
  const names: string[] = [];
  const editions: string[] = [];
  for (const item of value) {
    const name = namedText(item);
    if (name && !names.includes(name)) names.push(name);
    if (isRecord(item)) {
      const edition = namedText(item.edition);
      if (edition && !editions.includes(edition)) editions.push(edition);
    }
  }
  return { names, editions };
}

/**
 * Journal Impact Factor percentile from a year report. The live API sends a
 * number such as 99.6. A string is kept when that is what the payload used.
 */
function parseJifPercentile(value: unknown): string | number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

/**
 * Map a GET /journals/{id} body onto the profile used by lookup.
 * Publisher may be a string or `{ name, address, countryRegion }`.
 * Categories may be strings or `{ name, edition, url }`.
 * Display title prefers jcrTitle, then isoTitle, then title, then the all-caps name.
 */
export function parseWosJournalProfile(body: unknown, fallbackId?: string): WosJournalProfile | null {
  if (!isRecord(body)) return null;
  const categories = parseCategories(body.categories);
  const reports = Array.isArray(body.journalCitationReports) ? body.journalCitationReports : [];
  const title = namedText(body.jcrTitle) || namedText(body.isoTitle) || namedText(body.title) || namedText(body.name);
  return {
    id: typeof body.id === 'string' && body.id.trim() ? body.id : fallbackId,
    title,
    issn: typeof body.issn === 'string' ? body.issn : undefined,
    eIssn: typeof body.eIssn === 'string' ? body.eIssn : undefined,
    publisher: namedText(body.publisher),
    categories: categories.names,
    categoryEditions: categories.editions,
    journalCitationReports: reports
      .map((report) => (isRecord(report) ? { year: report.year as number | string } : null))
      .filter((report): report is { year: number | string } => !!report && (typeof report.year === 'number' || typeof report.year === 'string')),
  };
}

function pathForLog(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url.split('?')[0] || url;
  }
}

async function requestJson(
  url: string,
  deps: Required<Pick<ClarivateHttpDependencies, 'fetchImpl' | 'now' | 'sleep' | 'random' | 'log' | 'maxAttempts'>> & {
    limiter: RateLimiter;
    apiKey: string;
  }
): Promise<unknown | null> {
  let delay = BACKOFF_BASE_MS;
  for (let attempt = 0; attempt < deps.maxAttempts; attempt += 1) {
    let response: Awaited<ReturnType<FetchLike>>;
    try {
      response = await deps.limiter.schedule(() =>
        deps.fetchImpl(url, {
          headers: {
            'X-ApiKey': deps.apiKey,
            Accept: 'application/json',
          },
        })
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'network error';
      if (attempt === deps.maxAttempts - 1) {
        deps.log(`[Clarivate] Request failed for ${pathForLog(url)}: ${message}`);
        return null;
      }
      const wait = Math.min(BACKOFF_CAP_MS, delay + deps.random() * delay * 0.25);
      await deps.sleep(wait);
      delay = Math.min(BACKOFF_CAP_MS, delay * 2);
      continue;
    }

    if (response.status === 404) return null;
    if (response.ok) {
      try {
        return await response.json();
      } catch {
        deps.log(`[Clarivate] Non-JSON response for ${pathForLog(url)}`);
        return null;
      }
    }

    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === deps.maxAttempts - 1) {
      if (response.status === 401 || response.status === 403) {
        deps.log(`[Clarivate] Journals API rejected the request (HTTP ${response.status}). Check CLARIVATE_API_KEY.`);
      } else {
        deps.log(`[Clarivate] HTTP ${response.status} for ${pathForLog(url)}`);
      }
      return null;
    }

    const headerWait = retryAfterMs(response.headers.get('retry-after'), deps.now());
    const wait = headerWait != null ? headerWait : Math.min(BACKOFF_CAP_MS, delay + deps.random() * delay * 0.25);
    await deps.sleep(wait);
    delay = Math.min(BACKOFF_CAP_MS, delay * 2);
  }
  return null;
}

export function createClarivateWosJournalsClient(options: ClarivateHttpDependencies = {}): ClarivateWosJournalsClient {
  const log = options.log ?? ((message: string) => console.warn(message));
  const now = options.now ?? (() => Date.now());
  const sleep = options.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;
  const fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const limiter =
    options.limiter ??
    createRateLimiter({
      minIntervalMs: options.minIntervalMs ?? CLARIVATE_MIN_INTERVAL_MS,
      now,
      sleep,
    });
  const maxAttempts = options.maxAttempts ?? CLARIVATE_MAX_ATTEMPTS;

  const key = () => (options.apiKey !== undefined ? options.apiKey?.trim() || null : readClarivateApiKey());

  async function getJson(url: string): Promise<unknown | null> {
    const apiKey = key();
    if (!apiKey) {
      warnMissingKey(log);
      return null;
    }
    return requestJson(url, { fetchImpl, now, sleep, random, log, maxAttempts, limiter, apiKey });
  }

  return {
    async searchByIssn(issn: string): Promise<WosJournalSearchResponse | null> {
      const url = `${WOS_JOURNALS_API_BASE}/journals?${new URLSearchParams({ q: issn }).toString()}`;
      const body = await getJson(url);
      if (!isRecord(body) || !Array.isArray(body.hits)) return null;
      const hits = body.hits
        .map((hit) => (isRecord(hit) && typeof hit.id === 'string' ? { id: hit.id } : null))
        .filter((hit): hit is { id: string } => !!hit);
      return { hits };
    },

    async getJournal(journalId: string): Promise<WosJournalProfile | null> {
      const body = await getJson(`${WOS_JOURNALS_API_BASE}/journals/${encodeURIComponent(journalId)}`);
      return parseWosJournalProfile(body, journalId);
    },

    async getYearReport(journalId: string, year: number): Promise<WosJournalYearReport | null> {
      const body = await getJson(
        `${WOS_JOURNALS_API_BASE}/journals/${encodeURIComponent(journalId)}/reports/year/${encodeURIComponent(String(year))}`
      );
      if (!isRecord(body)) return null;
      const metrics = isRecord(body.metrics) ? body.metrics : undefined;
      const impact = metrics && isRecord(metrics.impactMetrics) ? metrics.impactMetrics : undefined;
      const ranks = isRecord(body.ranks) && Array.isArray(body.ranks.jif) ? body.ranks.jif : [];
      return {
        metrics: impact
          ? {
              impactMetrics: {
                jif: typeof impact.jif === 'string' || typeof impact.jif === 'number' ? String(impact.jif) : undefined,
                jif5Years: typeof impact.jif5Years === 'string' || typeof impact.jif5Years === 'number' ? String(impact.jif5Years) : undefined,
                immediacyIndex:
                  typeof impact.immediacyIndex === 'string' || typeof impact.immediacyIndex === 'number'
                    ? String(impact.immediacyIndex)
                    : undefined,
                jci: typeof impact.jci === 'string' || typeof impact.jci === 'number' ? String(impact.jci) : undefined,
              },
            }
          : undefined,
        ranks: {
          jif: ranks.filter(isRecord).map((rank) => ({
            category: namedText(rank.category),
            rank: typeof rank.rank === 'string' ? rank.rank : undefined,
            quartile: typeof rank.quartile === 'string' ? rank.quartile : undefined,
            jifPercentile: parseJifPercentile(rank.jifPercentile),
          })),
        },
      };
    },
  };
}

/** Shared client: 2 requests/second, one missing-key warning, env key only. */
export const clarivateWosJournals = createClarivateWosJournalsClient();
