import { ClarivateJournalMetrics, FactVerificationStatus, PageSourcedFeature } from '../types';
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

/** Ad and export wording. Clarivate is named only when this impact factor came from the Journals API. */
export function formatJifClaim(facts: MetricCarrier): string | null {
  const value = trustedImpactFactor(facts);
  if (value == null) return null;
  const source = fieldProvenance(facts, 'impactFactor');
  if (source === 'page_sourced' || source === 'landing_page' || source === 'catalog_snapshot') return null;
  const fromClarivate = source === 'clarivate_wos_journals_api' || (!source && metricsFromClarivateWos(facts));
  if (!fromClarivate) return `JIF ${value}`;
  const year =
    (facts as { provenanceMap?: Record<string, { year?: number }> } | null | undefined)?.provenanceMap?.impactFactor?.year ??
    facts?.jcrYear;
  return year != null ? `JIF ${value} (Clarivate JCR ${year})` : `JIF ${value} (Clarivate)`;
}

/**
 * A hand edit must not keep a Clarivate label. Call this for any user-supplied
 * facts before they are stored or sent to the copy model.
 */
export function sanitizeUserProvidedFacts<T extends MetricCarrier & { sourceAttribution?: string }>(facts: T): T {
  const attribution = typeof facts?.sourceAttribution === 'string' ? facts.sourceAttribution : '';
  const sourceAttribution =
    attribution && !/clarivate/i.test(attribution)
      ? attribution
      : 'Manually supplied by user (User Verified)';
  return {
    ...facts,
    verificationStatus: 'user_provided',
    provenanceSource: 'user_provided',
    isVerifiedClarivate: false,
    sourceAttribution,
  };
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
  const impactFactor = trustedImpactFactor(facts);
  const fiveYear = trustedFiveYearImpactFactor(facts);
  const fieldFromClarivate = (field: string) => {
    const source = fieldProvenance(facts, field);
    if (source === 'clarivate_wos_journals_api') return true;
    if (source) return false;
    return metricsFromClarivateWos(facts);
  };

  const impactPhrase = clarivateImpactPhrase(facts, 'impactFactor');
  const fiveYearPhrase = clarivateImpactPhrase(facts, 'fiveYearImpactFactor');
  if (impactFactor != null) {
    lines.push(`- Impact factor: ${impactFactor}`);
    const jifClaim = formatJifClaim(facts);
    if (jifClaim) lines.push(`- Cite the impact factor exactly as: ${jifClaim}`);
    if (impactPhrase) lines.push(`- Source label: ${impactPhrase}`);
  } else if (facts?.impactFactor != null) {
    lines.push('- Do not state an impact factor. A journal-website or catalog figure is reference only.');
  }
  if (fiveYear != null) {
    lines.push(`- 5-year impact factor: ${fiveYear}`);
    if (fiveYearPhrase) lines.push(`- Source label: ${fiveYearPhrase}`);
  } else if (facts?.fiveYearImpactFactor != null) {
    lines.push('- Do not state a 5-year impact factor. A journal-website or catalog figure is reference only.');
  }
  if (quartile) lines.push(`- JCR quartile: ${quartile}`);
  if (casZone) lines.push(`- CAS zone: ${casZone}`);
  if (days != null) lines.push(`- First decision days: ${days}`);
  if (apc != null) lines.push(`- APC USD: ${apc}`);
  if (downloads != null) lines.push(`- Article downloads: ${formatUsageCount(downloads)}`);
  if (views != null) lines.push(`- Full-text views: ${formatUsageCount(views)}`);
  if (downloads != null || views != null) {
    lines.push('- Article downloads and full-text views are counts. Do not invent a download date.');
  }
  for (const feature of facts?.pageFeatures || []) {
    if (!DATE_FEATURE_KINDS.includes(feature.kind) || !feature.text.trim()) continue;
    const source = feature.provenance === 'clarivate_wos_journals_api' ? 'clarivate_wos_journals_api' : 'journal website';
    lines.push(`- ${feature.label}: ${feature.text} (${source})`);
  }
  const hasDownloadDate = (facts?.pageFeatures || []).some((feature) => feature.kind === 'download_date' && feature.text.trim());
  const hasRetrievalDate = (facts?.pageFeatures || []).some(
    (feature) => feature.kind === 'retrieval_date' && feature.provenance === 'clarivate_wos_journals_api'
  );
  if (hasRetrievalDate && !hasDownloadDate) {
    lines.push('- The retrieval date is when the Journals API response was retrieved. It is not a download date.');
  }
  if (lines.length === 1) lines.push('- None of the metric fields are filled in.');
  const cited = [
    impactFactor != null && fieldFromClarivate('impactFactor'),
    fiveYear != null && fieldFromClarivate('fiveYearImpactFactor'),
    !!quartile && fieldFromClarivate('jcrQuartile'),
    !!casZone && fieldFromClarivate('casZone'),
    days != null && fieldFromClarivate('firstDecisionDays'),
    apc != null && fieldFromClarivate('apcUsd'),
  ];
  const clarivateCited = cited.some(Boolean);
  const otherCited = [
    impactFactor != null && !fieldFromClarivate('impactFactor'),
    fiveYear != null && !fieldFromClarivate('fiveYearImpactFactor'),
    !!quartile && !fieldFromClarivate('jcrQuartile'),
    !!casZone && !fieldFromClarivate('casZone'),
    days != null && !fieldFromClarivate('firstDecisionDays'),
    apc != null && !fieldFromClarivate('apcUsd'),
  ].some(Boolean);
  lines.push(
    clarivateCited && !otherCited
      ? 'These values came from the Clarivate API. Name clarivate_wos_journals_api and the JCR year whenever you state an impact factor. You may say Clarivate only for these values.'
      : clarivateCited
        ? 'You may say clarivate_wos_journals_api only for the impact factor labelled with that source and its JCR year. Do not attribute any other value to Clarivate.'
        : 'Do not attribute these values to Clarivate.'
  );
  lines.push('Do not add any number or ranking that is not listed above.');
  return lines.join('\n');
}

