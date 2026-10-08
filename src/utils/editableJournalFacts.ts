import { ClarivateJournalMetrics } from '../types';

/**
 * Fields a person can send back after editing a lookup.
 * Cache metadata, slugs, and other server-only fields stay off this list.
 */
export const EDITABLE_JOURNAL_FACT_FIELDS = [
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
  'issn',
  'eIssn',
] as const;

export function pickEditableJournalFacts(facts: ClarivateJournalMetrics): ClarivateJournalMetrics {
  const source = facts as unknown as Record<string, unknown>;
  const picked: Record<string, unknown> = {};
  for (const key of EDITABLE_JOURNAL_FACT_FIELDS) {
    if (source[key] !== undefined) picked[key] = source[key];
  }
  return picked as unknown as ClarivateJournalMetrics;
}
