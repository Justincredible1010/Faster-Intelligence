import { ClarivateJournalMetrics, FactVerificationStatus } from '../types';
import { CLARIVATE_WOS_JOURNALS_SOURCE } from './metricSources';
import { formatUsageCount, parseUsageCount } from './usageCounts';

/** Numbers in ads may come only from these. A catalog snapshot is not one of them. */
export const TRUSTED_METRIC_STATUSES: readonly FactVerificationStatus[] = [
  'user_provided',
  'page_sourced',
  'clarivate_api',
];

type MetricCarrier = Partial<ClarivateJournalMetrics> | null | undefined;

export function metricsAreTrusted(facts: MetricCarrier): boolean {
  const status = facts?.verificationStatus;
  return !!status && (TRUSTED_METRIC_STATUSES as readonly string[]).includes(status);
}

/** True only when the numbers were returned by the Web of Science Journals API. */
export function metricsFromClarivateWos(facts: MetricCarrier): boolean {
  return facts?.provenanceSource === CLARIVATE_WOS_JOURNALS_SOURCE;
}

function fieldProvenance(facts: MetricCarrier, field: string): string | undefined {
  const map = (facts as { provenanceMap?: Record<string, { source?: string }> } | null | undefined)?.provenanceMap;
  return map?.[field]?.source;
}

function recordKeepsCatalogFields(facts: MetricCarrier): boolean {
  const map = (facts as { provenanceMap?: Record<string, { source?: string }> } | null | undefined)?.provenanceMap;
  if (!map) return false;
  return Object.values(map).some((item) => item?.source === 'catalog_snapshot');
}

/**
 * A page-sourced, user-supplied, or Clarivate API field is trusted.
 * A catalog snapshot field is not, even when another field on the same record came from the page.
 */
export function metricFieldIsTrusted(facts: MetricCarrier, field: string): boolean {
  const source = fieldProvenance(facts, field);
  if (source === 'catalog_snapshot') return false;
  if (
    source === 'page_sourced' ||
    source === 'landing_page' ||
    source === 'user_provided' ||
    source === 'clarivate_wos_journals_api'
  ) {
    return true;
  }
  if (recordKeepsCatalogFields(facts)) return false;
  return metricsAreTrusted(facts);
}

/**
 * An impact factor enters ads, prompts, and exports only from clarivate_wos_journals_api,
 * and only when the record has a JCR year so the number can be labelled.
 * Page, catalog, and hand-entered figures stay on the facts panel.
 */
export function impactFactorMayEnterCopy(facts: MetricCarrier, field: 'impactFactor' | 'fiveYearImpactFactor'): boolean {
  const source = fieldProvenance(facts, field);
  const clarivateField = source === 'clarivate_wos_journals_api';
  const clarivateRecord = !source && metricsFromClarivateWos(facts);
  if (!clarivateField && !clarivateRecord) return false;
  return typeof facts?.jcrYear === 'number' && Number.isInteger(facts.jcrYear);
}

/** Full label for a Clarivate impact factor: source, JCR year, and the number. */
export function clarivateImpactPhrase(
  facts: MetricCarrier,
  field: 'impactFactor' | 'fiveYearImpactFactor' = 'impactFactor'
): string | null {
  const value = field === 'impactFactor' ? trustedImpactFactor(facts) : trustedFiveYearImpactFactor(facts);
  if (value == null || facts?.jcrYear == null) return null;
  const name = field === 'impactFactor' ? 'IF' : '5-year IF';
  return `clarivate_wos_journals_api JCR ${facts.jcrYear} ${name} ${value}`;
}

