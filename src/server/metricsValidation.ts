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
  'isVerifiedClarivate',
  'missingFields',
] as const;

const ALLOWED = new Set<string>(ALLOWED_FACT_FIELDS);

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

export function validateJournalMetricsUpdate(body: unknown): SanitizedJournalMetrics {
  if (!isPlainObject(body)) fail('A journal metrics object is required');
  const topKeys = Object.keys(body);
  if (topKeys.some((key) => key !== 'facts') || !Object.prototype.hasOwnProperty.call(body, 'facts')) {
    fail('Request must contain only a facts object');
  }
  const facts = body.facts;
  if (!isPlainObject(facts)) fail('facts must be an object');
  if (
    Object.prototype.hasOwnProperty.call(facts, '__proto__') ||
    Object.prototype.hasOwnProperty.call(facts, 'constructor') ||
    Object.prototype.hasOwnProperty.call(facts, 'prototype')
  ) {
    fail('Unknown journal metric fields');
  }
  const unknown = Object.keys(facts).filter((key) => !ALLOWED.has(key));
  if (unknown.length > 0) fail(`Unknown journal metric fields: ${unknown.sort().join(', ')}`);

  if (facts.verificationStatus !== undefined && facts.verificationStatus !== 'user_provided') {
    fail('verificationStatus cannot be set by the client');
  }
  if (facts.isVerifiedClarivate !== undefined && facts.isVerifiedClarivate !== false) {
    fail('isVerifiedClarivate cannot be set by the client');
  }
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
    sourceAttribution: MANUAL_METRIC_SOURCE,
    reportingYear: `JCR ${jcrYear}`,
    jcrYear,
  };
}

function readJcrYear(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1900 || value > 2100) {
    fail('jcrYear must be a 4-digit year');
  }
  return value;
}
