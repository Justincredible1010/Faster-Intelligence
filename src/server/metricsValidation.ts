const ALLOWED_FACT_FIELDS = [
  'url',
  'journalName',
  'publisher',
  'impactFactor',
  'fiveYearImpactFactor',
  'jcrQuartile',
  'casZone',
  'firstDecisionDays',
  'indexing',
  'openAccessType',
  'apcUsd',
  'chinaWaiverAvailable',
  'aimsAndScopeSummary',
  'primaryDiscipline',
  'sourceAttribution',
  'reportingYear',
  'jcrYear',
  'verificationStatus',
  'provenanceSource',
  'isVerifiedClarivate',
  'missingFields',
  'retrievedAt',
  'wosJournalId',
  'issn',
  'eIssn',
  'jifRanks',
  'immediacyIndex',
  'journalCitationIndicator',
  'catalogDataYear',
] as const;

const VERIFICATION_STATUSES = new Set([
  'user_provided',
  'page_sourced',
  'clarivate_api',
  'catalog_snapshot',
  'missing',
]);

const PROVENANCE_SOURCES = new Set([
  'user_provided',
  'page_sourced',
  'clarivate_wos_journals_api',
  'catalog_snapshot',
  'missing',
]);

const ALLOWED = new Set<string>(ALLOWED_FACT_FIELDS);

/**
 * Fields a lookup response adds, or that the catalog carries, and that the
 * browser must not have to strip before an edit can be saved. Unknown keys
 * outside this set and the allowlist are still rejected.
 */
const READ_ONLY_SERVER_FIELDS = new Set([
  'slugs',
  'isFromCache',
  'cachedAt',
  'cacheExpiresAt',
  'extractedFacts',
  'provenanceMap',
  'submissionPortalUrl',
  'authorGuidelinesUrl',
  'articleDownloads',
  'fullTextViews',
  'pageFeatures',
]);

/** Public label for user-entered metrics. Never include an email address here. */
export const MANUAL_METRIC_SOURCE = 'Manually entered (unverified)';

export class MetricsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MetricsValidationError';
  }
}

export interface SanitizedJournalMetrics {
  url: string;
  journalName: string;
  publisher: string;
  impactFactor: number | null;
  fiveYearImpactFactor: number | null;
  jcrQuartile: string | null;
  casZone: string | null;
  firstDecisionDays: number | null;
  indexing: string[];
  openAccessType: string | null;
  apcUsd: number | null;
  chinaWaiverAvailable: boolean;
  aimsAndScopeSummary: string;
  primaryDiscipline: string;
  sourceAttribution: string;
  reportingYear: string;
  jcrYear: number;
  verificationStatus: 'user_provided';
  provenanceSource: 'user_provided';
  isVerifiedClarivate: false;
  issn?: string;
  eIssn?: string;
}

function fail(message: string): never {
  throw new MetricsValidationError(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function readString(value: unknown, field: string, max: number, required = false): string | null {
  if (value === undefined || value === null || value === '') {
    if (required) fail(`${field} is required`);
    return null;
  }
  if (typeof value !== 'string') fail(`${field} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) {
    if (required) fail(`${field} is required`);
    return null;
  }
  if (trimmed.length > max || /[\u0000-\u001f\u007f]/.test(trimmed)) fail(`${field} is invalid`);
  return trimmed;
}

function readNumber(
  value: unknown,
  field: string,
  bounds: { min: number; max: number; integer?: boolean }
): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${field} must be a finite number or null`);
  if (bounds.integer && !Number.isInteger(value)) fail(`${field} must be an integer or null`);
  if (value < bounds.min || value > bounds.max) fail(`${field} is out of range`);
  return value;
}

function readHttpUrl(value: unknown): string {
  const raw = readString(value, 'url', 2000, true);
  if (!raw) fail('url is required');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    fail('url must be an http(s) URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') fail('url must be an http(s) URL');
  if (url.username || url.password) fail('url must not include credentials');
  if (!url.hostname) fail('url must be an http(s) URL');
  return url.toString();
}

function readIndexing(value: unknown): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 30) fail('indexing must be an array of up to 30 strings');
  return value.map((item, index) => {
    const text = readString(item, `indexing[${index}]`, 80, true);
    return text || '';
  });
}

function assertKnownStatus(facts: Record<string, unknown>): void {
  if (facts.verificationStatus !== undefined && !VERIFICATION_STATUSES.has(String(facts.verificationStatus))) {
    fail('verificationStatus is not a known status');
  }
  if (facts.provenanceSource !== undefined && !PROVENANCE_SOURCES.has(String(facts.provenanceSource))) {
    fail('provenanceSource is not a known source');
  }
  if (facts.isVerifiedClarivate !== undefined && typeof facts.isVerifiedClarivate !== 'boolean') {
    fail('isVerifiedClarivate must be a boolean');
  }
}

