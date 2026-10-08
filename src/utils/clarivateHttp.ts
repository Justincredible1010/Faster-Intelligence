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
      if (!isRecord(body)) return null;
      const reports = Array.isArray(body.journalCitationReports) ? body.journalCitationReports : [];
      return {
        id: typeof body.id === 'string' ? body.id : journalId,
        issn: typeof body.issn === 'string' ? body.issn : undefined,
        eIssn: typeof body.eIssn === 'string' ? body.eIssn : undefined,
        publisher: typeof body.publisher === 'string' ? body.publisher : undefined,
        categories: Array.isArray(body.categories) ? body.categories.filter((item): item is string => typeof item === 'string') : undefined,
        title: typeof body.title === 'string' ? body.title : typeof body.name === 'string' ? body.name : undefined,
        journalCitationReports: reports
          .map((report) => (isRecord(report) ? { year: report.year as number | string } : null))
          .filter((report): report is { year: number | string } => !!report && (typeof report.year === 'number' || typeof report.year === 'string')),
      };
    },

    async getYearReport(journalId: string, year: number): Promise<WosJournalYearReport | null> {
      const body = await getJson(
        `${WOS_JOURNALS_API_BASE}/journals/${encodeURIComponent(journalId)}/reports/year/${encodeURIComponent(String(year))}`
      );
      if (!isRecord(body)) return null;
      return body as WosJournalYearReport;
    },
  };
}

/** Shared client: 2 requests/second, one missing-key warning, env key only. */
export const clarivateWosJournals = createClarivateWosJournalsClient();
