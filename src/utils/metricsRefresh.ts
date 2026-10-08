import { ClarivateJournalMetrics } from '../types';
import { normalizeIssn } from './issn';
import { LookupOutcome, lookupJournalByIssn, lookupMetricsByIssn } from './metricSources';
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
  /** Test double that can report not-found and no-JIF, not only a metrics object. */
  resolve?: (issn: string, retrievedAt: Date) => Promise<LookupOutcome>;
}

async function resolveOutcome(issn: string, now: Date, options: LoadJournalMetricsOptions): Promise<LookupOutcome> {
  if (options.resolve) return options.resolve(issn, now);
  if (options.lookup) {
    const metrics = await options.lookup(issn, undefined, now);
    return metrics ? { kind: 'metrics', metrics } : { kind: 'unavailable' };
  }
  return lookupJournalByIssn(issn, undefined, now);
}

/**
 * Serve stored Clarivate metrics without calling the API.
 * A newer JCR year is checked only when the stored edition is behind the
 * expected release, and at most once per ISSN per UTC day.
 * An ISSN with no hit, and a journal with no JCR year or no JIF, are stored
 * on the ISSN mapping and rechecked at most once per UTC day.
 */
export async function loadJournalMetrics(
  issn: string,
  options: LoadJournalMetricsOptions = {}
): Promise<ClarivateJournalMetrics | null> {
  const normalized = normalizeIssn(issn);
  if (!normalized) return null;
  const now = options.now ?? new Date();
  const store = options.store ?? (await getMetricsStore());
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

  if (!options.force) {
    const mapping = await store.getIdMapping(normalized);
    const stateAt = mapping?.lookupStateAt;
    if (mapping?.lookupState && stateAt && sameUtcDay(stateAt, now)) {
      if (mapping.lookupState === 'not_found') return null;
      return stored?.metrics ?? null;
    }
  }

  const outcome = await resolveOutcome(normalized, now, options);
  if (outcome.kind === 'not_found' || outcome.kind === 'no_metrics') {
    await store.rememberLookupState(
      normalized,
      outcome.kind === 'not_found' ? 'not_found' : 'unavailable',
      now.toISOString(),
      outcome.kind === 'no_metrics' ? outcome.wosJournalId : undefined
    );
  }

  const fresh = outcome.kind === 'metrics' ? outcome.metrics : null;
  const resolvedYear = fresh?.jcrYear ?? stored?.jcrYear ?? null;
  const resolvedIsBehind = resolvedYear != null && resolvedYear < expected;
  if (options.force || resolvedIsBehind) {
    await store.setLastYearCheck(normalized, now.toISOString());
  }
  if (outcome.kind === 'not_found' || !fresh) return outcome.kind === 'not_found' ? null : stored?.metrics ?? null;

  const record = metricsRecordFromFacts(fresh);
  if (record) await store.putMetrics(record);
  return fresh;
}