function assertOptionalProvenanceShape(facts: Record<string, unknown>): void {
  if (facts.retrievedAt !== undefined) readString(facts.retrievedAt, 'retrievedAt', 80);
  if (facts.wosJournalId !== undefined) readString(facts.wosJournalId, 'wosJournalId', 80);
  if (facts.catalogDataYear !== undefined && facts.catalogDataYear !== null) {
    readNumber(facts.catalogDataYear, 'catalogDataYear', { min: 1900, max: 2100, integer: true });
  }
  if (facts.immediacyIndex !== undefined) {
    readNumber(facts.immediacyIndex, 'immediacyIndex', { min: 0, max: 500 });
  }
  if (facts.journalCitationIndicator !== undefined) {
    readNumber(facts.journalCitationIndicator, 'journalCitationIndicator', { min: 0, max: 500 });
  }
  if (facts.jifRanks !== undefined && facts.jifRanks !== null) {
    if (!Array.isArray(facts.jifRanks) || facts.jifRanks.length > 40) fail('jifRanks must be an array of up to 40 objects');
    for (const rank of facts.jifRanks) {
      if (!isPlainObject(rank)) fail('jifRanks must be an array of objects');
    }
  }
}

/**
 * Anything a browser submits is stored as user-entered. Client values for
 * verificationStatus, provenanceSource, and isVerifiedClarivate are ignored
 * so a hand-edited number cannot keep a Clarivate label.
 */
export function sanitizeUserProvidedFacts(facts: unknown): SanitizedJournalMetrics {
  if (!isPlainObject(facts)) fail('facts must be an object');
  if (
    Object.prototype.hasOwnProperty.call(facts, '__proto__') ||
    Object.prototype.hasOwnProperty.call(facts, 'constructor') ||
    Object.prototype.hasOwnProperty.call(facts, 'prototype')
  ) {
    fail('Unknown journal metric fields');
  }
  const unknown = Object.keys(facts).filter((key) => !ALLOWED.has(key) && !READ_ONLY_SERVER_FIELDS.has(key));
  if (unknown.length > 0) fail(`Unknown journal metric fields: ${unknown.sort().join(', ')}`);

  assertKnownStatus(facts);
  assertOptionalProvenanceShape(facts);
  if (facts.missingFields !== undefined) {
    if (!Array.isArray(facts.missingFields) || facts.missingFields.some((item) => typeof item !== 'string')) {
      fail('missingFields must be an array of strings');
    }
  }

  const journalName = readString(facts.journalName, 'journalName', 300, true);
  if (!journalName) fail('journalName is required');
  const jcrYear = readJcrYear(facts.jcrYear);
  if (facts.sourceAttribution !== undefined) readString(facts.sourceAttribution, 'sourceAttribution', 500);
  if (facts.reportingYear !== undefined) readString(facts.reportingYear, 'reportingYear', 80);

  return {
    url: readHttpUrl(facts.url),
    journalName,
    publisher: readString(facts.publisher, 'publisher', 200) || 'Springer Nature',
    impactFactor: readNumber(facts.impactFactor, 'impactFactor', { min: 0, max: 500 }),
    fiveYearImpactFactor: readNumber(facts.fiveYearImpactFactor, 'fiveYearImpactFactor', { min: 0, max: 500 }),
    jcrQuartile: readString(facts.jcrQuartile, 'jcrQuartile', 40),
    casZone: readString(facts.casZone, 'casZone', 120),
    firstDecisionDays: readNumber(facts.firstDecisionDays, 'firstDecisionDays', { min: 0, max: 3650, integer: true }),
    indexing: readIndexing(facts.indexing),
    openAccessType: readString(facts.openAccessType, 'openAccessType', 80),
    apcUsd: readNumber(facts.apcUsd, 'apcUsd', { min: 0, max: 100000, integer: true }),
    chinaWaiverAvailable: facts.chinaWaiverAvailable === undefined || facts.chinaWaiverAvailable === null
      ? false
      : typeof facts.chinaWaiverAvailable === 'boolean'
        ? facts.chinaWaiverAvailable
        : fail('chinaWaiverAvailable must be a boolean'),
    aimsAndScopeSummary: readString(facts.aimsAndScopeSummary, 'aimsAndScopeSummary', 4000) || '',
    primaryDiscipline: readString(facts.primaryDiscipline, 'primaryDiscipline', 200) || '',
    issn: readString(facts.issn, 'issn', 32) || undefined,
    eIssn: readString(facts.eIssn, 'eIssn', 32) || undefined,
    sourceAttribution: MANUAL_METRIC_SOURCE,
    reportingYear: `JCR ${jcrYear}`,
    jcrYear,
    verificationStatus: 'user_provided',
    provenanceSource: 'user_provided',
    isVerifiedClarivate: false,
  };
}

export function validateJournalMetricsUpdate(body: unknown): SanitizedJournalMetrics {
  if (!isPlainObject(body)) fail('A journal metrics object is required');
  const topKeys = Object.keys(body);
  if (topKeys.some((key) => key !== 'facts') || !Object.prototype.hasOwnProperty.call(body, 'facts')) {
    fail('Request must contain only a facts object');
  }
  return sanitizeUserProvidedFacts(body.facts);
}

function readJcrYear(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1900 || value > 2100) {
    fail('jcrYear must be a 4-digit year');
  }
  return value;
}
