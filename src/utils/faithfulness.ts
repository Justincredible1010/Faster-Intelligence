/**
 * Faithfulness check for generated ad copy.
 *
 * guardMetricClaims strips known metric patterns. This check is the backstop: every number,
 * superlative, indexing claim and publisher name in a line must be supported by the journal's
 * facts (page-sourced, user-provided or Clarivate). A line that drifts is rejected whole, so the
 * ad never shows a half-stripped sentence.
 */
import type { ClarivateJournalMetrics } from '../types';
import {
  metricsAreTrusted,
  trustedApcUsd,
  trustedArticleDownloads,
  trustedFirstDecisionDays,
  trustedFiveYearImpactFactor,
  trustedFullTextViews,
  trustedImpactFactor,
} from './metricClaims';

type Facts = (Partial<ClarivateJournalMetrics> & Record<string, any>) | null | undefined;

export interface FaithfulnessResult {
  ok: boolean;
  problems: string[];
}

function fold(text: string): string {
  return text
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ');
}

/** Text the copy may legitimately echo: names, aims, indexing, page features. */
function sourceText(facts: Facts): string {
  if (!facts) return '';
  const parts: unknown[] = [
    facts.journalName,
    facts.publisher,
    facts.aimsAndScopeSummary,
    facts.openAccessType,
    facts.reportingYear,
    facts.jcrYear,
    ...(facts.indexing || []),
    ...((facts.pageFeatures || []) as Array<{ text?: string; label?: string }>).flatMap((f) => [f.text, f.label]),
    ...((facts.extractedFacts?.pageMetrics || []) as Array<{ value?: string; year?: number | null }>).flatMap((m) => [m.value, m.year]),
  ];
  return fold(parts.filter((p) => p !== null && p !== undefined).map(String).join(' \n '));
}

const MULTIPLIERS: Record<string, number> = {
  k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9, '万': 1e4, '萬': 1e4, '亿': 1e8, '億': 1e8,
};