function trustedNumber(facts: MetricCarrier, field: string, value: number | null | undefined): number | null {
  if (field === 'impactFactor' || field === 'fiveYearImpactFactor') {
    if (!impactFactorMayEnterCopy(facts, field)) return null;
  } else if (!metricFieldIsTrusted(facts, field)) {
    return null;
  }
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function trustedText(facts: MetricCarrier, field: string, value: string | null | undefined): string | null {
  if (!metricFieldIsTrusted(facts, field)) return null;
  const text = (value || '').trim();
  return text || null;
}

export function trustedImpactFactor(facts: MetricCarrier): number | null {
  return trustedNumber(facts, 'impactFactor', facts?.impactFactor);
}

export function trustedFiveYearImpactFactor(facts: MetricCarrier): number | null {
  return trustedNumber(facts, 'fiveYearImpactFactor', facts?.fiveYearImpactFactor);
}

export function trustedFirstDecisionDays(facts: MetricCarrier): number | null {
  return trustedNumber(facts, 'firstDecisionDays', facts?.firstDecisionDays);
}

export function trustedApcUsd(facts: MetricCarrier): number | null {
  return trustedNumber(facts, 'apcUsd', facts?.apcUsd);
}

export function trustedArticleDownloads(facts: MetricCarrier): number | null {
  return trustedNumber(facts, 'articleDownloads', facts?.articleDownloads);
}

export function trustedFullTextViews(facts: MetricCarrier): number | null {
  return trustedNumber(facts, 'fullTextViews', facts?.fullTextViews);
}

export function trustedQuartile(facts: MetricCarrier): string | null {
  return trustedText(facts, 'jcrQuartile', facts?.jcrQuartile);
}

export function trustedCasZone(facts: MetricCarrier): string | null {
  return trustedText(facts, 'casZone', facts?.casZone);
}

/**
 * Copy of facts with untrusted numeric and ranking fields removed.
 * Journal name, publisher, and scope stay so ads can still be written.
 */
export function factsForCopy<T extends MetricCarrier>(facts: T): T {
  if (!facts) return facts;
  return {
    ...facts,
    impactFactor: impactFactorMayEnterCopy(facts, 'impactFactor') ? facts.impactFactor ?? null : null,
    fiveYearImpactFactor: impactFactorMayEnterCopy(facts, 'fiveYearImpactFactor') ? facts.fiveYearImpactFactor ?? null : null,
    jcrQuartile: metricFieldIsTrusted(facts, 'jcrQuartile') ? facts.jcrQuartile ?? null : null,
    casZone: metricFieldIsTrusted(facts, 'casZone') ? facts.casZone ?? null : null,
    firstDecisionDays: metricFieldIsTrusted(facts, 'firstDecisionDays') ? facts.firstDecisionDays ?? null : null,
    apcUsd: metricFieldIsTrusted(facts, 'apcUsd') ? facts.apcUsd ?? null : null,
    articleDownloads: trustedArticleDownloads(facts),
    fullTextViews: trustedFullTextViews(facts),
    indexing: metricFieldIsTrusted(facts, 'indexing') ? facts.indexing || [] : [],
  };
}

/** Instructions for a copy model. Untrusted records do not include any figures. */
export function metricPromptSection(facts: MetricCarrier): string {
  if (!metricsAreTrusted(facts)) {
    return [
      'METRICS: No trusted metric values are on this record.',
      'Do not state an impact factor, 5-year impact factor, JCR quartile, CAS zone, review-time days, APC, indexing service, article downloads, full-text views, or any other number or ranking.',
      'Do not mention Clarivate.',
    ].join('\n');
  }

  const lines = ['METRICS (these are the only numbers and rankings you may use):'];
  const quartile = trustedQuartile(facts);
  const casZone = trustedCasZone(facts);
  const days = trustedFirstDecisionDays(facts);
  const apc = trustedApcUsd(facts);
  const downloads = trustedArticleDownloads(facts);
  const views = trustedFullTextViews(facts);
  const fromClarivate = metricsFromClarivateWos(facts);

  const impactPhrase = clarivateImpactPhrase(facts, 'impactFactor');
  const fiveYearPhrase = clarivateImpactPhrase(facts, 'fiveYearImpactFactor');
  if (impactPhrase) lines.push(`- Impact factor: ${impactPhrase}`);
  else if (facts?.impactFactor != null || facts?.fiveYearImpactFactor != null) {
    lines.push('- Do not state an impact factor or 5-year impact factor. A journal-website or catalog figure is reference only.');
  }
  if (fiveYearPhrase) lines.push(`- 5-year impact factor: ${fiveYearPhrase}`);
  if (quartile) lines.push(`- JCR quartile: ${quartile}`);
  if (casZone) lines.push(`- CAS zone: ${casZone}`);
  if (days != null) lines.push(`- First decision days: ${days}`);
  if (apc != null) lines.push(`- APC USD: ${apc}`);
  if (downloads != null) lines.push(`- Article downloads: ${formatUsageCount(downloads)}`);
  if (views != null) lines.push(`- Full-text views: ${formatUsageCount(views)}`);
  if (downloads != null || views != null) {
    lines.push('- Article downloads and full-text views are counts. Do not turn them into a date.');
  }
  if (lines.length === 1) lines.push('- None of the metric fields are filled in.');
  lines.push(
    fromClarivate
      ? 'These values came from the Clarivate API. Name clarivate_wos_journals_api and the JCR year whenever you state an impact factor.'
      : impactPhrase || fiveYearPhrase
        ? 'You may say clarivate_wos_journals_api only for the impact factor labelled with that source and its JCR year.'
        : 'Do not attribute these values to Clarivate.'
  );
  lines.push('Do not add any number or ranking that is not listed above.');
  return lines.join('\n');
}

export interface MetricClaimGuardResult {
  text: string;
  flags: string[];
}

function sameNumber(claimed: string, trusted: number | null): boolean {
  if (trusted == null) return false;
  const value = Number(claimed);
  return Number.isFinite(value) && Math.abs(value - trusted) < 0.001;
}

function compact(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

/**
 * Drop any number or ranking in ad copy that is not a trusted fact.
 * A matching value is kept. "Clarivate" is kept only for clarivate_wos_journals_api records.
 */
export function guardMetricClaims(text: string, facts: MetricCarrier): MetricClaimGuardResult {
  if (!text) return { text: text || '', flags: [] };

  const flags: string[] = [];
  const impactFactor = trustedImpactFactor(facts);
  const fiveYear = trustedFiveYearImpactFactor(facts);
  const days = trustedFirstDecisionDays(facts);
  const apc = trustedApcUsd(facts);
  const downloads = trustedArticleDownloads(facts);
  const views = trustedFullTextViews(facts);
  const quartile = trustedQuartile(facts);
  const casZone = trustedCasZone(facts);
  const clarivateOk = metricsFromClarivateWos(facts);
  let out = text;

  const keepImpact = (full: string, num: string) => {
    if (!(sameNumber(num, impactFactor) || sameNumber(num, fiveYear))) {
      flags.push(`Stripped untrusted metric claim "${full.trim()}"`);
      return '';
    }
    if (!clarivateOk && /clarivate/i.test(full)) {
      flags.push(`Removed Clarivate attribution from "${full.trim()}"`);
      return full.replace(/clarivate\s+/i, '');
    }
    return full;
  };

  out = out.replace(
    /(?:clarivate\s+)?(?:5[-\s]?year\s+)?(?:impact\s+factor|影响因子|\bif)\s*(?:of|is|[:：])?\s*(\d+(?:\.\d+)?)/gi,
    (full, num) => keepImpact(full, num)
  );
  out = out.replace(
    /(\d+(?:\.\d+)?)\s*(?:5[-\s]?year\s+)?(?:impact\s+factor|影响因子|\bif)\b/gi,
    (full, num) => keepImpact(full, num)
  );

  out = out.replace(/(\d+(?:\.\d+)?)\s*[- ]?(?:days?|天)/gi, (full, num) => {
    if (sameNumber(num, days)) return full;
    flags.push(`Stripped untrusted time claim "${full.trim()}"`);
    return '';
  });

  out = out.replace(/\$\s*(\d+(?:\.\d+)?)/g, (full, num) => {
    if (sameNumber(num, apc)) return full;
    flags.push(`Stripped untrusted fee "${full.trim()}"`);
    return '';
  });

  out = out.replace(/\bapc\b\s*[:：]?\s*\$?\s*(\d+(?:\.\d+)?)/gi, (full, num) => {
    if (sameNumber(num, apc)) return full;
    flags.push(`Stripped untrusted APC claim "${full.trim()}"`);
    return '';
  });

  out = out.replace(/\bQ([1-4])\b/gi, (full) => {
    if (quartile && quartile.toLowerCase() === full.toLowerCase()) return full;
    flags.push(`Stripped untrusted quartile "${full}"`);
    return '';
  });

  out = out.replace(/\b(?:zone|quartile)\s*([1-4])\b/gi, (full) => {
    const q = `q${full.match(/[1-4]/)?.[0] || ''}`;
    if (quartile && quartile.toLowerCase() === q) return full;
    flags.push(`Stripped untrusted ranking "${full.trim()}"`);
    return '';
  });

  out = out.replace(/\b(\d+\.\d+)\b/g, (full, num) => {
    if (sameNumber(num, impactFactor) || sameNumber(num, fiveYear)) return full;
    flags.push(`Stripped untrusted figure "${full}"`);
    return '';
  });

  const keepUsage = (token: string) => {
    const count = parseUsageCount(token);
    if (count != null && (count === downloads || count === views || count === apc)) return token;
    flags.push(`Stripped untrusted usage count "${token.trim()}"`);
    return '';
  };
  out = out.replace(
    /\b\d{1,3}(?:,\d{3})+(?:\.\d+)?(?:\s*(?:million|billion|thousand|[kmb]))?\b|\b\d+(?:\.\d+)?\s*(?:million|billion|thousand|[kmb])\b/gi,
    (token) => keepUsage(token)
  );

  out = out.replace(
    /中科院[\u4e00-\u9fffA-Za-z0-9/ ]{0,20}?[1-4]区(?:\s*Top)?|[1-4]区(?:\s*Top)?/g,
    (full) => {
      if (casZone && compact(casZone).includes(compact(full))) return full;
      flags.push(`Stripped untrusted ranking "${full.trim()}"`);
      return '';
    }
  );

  if (!clarivateOk && /\bclarivate\b/i.test(out)) {
    flags.push('Removed Clarivate attribution');
    out = out.replace(/\bclarivate\b/gi, '');
  }

  out = out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:，。])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .trim();

  return { text: out, flags };
}