export interface MetricClaimGuardResult {
  text: string;
  flags: string[];
}

const DATE_FEATURE_KINDS: PageSourcedFeature['kind'][] = ['usage_date', 'download_date', 'data_retrieved', 'retrieval_date'];

function sameNumber(claimed: string, trusted: number | null): boolean {
  if (trusted == null) return false;
  const value = Number(claimed.replace(/,/g, ''));
  return Number.isFinite(value) && Math.abs(value - trusted) < 0.001;
}

/** Full-width digits and punctuation (U+FF01–U+FF5E) become ASCII before matching. */
function foldFullwidth(text: string): string {
  return text.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

const CLAIM_NUMBER = String.raw`(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)`;
const JIF_LABEL = String.raw`(?:[Ii]mpact\s+[Ff]actor|影响因子|[Jj][Ii][Ff]|\bIF\b)`;
const JIF_PROVENANCE = String.raw`(?:\s*\(\s*[Cc]larivate\s+JCR(?:\s+\d{4})?\s*\))?`;

function rankIsTrusted(facts: MetricCarrier, rank: string, ofTotal: string): boolean {
  if (!metricsAreTrusted(facts)) return false;
  const wanted = `${Number(rank)}/${Number(ofTotal)}`;
  return (facts?.jifRanks || []).some((entry) => (entry.rank || '').replace(/\s/g, '') === wanted);
}

function topPercentIsTrusted(facts: MetricCarrier, percent: string): boolean {
  if (!metricsAreTrusted(facts)) return false;
  const claimed = Number(percent);
  if (!Number.isFinite(claimed)) return false;
  return (facts?.jifRanks || []).some((entry) => {
    const raw = entry.jifPercentile;
    const pct = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(pct)) return false;
    return 100 - pct <= claimed + 0.05;
  });
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
  let out = foldFullwidth(text);

  const keepImpact = (full: string, num: string) => {
    if (!(sameNumber(num, impactFactor) || sameNumber(num, fiveYear))) {
      flags.push(`Stripped untrusted metric claim "${full.trim()}"`);
      return '';
    }
    if (!clarivateOk && /clarivate/i.test(full)) {
      flags.push(`Removed Clarivate attribution from "${full.trim()}"`);
      return full.replace(/\s*\([^)]*[Cc]larivate[^)]*\)/g, '').replace(/\b[Cc]larivate\s+/g, '');
    }
    return full;
  };

  // "If 3 authors" is the English word If, not the IF acronym. JIF and uppercase IF are metrics.
  out = out.replace(
    new RegExp(
      String.raw`(?:[Cc]larivate\s+)?(?:5[-\s]?[Yy]ear\s+)?${JIF_LABEL}\s*(?:of|is|[:：])?\s*${CLAIM_NUMBER}${JIF_PROVENANCE}`,
      'g'
    ),
    (full, num) => keepImpact(full, num)
  );
  out = out.replace(
    new RegExp(String.raw`${CLAIM_NUMBER}\s*(?:5[-\s]?[Yy]ear\s+)?${JIF_LABEL}\b${JIF_PROVENANCE}`, 'g'),
    (full, num) => keepImpact(full, num)
  );

  // Review-time claims. "7 days a week" is not a decision time.
  out = out.replace(/(\d+(?:\.\d+)?)\s*[- ]?[Dd]ays?\b(?!\s+a\s+week\b)(?!\s+per\s+week\b)/g, (full, num) => {
    if (sameNumber(num, days)) return full;
    flags.push(`Stripped untrusted time claim "${full.trim()}"`);
    return '';
  });
  out = out.replace(/(\d+(?:\.\d+)?)\s*天/g, (full, num) => {
    if (sameNumber(num, days)) return full;
    flags.push(`Stripped untrusted time claim "${full.trim()}"`);
    return '';
  });

  out = out.replace(new RegExp(String.raw`\b[Aa][Pp][Cc]\b\s*[:：]?\s*\$?\s*${CLAIM_NUMBER}`, 'g'), (full, num) => {
    if (sameNumber(num, apc)) return full;
    flags.push(`Stripped untrusted APC claim "${full.trim()}"`);
    return '';
  });

  out = out.replace(new RegExp(String.raw`\$\s*${CLAIM_NUMBER}`, 'g'), (full, num) => {
    if (sameNumber(num, apc)) return full;
    flags.push(`Stripped untrusted fee "${full.trim()}"`);
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

  out = out.replace(/#\s*(\d+)\s+of\s+(\d+)/gi, (full, rank, ofTotal) => {
    if (rankIsTrusted(facts, rank, ofTotal)) return full;
    flags.push(`Stripped untrusted rank claim "${full.trim()}"`);
    return '';
  });

  out = out.replace(/\btop\s+(\d+(?:\.\d+)?)\s*%/gi, (full, percent) => {
    if (topPercentIsTrusted(facts, percent)) return full;
    flags.push(`Stripped untrusted rank claim "${full.trim()}"`);
    return '';
  });

  // CiteScore, h-index, and similar labels are not trusted fields. A number
  // next to one of them is stripped. "Version 2.0", "7 days a week", and
  // "If 3 authors" do not match these labels.
  const otherMetricLabel = String.raw`(?:CiteScore|h[-\s]?index|SNIP|SJR|Eigenfactor|immediacy(?:\s+index)?|journal\s+citation\s+indicator)`;
  const stripOtherMetric = (full: string) => {
    flags.push(`Stripped untrusted metric claim "${full.trim()}"`);
    return '';
  };
  out = out.replace(
    new RegExp(String.raw`\b${otherMetricLabel}\b\s*(?:of|is|[:：=])?\s*${CLAIM_NUMBER}`, 'gi'),
    stripOtherMetric
  );
  out = out.replace(new RegExp(String.raw`${CLAIM_NUMBER}\s+\b${otherMetricLabel}\b`, 'gi'), stripOtherMetric);

  const keepUsage = (token: string) => {
    const count = parseUsageCount(token);
    if (count != null && (count === downloads || count === views || count === apc || count === impactFactor || count === fiveYear)) return token;
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

  const hasDownloadDate = (facts?.pageFeatures || []).some((feature) => feature.kind === 'download_date' && feature.text.trim());
  if (!hasDownloadDate && /\bdownload date\b/i.test(out)) {
    flags.push('Removed a download date that was not on the record');
    out = out.replace(/\bdownload dates?\b/gi, '');
  }

  out = out
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:，。])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/\s+\/\s+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { text: out, flags };
}

