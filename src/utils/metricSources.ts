import { ClarivateJournalMetrics, MetricProvenanceSource, WosJifRank } from '../types';
import { normalizeIssn } from './issn';

/**
 * Web of Science Journals API.
 * Base: https://api.clarivate.com/apis/wos-journals/v1
 * Auth header: X-ApiKey
 *
 *   GET /journals?q=<ISSN>                         -> hits[].id
 *   GET /journals/{id}                             -> issn, eIssn, publisher, categories, journalCitationReports[]
 *   GET /journals/{id}/reports/year/{year}         -> metrics.impactMetrics and ranks.jif[]
 *
 * The default client calls this API when CLARIVATE_API_KEY is set.
 * lookupMetricsByIssn maps a payload from that client or from a test double.
 */
export const WOS_JOURNALS_API_BASE = 'https://api.clarivate.com/apis/wos-journals/v1';
export const CLARIVATE_WOS_JOURNALS_SOURCE: MetricProvenanceSource = 'clarivate_wos_journals_api';

export interface WosJournalSearchHit {
  id: string;
}

export interface WosJournalSearchResponse {
  hits: WosJournalSearchHit[];
}

export interface WosJournalCitationReportRef {
  year: number | string;
}

export interface WosJournalProfile {
  id?: string;
  /** Present on some responses. The documented profile does not require it. */
  title?: string;
  issn?: string;
  eIssn?: string;
  publisher?: string;
  /** Category names. Editions, when the API sent them, are on categoryEditions. */
  categories?: string[];
  /** JCR edition on a category object, for example SCIE. */
  categoryEditions?: string[];
  journalCitationReports?: WosJournalCitationReportRef[];
}

export interface WosImpactMetrics {
  /** Journal Impact Factor, as a string such as "56.1". */
  jif?: string;
  jif5Years?: string;
  immediacyIndex?: string;
  jci?: string;
}

export interface WosJournalYearReport {
  metrics?: {
    impactMetrics?: WosImpactMetrics;
  };
  ranks?: {
    jif?: WosJifRank[];
  };
}

export interface ClarivateWosJournalsClient {
  /** GET /journals?q=<ISSN> */
  searchByIssn(issn: string): Promise<WosJournalSearchResponse | null>;
  /** GET /journals/{id} */
  getJournal(journalId: string): Promise<WosJournalProfile | null>;
  /** GET /journals/{id}/reports/year/{year} */
  getYearReport(journalId: string, year: number): Promise<WosJournalYearReport | null>;
}

const unwiredClarivateClient: ClarivateWosJournalsClient = {
  async searchByIssn(): Promise<WosJournalSearchResponse | null> {
    return null;
  },
  async getJournal(): Promise<WosJournalProfile | null> {
    return null;
  },
  async getYearReport(): Promise<WosJournalYearReport | null> {
    return null;
  },
};

let activeClarivateClient: ClarivateWosJournalsClient = unwiredClarivateClient;

/** Delegates to the installed client. Until install, lookups return null. */
export const clarivateWosJournals: ClarivateWosJournalsClient = {
  searchByIssn: (issn) => activeClarivateClient.searchByIssn(issn),
  getJournal: (journalId) => activeClarivateClient.getJournal(journalId),
  getYearReport: (journalId, year) => activeClarivateClient.getYearReport(journalId, year),
};

/**
 * Facts read from the journal page itself (aims, fees, decision time printed
 * on the site). This build does not scrape pages, so the client returns null.
 */
export interface PageFactsClient {
  extractFromPage(canonicalUrl: string): Promise<ClarivateJournalMetrics | null>;
}

export const pageFacts: PageFactsClient = {
  async extractFromPage(): Promise<ClarivateJournalMetrics | null> {
    return null;
  },
};

