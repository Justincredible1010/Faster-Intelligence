import { ClarivateJournalMetrics } from '../types';
import { CLARIVATE_WOS_JOURNALS_SOURCE } from '../utils/metricSources';

/**
 * Facts Weibo posts and WeChat ads are allowed to cite.
 * Impact factor is included only when the journal record already has a
 * Clarivate value. Page-sourced impact factors are omitted. APC and
 * first-decision time may be cited when they are page facts, with the source.
 */
export interface CitedAmount {
  value: number;
  sourceZh: string;
  sourceEn: string;
  note: string;
}

export interface ClarivateImpact {
  value: number;
  year: number | null;
  /** Five-year figure, used only when the primary impact factor is absent. */
  fiveYear: boolean;
}

export interface ChinaCopyFacts {
  journalName: string;
  publisher: string;
  disciplineZh: string;
  impact: ClarivateImpact | null;
  apc: CitedAmount | null;
  firstDecisionDays: CitedAmount | null;
  factNotes: string[];
}

type FactRecord = Partial<ClarivateJournalMetrics> | null | undefined;

function sourceText(value: string | undefined | null): string {
  return (value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function fieldSource(facts: FactRecord, field: string): string {
  const mapped = facts?.provenanceMap?.[field]?.source;
  if (mapped) return sourceText(mapped);
  if (facts?.provenanceSource) return sourceText(facts.provenanceSource);
  return sourceText(facts?.verificationStatus);
}

function isCatalogOrMissing(source: string): boolean {
  return !source || source.includes('catalog') || source.includes('snapshot') || source.includes('missing');
}

function isPageSource(source: string): boolean {
  return source.includes('page') || source.includes('landing');
}

function isUserSource(source: string): boolean {
  return source.includes('user');
}

/** Clarivate only. A page, user, or catalog label never qualifies, even if it also says Clarivate. */
export function isClarivateImpactSource(source: string): boolean {
  if (!source || isPageSource(source) || isUserSource(source) || isCatalogOrMissing(source)) return false;
  return source === CLARIVATE_WOS_JOURNALS_SOURCE || source.includes('clarivate');
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function chineseDiscipline(raw: string | null | undefined): string {
  const text = raw || '';
  const wrapped = text.match(/（([^）]+)）|\(([^)]+)\)/);
  const inner = wrapped?.[1] || wrapped?.[2] || '';
  if (/[\u4e00-\u9fff]/.test(inner)) return inner.trim();
  return '';
}

function amountSource(source: string): Pick<CitedAmount, 'sourceZh' | 'sourceEn'> | null {
  if (isPageSource(source)) return { sourceZh: '期刊页面', sourceEn: 'journal page' };
  if (isUserSource(source)) return { sourceZh: '本次活动填写', sourceEn: 'supplied for this campaign' };
  if (isClarivateImpactSource(source)) return { sourceZh: 'Clarivate', sourceEn: 'Clarivate record' };
  return null;
}

function citedAmount(facts: FactRecord, field: 'apcUsd' | 'firstDecisionDays', label: string): CitedAmount | null {
  const value = finiteNumber(facts?.[field]);
  if (value == null) return null;
  const source = fieldSource(facts, field);
  const names = amountSource(source);
  if (!names) return null;
  return {
    value,
    sourceZh: names.sourceZh,
    sourceEn: names.sourceEn,
    note: `${label} ${value} is cited from the ${names.sourceEn}.`,
  };
}

function clarivateImpact(facts: FactRecord): ClarivateImpact | null {
  const year = typeof facts?.jcrYear === 'number' ? facts.jcrYear : null;
  const primarySource = fieldSource(facts, 'impactFactor');
  const primary = finiteNumber(facts?.impactFactor);
  if (primary != null && isClarivateImpactSource(primarySource)) {
    return { value: primary, year, fiveYear: false };
  }
  const fiveSource = fieldSource(facts, 'fiveYearImpactFactor');
  const fiveYear = finiteNumber(facts?.fiveYearImpactFactor);
  if (fiveYear != null && isClarivateImpactSource(fiveSource)) {
    return { value: fiveYear, year, fiveYear: true };
  }
  return null;
}

function impactNote(facts: FactRecord, impact: ClarivateImpact | null): string {
  if (impact) {
    const which = impact.fiveYear ? '5-year impact factor' : 'Impact factor';
    const year = impact.year ? ` (JCR ${impact.year})` : '';
    return `${which} ${impact.value} is the Clarivate value already on the journal record${year}.`;
  }
  const stored = finiteNumber(facts?.impactFactor);
  if (stored == null) {
    return 'Impact factor omitted. This journal record has no Clarivate impact factor.';
  }
  const source = fieldSource(facts, 'impactFactor');
  if (isPageSource(source)) {
    return 'Impact factor omitted. The number on this record is page-sourced, so it stays out of the copy.';
  }
  if (isCatalogOrMissing(source)) {
    return 'Impact factor omitted. Catalog snapshot numbers are not cited.';
  }
  return 'Impact factor omitted. Only a Clarivate value already on the journal record can appear in this copy.';
}

export function chinaCopyFacts(facts: FactRecord): ChinaCopyFacts {
  const impact = clarivateImpact(facts);
  const apc = citedAmount(facts, 'apcUsd', 'APC');
  const firstDecisionDays = citedAmount(facts, 'firstDecisionDays', 'First decision');
  const factNotes = [impactNote(facts, impact)];
  if (apc) factNotes.push(apc.note);
  else if (finiteNumber(facts?.apcUsd) != null) {
    factNotes.push('APC omitted. Only a page fact, or a value supplied for this campaign, can be cited, and it must keep its source.');
  }
  if (firstDecisionDays) factNotes.push(firstDecisionDays.note);
  else if (finiteNumber(facts?.firstDecisionDays) != null) {
    factNotes.push('First-decision time omitted. Only a page fact, or a value supplied for this campaign, can be cited, and it must keep its source.');
  }
  return {
    journalName: (facts?.journalName || '').trim() || '本期刊',
    publisher: (facts?.publisher || '').trim() || 'Springer Nature',
    disciplineZh: chineseDiscipline(facts?.primaryDiscipline),
    impact,
    apc,
    firstDecisionDays,
    factNotes,
  };
}
