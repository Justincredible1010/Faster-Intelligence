/**
 * Journal metrics database: one provenance model for every metric field.
 *
 * Main's Clarivate store (ISSN + JCR year, filled only from the Web of Science
 * Journals API) stays the single authority for Impact Factor, five-year IF and
 * quartile. This module never accepts those three fields from a file or a user:
 * it fills them from a Clarivate record or leaves them missing.
 *
 * Every other field (CAS zone, first-decision days, APC, open-access type,
 * indexing) keeps the value, year, source and expiry it was saved with, but its
 * status is never "verified" unless a server-side source set it. Values loaded
 * from the AI Studio metrics-database.json are hand-entered, so they load as
 * "unverified" and ad copy does not use them.
 */
import fs from 'fs';
import type { ClarivateJournalMetrics, JournalMetricsDatabaseRecord, MetricRecord } from '../types';

export const CLARIVATE_ONLY_FIELDS = ['impactFactor', 'fiveYearImpactFactor', 'jcrQuartile'] as const;
export const SUPPLEMENTARY_FIELDS = ['casZone', 'firstDecisionDays', 'apcUsd', 'openAccessType', 'indexing'] as const;
export const CLARIVATE_SOURCE_LABEL = 'Clarivate Web of Science Journals API';

type MetricKey = keyof JournalMetricsDatabaseRecord['metrics'];

export class MetricsDatabaseError extends Error {
  status = 400;
}

function missing<T>(value: T): MetricRecord<T> {
  return { value, year: 0, period: '', source: '', verifiedAt: '', expireAt: '', status: 'missing' };
}