export function parseJif(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function latestJcrYear(profile: WosJournalProfile): number | null {
  const years = (profile.journalCitationReports || [])
    .map((report) => Number(report?.year))
    .filter((year) => Number.isInteger(year) && year > 1900 && year < 3000);
  if (years.length === 0) return null;
  return Math.max(...years);
}

type LookupOutcome =
  | { kind: 'metrics'; metrics: ClarivateJournalMetrics }
  | { kind: 'not_found' }
  | { kind: 'unavailable' };

/** Short negative cache so a missing ISSN is not looked up on every request. */
export const NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;

export interface IssnLookup {
  lookup(issn: string, retrievedAt?: Date): Promise<ClarivateJournalMetrics | null>;
  reset(): void;
}

export function createIssnLookup(
  client: ClarivateWosJournalsClient,
  options?: { negativeTtlMs?: number; now?: () => number }
): IssnLookup {
  const negativeTtlMs = options?.negativeTtlMs ?? NEGATIVE_CACHE_TTL_MS;
  const now = options?.now ?? (() => Date.now());
  const negativeUntil = new Map<string, number>();
  const inflight = new Map<string, Promise<ClarivateJournalMetrics | null>>();

  const lookup = (issn: string, retrievedAt: Date = new Date()): Promise<ClarivateJournalMetrics | null> => {
    const cleaned = normalizeIssn(issn);
    if (!cleaned) return Promise.resolve(null);
    const until = negativeUntil.get(cleaned);
    if (until != null && until > now()) return Promise.resolve(null);
    const existing = inflight.get(cleaned);
    if (existing) return existing;

    const promise = (async () => {
      const outcome = await lookupOnce(cleaned, client, retrievedAt);
      if (outcome.kind === 'not_found') {
        negativeUntil.set(cleaned, now() + negativeTtlMs);
        return null;
      }
      if (outcome.kind === 'unavailable') return null;
      return outcome.metrics;
    })().finally(() => {
      inflight.delete(cleaned);
    });
    inflight.set(cleaned, promise);
    return promise;
  };

  return {
    lookup,
    reset() {
      negativeUntil.clear();
      inflight.clear();
    },
  };
}

/**
 * Turn one ISSN into metrics using the Journals API client.
 * Returns null when the client is unwired or the payload has no JIF.
 * Does not fill in a hardcoded impact factor.
 */
const defaultIssnLookup = createIssnLookup(clarivateWosJournals);

/**
 * Server-only wiring. The browser bundle does not import the HTTP client,
 * so the API key never ships to the browser. Call this from server.ts.
 */
export function installClarivateClient(client: ClarivateWosJournalsClient): void {
  activeClarivateClient = client;
  defaultIssnLookup.reset();
}

async function lookupOnce(
  issn: string,
  client: ClarivateWosJournalsClient,
  retrievedAt: Date
): Promise<LookupOutcome> {
  const cleaned = normalizeIssn(issn);
  if (!cleaned) return { kind: 'unavailable' };

  const search = await client.searchByIssn(cleaned);
  if (!search) return { kind: 'unavailable' };
  const journalId = search.hits?.find((hit) => hit?.id)?.id;
  if (!journalId) return { kind: 'not_found' };

  const profile = await client.getJournal(journalId);
  if (!profile) return { kind: 'unavailable' };

  const jcrYear = latestJcrYear(profile);
  if (jcrYear == null) return { kind: 'unavailable' };

  const report = await client.getYearReport(journalId, jcrYear);
  const impact = report?.metrics?.impactMetrics;
  const impactFactor = parseJif(impact?.jif);
  if (impactFactor == null || !report) return { kind: 'unavailable' };

  const retrieved = retrievedAt.toISOString();
  const ranks = Array.isArray(report.ranks?.jif) ? report.ranks.jif : [];
  const quartile = ranks.find((rank) => rank?.quartile)?.quartile || null;
  const printIssn = normalizeIssn(profile.issn) || cleaned;
  const electronicIssn = normalizeIssn(profile.eIssn) || undefined;

  return {
    kind: 'metrics',
    metrics: {
      journalName: profile.title?.trim() || journalId,
      wosJournalId: journalId,
      publisher: profile.publisher || 'Unknown publisher',
      issn: printIssn,
      eIssn: electronicIssn,
      impactFactor,
      fiveYearImpactFactor: parseJif(impact?.jif5Years),
      immediacyIndex: parseJif(impact?.immediacyIndex),
      journalCitationIndicator: parseJif(impact?.jci),
      jcrQuartile: quartile,
      jifRanks: ranks,
      casZone: null,
      firstDecisionDays: null,
      indexing: profile.categoryEditions?.filter(Boolean) || [],
      apcUsd: null,
      primaryDiscipline: profile.categories?.filter(Boolean).join(', ') || '',
      aimsAndScopeSummary: '',
      verificationStatus: 'clarivate_api',
      provenanceSource: CLARIVATE_WOS_JOURNALS_SOURCE,
      isVerifiedClarivate: true,
      jcrYear,
      retrievedAt: retrieved,
      reportingYear: String(jcrYear),
      sourceAttribution: `JIF ${impactFactor} (Clarivate JCR ${jcrYear}), retrieved ${retrieved}`,
    },
  };
}

/**
 * Turn one ISSN into metrics using the Journals API client.
 * Returns null when the key is missing, the ISSN is unknown, or the payload has no JIF.
 * Does not fill in a hardcoded impact factor.
 * The default client dedupes concurrent lookups and briefly remembers not-found ISSNs.
 */
export async function lookupMetricsByIssn(
  issn: string,
  client: ClarivateWosJournalsClient = clarivateWosJournals,
  retrievedAt: Date = new Date()
): Promise<ClarivateJournalMetrics | null> {
  if (client === clarivateWosJournals) {
    return defaultIssnLookup.lookup(issn, retrievedAt);
  }
  const outcome = await lookupOnce(issn, client, retrievedAt);
  return outcome.kind === 'metrics' ? outcome.metrics : null;
}
