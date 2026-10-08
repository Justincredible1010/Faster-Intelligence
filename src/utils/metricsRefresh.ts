import { ClarivateJournalMetrics } from '../types';
import { normalizeIssn } from './issn';
import { lookupMetricsByIssn } from './metricSources';
import { getMetricsStore, JournalMetricsRecord, MetricsStore } from './metricsStore';

/**
 * JCR releases land around late June. On and after 30 June UTC the expected
 * edition is last calendar year. Before that, it is the year before last.
 * 8 October 2026 → 2025. 15 January 2026 → 2024.
 */
export const JCR_RELEASE_MONTH_INDEX = 5;
export const JCR_RELEASE_DAY = 30;

export function expectedLatestJcrYear(now: Date = new Date()): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const released = month > JCR_RELEASE_MONTH_INDEX || (month === JCR_RELEASE_MONTH_INDEX && day >= JCR_RELEASE_DAY);
  return released ? year - 1 : year - 2;
}

export function sameUtcDay(isoTimestamp: string, now: Date): boolean {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) return false;
  return (
    parsed.getUTCFullYear() === now.getUTCFullYear() &&
    parsed.getUTCMonth() === now.getUTCMonth() &&
    parsed.getUTCDate() === now.getUTCDate()
  );
}

export function metricsRecordFromFacts(metrics: ClarivateJournalMetrics): JournalMetricsRecord | null {
  const issn = normalizeIssn(metrics.issn);
  if (!issn || metrics.jcrYear == null || !metrics.wosJournalId) return null;
  return {
    issn,
    eIssn: normalizeIssn(metrics.eIssn) || null,
    jcrYear: metrics.jcrYear,
    wosJournalId: metrics.wosJournalId,
    source: 'clarivate_wos_journals_api',
    retrievedAt: metrics.retrievedAt || new Date().toISOString(),
    metrics: {
      ...metrics,
      issn,
      provenanceSource: 'clarivate_wos_journals_api',
      isVerifiedClarivate: true,
      verificationStatus: 'clarivate_api',
    },
  };
}

export interface LoadJournalMetricsOptions {
  /** Admin refresh. Skips the stored-year and once-per-day checks. */
  force?: boolean;
  now?: Date;
  store?: MetricsStore;
  lookup?: typeof lookupMetricsByIssn;
}

/**
 * Serve stored Clarivate metrics without calling the API.
 * A newer JCR year is checked only when the stored edition is behind the
 * expected release, and at most once per ISSN per UTC day.
 */
export async function loadJournalMetrics(
  issn: string,
  options: LoadJournalMetricsOptions = {}
): Promise<ClarivateJournalMetrics | null> {
  const normalized = normalizeIssn(issn);
  if (!normalized) return null;
  const now = options.now ?? new Date();
  const store = options.store ?? (await getMetricsStore());
  const lookup = options.lookup ?? lookupMetricsByIssn;
  const stored = await store.getLatestByIssn(normalized);
  const expected = expectedLatestJcrYear(now);

  if (!options.force && stored && stored.jcrYear >= expected) {
    return stored.metrics;
  }

  const yearIsBehind = !!stored && stored.jcrYear < expected;
  if (!options.force && yearIsBehind) {
    const lastCheck = await store.getLastYearCheck(normalized);
    if (lastCheck && sameUtcDay(lastCheck, now)) return stored.metrics;
  }

  const fresh = await lookup(normalized, undefined, now);
  const resolvedYear = fresh?.jcrYear ?? stored?.jcrYear ?? null;
  const resolvedIsBehind = resolvedYear != null && resolvedYear < expected;
  if (options.force || resolvedIsBehind) {
    await store.setLastYearCheck(normalized, now.toISOString());
  }
  if (!fresh) return stored?.metrics ?? null;

  const record = metricsRecordFromFacts(fresh);
  if (record) await store.putMetrics(record);
  return fresh;
}