interface CopyText {
  text?: string;
}

interface GuardableCampaign {
  searchAds?: {
    headlines?: CopyText[];
    descriptions?: CopyText[];
    callouts?: string[];
  };
  displayAds?: {
    shortHeadline?: string;
    longHeadline?: string;
    description?: string;
    bannerHeadlineZh?: string;
    bannerSubtextZh?: string;
    ctaText?: string;
  };
  metricClaimFlags?: string[];
}

/** Strip untrusted claims from generated search and display copy. Empty lines are dropped. */
export function guardAdCopy<T extends GuardableCampaign>(campaign: T, facts: MetricCarrier): T {
  const flags: string[] = [];

  const guardLine = (value: string | undefined): string => {
    const result = guardMetricClaims(value || '', facts);
    flags.push(...result.flags);
    return result.text;
  };

  if (campaign.searchAds?.headlines) {
    campaign.searchAds.headlines = campaign.searchAds.headlines
      .map((headline) => ({ ...headline, text: guardLine(headline.text) }))
      .filter((headline) => headline.text);
  }
  if (campaign.searchAds?.descriptions) {
    campaign.searchAds.descriptions = campaign.searchAds.descriptions
      .map((description) => ({ ...description, text: guardLine(description.text) }))
      .filter((description) => description.text);
  }
  if (campaign.searchAds?.callouts) {
    campaign.searchAds.callouts = campaign.searchAds.callouts
      .map((callout) => guardLine(callout))
      .filter(Boolean);
  }
  if (campaign.displayAds) {
    const display = campaign.displayAds;
    display.shortHeadline = guardLine(display.shortHeadline);
    display.longHeadline = guardLine(display.longHeadline);
    display.description = guardLine(display.description);
    display.bannerHeadlineZh = guardLine(display.bannerHeadlineZh);
    display.bannerSubtextZh = guardLine(display.bannerSubtextZh);
  }

  campaign.metricClaimFlags = flags;
  return campaign;
}