interface CopyText {
  text?: string;
}

interface GuardableSitelink {
  title?: string;
  desc?: string;
  urlPath?: string;
}

interface GuardableKeyword {
  keyword?: string;
}

interface GuardableChineseKeyword {
  keywordZh?: string;
}

interface GuardableCampaign {
  searchAds?: {
    headlines?: CopyText[];
    descriptions?: CopyText[];
    callouts?: string[];
    sitelinks?: GuardableSitelink[];
  };
  displayAds?: {
    shortHeadline?: string;
    longHeadline?: string;
    description?: string;
    bannerHeadlineZh?: string;
    bannerSubtextZh?: string;
    ctaText?: string;
  };
  keywords?: {
    englishSearchKeywords?: GuardableKeyword[];
    chineseAuthorKeywords?: GuardableChineseKeyword[];
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
  if (campaign.searchAds?.sitelinks) {
    campaign.searchAds.sitelinks = campaign.searchAds.sitelinks
      .map((sitelink) => ({
        ...sitelink,
        title: guardLine(sitelink.title),
        desc: guardLine(sitelink.desc),
      }))
      .filter((sitelink) => sitelink.title || sitelink.desc);
  }
  if (campaign.keywords?.englishSearchKeywords) {
    campaign.keywords.englishSearchKeywords = campaign.keywords.englishSearchKeywords
      .map((item) => ({ ...item, keyword: guardLine(item.keyword) }))
      .filter((item) => item.keyword);
  }
  if (campaign.keywords?.chineseAuthorKeywords) {
    campaign.keywords.chineseAuthorKeywords = campaign.keywords.chineseAuthorKeywords
      .map((item) => ({ ...item, keywordZh: guardLine(item.keywordZh) }))
      .filter((item) => item.keywordZh);
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