const NUMBER_TOKEN = /(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(million|billion|thousand|[kmb](?![a-z])|万|萬|亿|億)?(\s*%|\s*％)?/gi;

function close(a: number, b: number): boolean {
  if (a === b) return true;
  // "10.4M" for 10,400,000 or "1040万" for 10,400,000: allow rounding to the shown precision.
  return Math.abs(a - b) / Math.max(Math.abs(b), 1) < 0.01;
}

function allowedValues(facts: Facts, source: string): number[] {
  const values = [
    trustedImpactFactor(facts),
    trustedFiveYearImpactFactor(facts),
    trustedFirstDecisionDays(facts),
    trustedApcUsd(facts),
    trustedArticleDownloads(facts),
    trustedFullTextViews(facts),
  ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (metricsAreTrusted(facts)) {
    for (const entry of (facts?.jifRanks || []) as Array<{ rank?: string; jifPercentile?: string | number }>) {
      for (const part of (entry.rank || '').split('/')) if (part.trim()) values.push(Number(part));
      const pct = Number(entry.jifPercentile);
      if (Number.isFinite(pct)) values.push(Math.max(1, Math.ceil(100 - pct)), Number((100 - pct).toFixed(1)));
    }
  }
  for (const m of source.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)) {
    values.push(Number(m[0].replace(/,/g, '')));
  }
  return values;
}

const SUPERLATIVES: Array<{ re: RegExp; label: string }> = [
  { re: /#\s?1\b|\bno\.?\s?1\b|\bnumber\s+one\b/i, label: '#1 claim' },
  { re: /\b(?:the\s+)?best\b/i, label: '"best"' },
  { re: /\bleading\b/i, label: '"leading"' },
  { re: /\btop[-\s]?(?:ranked|tier|rated)\b/i, label: '"top-ranked"' },
  { re: /\bworld[-\s]?class\b/i, label: '"world-class"' },
  { re: /\bfastest\b/i, label: '"fastest"' },
  { re: /\bguarantee[sd]?\b/i, label: 'guarantee' },
  { re: /\bmost\s+(?:prestigious|cited|influential|trusted)\b/i, label: '"most …"' },
  { re: /\bprestigious\b/i, label: '"prestigious"' },
  { re: /最快|最好|最佳|顶级|顶尖|第一|权威|保证|必中|包录用|一流|最权威/, label: 'Chinese superlative' },
  { re: /最速|最高|最良|トップ|保証|一流|確実|必ず/, label: 'Japanese superlative' },
];

const INDEX_CLAIMS: Array<{ re: RegExp; label: string; supportedBy: RegExp }> = [
  { re: /\bSCIE\b|Science Citation Index/i, label: 'SCIE', supportedBy: /SCIE|Science Citation Index Expanded/i },
  { re: /\bSSCI\b|Social Science Citation Index/i, label: 'SSCI', supportedBy: /SSCI|Social Science Citation Index/i },
  { re: /\bScopus\b/i, label: 'Scopus', supportedBy: /Scopus/i },
  { re: /\bPubMed\b|\bMedline\b/i, label: 'PubMed/Medline', supportedBy: /PubMed|Medline/i },
  { re: /\bDOAJ\b/i, label: 'DOAJ', supportedBy: /DOAJ/i },
  { re: /\bEI\b(?:\s+Compendex)?/, label: 'EI Compendex', supportedBy: /\bEI\b|Compendex/i },
  { re: /Web of Science|\bWoS\b/i, label: 'Web of Science', supportedBy: /Web of Science|Citation Index|SCIE|SSCI|Clarivate/i },
];

const OTHER_PUBLISHERS = /\b(Elsevier|Wiley|Taylor\s*&\s*Francis|MDPI|Frontiers|IEEE|SAGE|Oxford University Press|Cambridge University Press|PLOS|Hindawi)\b/i;

export function checkFaithfulness(text: string, facts: Facts): FaithfulnessResult {
  const problems: string[] = [];
  if (!text || !text.trim()) return { ok: true, problems };
  const line = fold(text);
  const source = sourceText(facts);
  const allowed = allowedValues(facts, source);
  const indexing = (facts?.indexing || []).join(' | ') + ' ' + (facts?.verificationStatus === 'clarivate_api' ? 'Clarivate' : '');

  for (const m of line.matchAll(NUMBER_TOKEN)) {
    const raw = m[0].trim();
    const base = Number(m[1].replace(/,/g, ''));
    if (!Number.isFinite(base)) continue;
    // Ordinals ("1st Decision") are wording, not claims.
    if (/^(?:st|nd|rd|th)\b/i.test(line.slice((m.index ?? 0) + m[0].length))) continue;
    // "Version 2.0", "v3" are product wording, not claims.
    if (/\b(?:version|ver\.?|v)\s*$/i.test(line.slice(0, m.index ?? 0))) continue;
    // Quartile / CAS zone labels ("Q2", "2区") are checked against the record's labels.
    const before = line.slice(0, m.index ?? 0);
    const after = line.slice((m.index ?? 0) + m[0].length);
    if (/Q$/i.test(before) && !m[2] && !m[3]) {
      if (String(facts?.jcrQuartile || '').toUpperCase() === `Q${m[1]}`) continue;
      problems.push(`Quartile "Q${m[1]}" is not on the journal record`);
      continue;
    }
    if (/^\s*区/.test(after) && !m[2] && !m[3]) {
      if (String(facts?.casZone || '').includes(m[1])) continue;
      problems.push(`CAS zone "${m[1]}区" is not on the journal record`);
      continue;
    }
    const unit = (m[2] || '').toLowerCase();
    const value = unit ? base * (MULTIPLIERS[unit] ?? 1) : base;
    if (allowed.some((a) => close(value, a) || close(base, a))) continue;
    problems.push(m[3] ? `Percentage "${raw}" is not on the journal record` : `Number "${raw}" is not on the journal record`);
  }

  for (const { re, label } of SUPERLATIVES) {
    const hit = line.match(re);
    if (hit && label === '#1 claim' && metricsAreTrusted(facts) && ((facts?.jifRanks || []) as Array<{ rank?: string }>).some((e) => /^\s*1\s*\//.test(e.rank || ''))) continue;
    if (hit && !new RegExp(hit[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(source)) {
      problems.push(`Unsupported claim ${label}`);
    }
  }

  for (const { re, label, supportedBy } of INDEX_CLAIMS) {
    if (re.test(line) && !supportedBy.test(indexing)) problems.push(`Indexing claim "${label}" is not on the journal record`);
  }

  const publisher = line.match(OTHER_PUBLISHERS);
  if (publisher && !new RegExp(publisher[1], 'i').test(source)) {
    problems.push(`Mentions another publisher "${publisher[1]}"`);
  }

  return { ok: problems.length === 0, problems };
}
