import { ClarivateJournalMetrics, FactVerificationStatus } from '../types';
import { CLARIVATE_WOS_JOURNALS_SOURCE } from './metricSources';

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

/** Ad and export wording. Clarivate is named only for the Journals API source. */
export function formatJifClaim(facts: MetricCarrier): string | null {
  const value = trustedImpactFactor(facts);
  if (value == null) return null;
  if (metricsFromClarivateWos(facts)) {
    return facts?.jcrYear != null
      ? `JIF ${value} (Clarivate JCR ${facts.jcrYear})`
      : `JIF ${value} (Clarivate)`;
  }
  return `JIF ${value}`;
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

function trustedNumber(facts: MetricCarrier, value: number | null | undefined): number | null {
  if (!metricsAreTrusted(facts)) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function trustedText(facts: MetricCarrier, value: string | null | undefined): string | null {
  if (!metricsAreTrusted(facts)) return null;
  const text = (value || '').trim();
  return text || null;
}

export function trustedImpactFactor(facts: MetricCarrier): number | null {
  return trustedNumber(facts, facts?.impactFactor);
}

export function trustedFiveYearImpactFactor(facts: MetricCarrier): number | null {
  return trustedNumber(facts, facts?.fiveYearImpactFactor);
}

export function trustedFirstDecisionDays(facts: MetricCarrier): number | null {
  return trustedNumber(facts, facts?.firstDecisionDays);
}

export function trustedApcUsd(facts: MetricCarrier): number | null {
  return trustedNumber(facts, facts?.apcUsd);
}

export function trustedQuartile(facts: MetricCarrier): string | null {
  return trustedText(facts, facts?.jcrQuartile);
}

export function trustedCasZone(facts: MetricCarrier): string | null {
  return trustedText(facts, facts?.casZone);
}

/**
 * Copy of facts with untrusted numeric and ranking fields removed.
 * Journal name, publisher, and scope stay so ads can still be written.
 */
export function factsForCopy<T extends MetricCarrier>(facts: T): T {
  if (!facts || metricsAreTrusted(facts)) return facts;
  return {
    ...facts,
    impactFactor: null,
    fiveYearImpactFactor: null,
    jcrQuartile: null,
    casZone: null,
    firstDecisionDays: null,
    apcUsd: null,
    indexing: [],
  };
}

/** Instructions for a copy model. Untrusted records do not include any figures. */
export function metricPromptSection(facts: MetricCarrier): string {
  if (!metricsAreTrusted(facts)) {
    return [
      'METRICS: No trusted metric values are on this record.',
      'Do not state an impact factor, 5-year impact factor, JCR quartile, CAS zone, review-time days, APC, indexing service, or any other number or ranking.',
      'Do not mention Clarivate.',
    ].join('\n');
  }

  const lines = ['METRICS (these are the only numbers and rankings you may use):'];
  const impactFactor = trustedImpactFactor(facts);
  const fiveYear = trustedFiveYearImpactFactor(facts);
  const quartile = trustedQuartile(facts);
  const casZone = trustedCasZone(facts);
  const days = trustedFirstDecisionDays(facts);
  const apc = trustedApcUsd(facts);
  const fromClarivate = metricsFromClarivateWos(facts);

  if (impactFactor != null) lines.push(`- Impact factor: ${impactFactor}`);
  const jifClaim = formatJifClaim(facts);
  if (jifClaim) lines.push(`- Cite the impact factor exactly as: ${jifClaim}`);
  if (fiveYear != null) lines.push(`- 5-year impact factor: ${fiveYear}`);
  if (quartile) lines.push(`- JCR quartile: ${quartile}`);
  if (casZone) lines.push(`- CAS zone: ${casZone}`);
  if (days != null) lines.push(`- First decision days: ${days}`);
  if (apc != null) lines.push(`- APC USD: ${apc}`);
  if (lines.length === 1) lines.push('- None of the metric fields are filled in.');
  lines.push(
    fromClarivate
      ? 'These values came from the Clarivate API. You may say Clarivate only for these values.'
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