function emptyMetrics(): JournalMetricsDatabaseRecord['metrics'] {
  return {
    impactFactor: missing<number | null>(null),
    fiveYearImpactFactor: missing<number | null>(null),
    jcrQuartile: missing<string | null>(null),
    casZone: missing<string | null>(null),
    firstDecisionDays: missing<number | null>(null),
    apcUsd: missing<number | null>(null),
    openAccessType: missing<string | null>(null),
    indexing: missing<string[]>([]),
  };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function supplementaryValueOk(key: MetricKey, value: unknown): boolean {
  if (value === null) return true;
  if (key === 'firstDecisionDays') return Number.isInteger(value) && (value as number) > 0 && (value as number) < 1000;
  if (key === 'apcUsd') return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 100000;
  if (key === 'indexing') return Array.isArray(value) && value.every((v) => typeof v === 'string' && v.length <= 60);
  return typeof value === 'string' && value.length > 0 && value.length <= 120;
}

/** File and client data: Clarivate-only fields are dropped, the rest is labelled and never "verified". */
export function sanitizeDatabaseRecord(raw: any): JournalMetricsDatabaseRecord | null {
  const canonicalUrl = str(raw?.canonicalUrl);
  if (!/^https:\/\//.test(canonicalUrl)) return null;
  const metrics = emptyMetrics();
  for (const key of SUPPLEMENTARY_FIELDS) {
    const m = raw?.metrics?.[key];
    if (!m || m.value === null || m.value === undefined || !supplementaryValueOk(key, m.value)) continue;
    const source = str(m.source);
    if (!source) continue; // a value with no source is not kept
    (metrics as any)[key] = {
      value: m.value,
      year: Number.isInteger(m.year) ? m.year : 0,
      period: str(m.period),
      source,
      verifiedAt: str(m.verifiedAt),
      expireAt: str(m.expireAt),
      status: m.status === 'user_provided' ? 'user_provided' : 'unverified',
    };
  }
  return {
    journalId: str(raw?.journalId),
    journalName: str(raw?.journalName),
    publisher: str(raw?.publisher),
    canonicalUrl,
    slugs: Array.isArray(raw?.slugs) ? raw.slugs.filter((s: unknown) => typeof s === 'string' && s) : [],
    metrics,
    aimsAndScopeSummary: str(raw?.aimsAndScopeSummary),
    primaryDiscipline: str(raw?.primaryDiscipline),
    submissionPortalUrl: /^https:\/\//.test(str(raw?.submissionPortalUrl)) ? str(raw.submissionPortalUrl) : undefined,
    lastUpdated: str(raw?.lastUpdated),
    lastAccess: str(raw?.lastAccess),
  };
}

function nextJcrExpiry(jcrYear: number): string {
  return new Date(Date.UTC(jcrYear + 2, 5, 30, 23, 59, 59)).toISOString();
}

/** Fill IF / 5-year IF / quartile from a Clarivate API record, or leave them missing. */
export function withClarivateMetrics(
  record: JournalMetricsDatabaseRecord,
  clarivate: ClarivateJournalMetrics | null | undefined,
  retrievedAt?: string
): JournalMetricsDatabaseRecord {
  const metrics = { ...record.metrics };
  for (const key of CLARIVATE_ONLY_FIELDS) (metrics as any)[key] = missing(null);
  const c: any = clarivate;
  if (c && Number.isInteger(c.jcrYear)) {
    const base = {
      year: c.jcrYear,
      period: `JCR ${c.jcrYear}`,
      source: CLARIVATE_SOURCE_LABEL,
      verifiedAt: retrievedAt || '',
      expireAt: nextJcrExpiry(c.jcrYear),
      status: 'verified' as const,
    };
    if (typeof c.impactFactor === 'number') metrics.impactFactor = { ...base, value: c.impactFactor };
    if (typeof c.fiveYearImpactFactor === 'number') metrics.fiveYearImpactFactor = { ...base, value: c.fiveYearImpactFactor };
    if (typeof c.jcrQuartile === 'string' && c.jcrQuartile) metrics.jcrQuartile = { ...base, value: c.jcrQuartile };
  }
  return { ...record, metrics };
}

/** Admin edit of supplementary fields. Rejects any attempt to set Clarivate-only fields. */
export function applyDatabaseUpdate(
  existing: JournalMetricsDatabaseRecord | null,
  journal: any,
  editorEmail: string,
  now: Date = new Date()
): JournalMetricsDatabaseRecord {
  for (const key of CLARIVATE_ONLY_FIELDS) {
    const v = journal?.metrics?.[key]?.value ?? journal?.[key];
    if (v !== undefined && v !== null) {
      throw new MetricsDatabaseError(`${key} comes only from the Clarivate API and cannot be edited here`);
    }
  }
  const base = sanitizeDatabaseRecord({ ...(existing || {}), ...journal, metrics: existing?.metrics });
  if (!base) throw new MetricsDatabaseError('Journal object with an https canonicalUrl is required');
  const metrics = { ...base.metrics };
  for (const key of SUPPLEMENTARY_FIELDS) {
    const m = journal?.metrics?.[key];
    if (m === undefined) continue;
    if (m === null || m.value === null) {
      (metrics as any)[key] = missing(key === 'indexing' ? [] : null);
      continue;
    }
    if (!supplementaryValueOk(key, m.value)) throw new MetricsDatabaseError(`Invalid value for ${key}`);
    const source = str(m.source);
    if (!source) throw new MetricsDatabaseError(`${key} needs a source`);
    (metrics as any)[key] = {
      value: m.value,
      year: Number.isInteger(m.year) ? m.year : now.getUTCFullYear(),
      period: str(m.period),
      source: `${source} (entered by ${editorEmail})`,
      verifiedAt: now.toISOString(),
      expireAt: str(m.expireAt),
      status: 'user_provided',
    };
  }
  return { ...base, metrics, lastUpdated: now.toISOString() };
}

export function loadMetricsDatabaseFile(filePath: string): JournalMetricsDatabaseRecord[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const values = Array.isArray(parsed) ? parsed : Object.values(parsed ?? {});
    return values.map(sanitizeDatabaseRecord).filter((r): r is JournalMetricsDatabaseRecord => Boolean(r));
  } catch (err) {
    console.warn('[Metrics DB] could not read database file:', err instanceof Error ? err.message : err);
    return [];
  }
}

export function saveMetricsDatabaseFile(filePath: string, records: JournalMetricsDatabaseRecord[]): void {
  const out: Record<string, JournalMetricsDatabaseRecord> = {};
  for (const r of records) out[r.canonicalUrl] = withClarivateMetrics(r, null);
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(out, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}
