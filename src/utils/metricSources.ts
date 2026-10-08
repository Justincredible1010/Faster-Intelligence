import { ClarivateJournalMetrics, MetricProvenanceSource, PageSourcedFeature, WosJifRank } from '../types';

/**
 * Web of Science Journals API.
 * Base: https://api.clarivate.com/apis/wos-journals/v1
 * Auth header: X-ApiKey
 *
 *   GET /journals?q=<ISSN>                         -> hits[].id
 *   GET /journals/{id}                             -> issn, eIssn, publisher, categories, journalCitationReports[]
 *   GET /journals/{id}/reports/year/{year}         -> metrics.impactMetrics and ranks.jif[]
 *
 * This build does not call the network. The default client returns null.
 * lookupMetricsByIssn maps a real payload when a client is supplied.
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
  year: number;
}

export interface WosJournalProfile {
  id?: string;
  issn?: string;
  eIssn?: string;
  publisher?: string;
  categories?: string[];
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
  /**
   * Copied only when the payload states it. The Journals API year report does
   * not include this field, and retrievedAt is not a substitute.
   */
  downloadDate?: string;
  /** Copied only when the payload states a data-retrieved date. */
  dataRetrieved?: string;
}

export interface ClarivateWosJournalsClient {
  /** GET /journals?q=<ISSN> */
  searchByIssn(issn: string): Promise<WosJournalSearchResponse | null>;
  /** GET /journals/{id} */
  getJournal(journalId: string): Promise<WosJournalProfile | null>;
  /** GET /journals/{id}/reports/year/{year} */
  getYearReport(journalId: string, year: number): Promise<WosJournalYearReport | null>;
}

export const clarivateWosJournals: ClarivateWosJournalsClient = {
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

/**
 * Facts read from the journal page itself (aims, fees, decision time printed
 * on the site). This build does not scrape pages, so the client returns null.
 */
export interface PageFactsClient {
  extractFromPage(canonicalUrl: string): Promise<ClarivateJournalMetrics | null>;
}

let extractPageFacts: PageFactsClient['extractFromPage'] = async () => null;

/** Test seam. Production leaves the extractor unset, so page lookup returns null. */
export function setPageFactsClientForTests(
  client: Pick<PageFactsClient, 'extractFromPage'> | null
): void {
  extractPageFacts = client?.extractFromPage ?? (async () => null);
}

export const pageFacts: PageFactsClient = {
  async extractFromPage(canonicalUrl: string): Promise<ClarivateJournalMetrics | null> {
    return extractPageFacts(canonicalUrl);
  },
};

export function parseJif(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function statedApiDate(value: string | undefined): string | null {
  const text = (value || '').replace(/\s+/g, ' ').trim();
  return text || null;
}

/** Dates the payload actually states, plus the retrieval time of this response. */
function apiDateFeatures(report: WosJournalYearReport, retrievedAt: string): PageSourcedFeature[] {
  const features: PageSourcedFeature[] = [];
  const downloadDate = statedApiDate(report.downloadDate);
  if (downloadDate) {
    features.push({
      kind: 'download_date',
      label: 'Download date',
      text: downloadDate,
      provenance: 'clarivate_wos_journals_api',
    });
  }
  const dataRetrieved = statedApiDate(report.dataRetrieved);
  if (dataRetrieved) {
    features.push({
      kind: 'data_retrieved',
      label: 'Data retrieved',
      text: dataRetrieved,
      provenance: 'clarivate_wos_journals_api',
    });
  }
  const retrievalDate = retrievedAt.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(retrievalDate)) {
    features.push({
      kind: 'retrieval_date',
      label: 'Retrieval date',
      text: retrievalDate,
      provenance: 'clarivate_wos_journals_api',
    });
  }
  return features;
}

function latestJcrYear(profile: WosJournalProfile): number | null {
  const years = (profile.journalCitationReports || [])
    .map((report) => report.year)
    .filter((year) => Number.isInteger(year));
  if (years.length === 0) return null;
  return Math.max(...years);
}

/**
 * Turn one ISSN into metrics using the Journals API client.
 * Returns null when the client is unwired or the payload has no JIF.
 * Does not fill in a hardcoded impact factor.
 * The year report has impact and rank fields only, unless the payload itself
 * states a download date or a data-retrieved date. It does not state a
 * journal download or full-text view count, so those stay unset.
 * retrievedAt is the time this response was retrieved. It is a retrieval
 * date, not a download date.
 */
export async function lookupMetricsByIssn(
  issn: string,
  client: ClarivateWosJournalsClient = clarivateWosJournals,
  retrievedAt: Date = new Date()
): Promise<ClarivateJournalMetrics | null> {
  const cleaned = (issn || '').trim();
  if (!cleaned) return null;

  const search = await client.searchByIssn(cleaned);
  const journalId = search?.hits?.find((hit) => hit?.id)?.id;
  if (!journalId) return null;

  const profile = await client.getJournal(journalId);
  if (!profile) return null;

  const jcrYear = latestJcrYear(profile);
  if (jcrYear == null) return null;

  const report = await client.getYearReport(journalId, jcrYear);
  const impact = report?.metrics?.impactMetrics;
  const impactFactor = parseJif(impact?.jif);
  if (impactFactor == null || !report) return null;

  const retrieved = retrievedAt.toISOString();
  const ranks = report.ranks?.jif || [];
  const quartile = ranks.find((rank) => rank.quartile)?.quartile || null;
  const pageFeatures = apiDateFeatures(report, retrieved);

  return {
    journalName: journalId,
    wosJournalId: journalId,
    publisher: profile.publisher || 'Unknown publisher',
    issn: profile.issn || cleaned,
    eIssn: profile.eIssn,
    impactFactor,
    fiveYearImpactFactor: parseJif(impact?.jif5Years),
    immediacyIndex: parseJif(impact?.immediacyIndex),
    journalCitationIndicator: parseJif(impact?.jci),
    jcrQuartile: quartile,
    jifRanks: ranks,
    casZone: null,
    firstDecisionDays: null,
    indexing: [],
    apcUsd: null,
    primaryDiscipline: profile.categories?.filter(Boolean).join(', ') || '',
    aimsAndScopeSummary: '',
    verificationStatus: 'clarivate_api',
    provenanceSource: CLARIVATE_WOS_JOURNALS_SOURCE,
    isVerifiedClarivate: true,
    jcrYear,
    retrievedAt: retrieved,
    pageFeatures,
    reportingYear: String(jcrYear),
    sourceAttribution: `${CLARIVATE_WOS_JOURNALS_SOURCE} JCR ${jcrYear} (retrieved ${retrieved})`,
  };
}
