import { JOURNAL_CATALOG } from '../data/journalCatalog';
import type { StageCode } from '../types';
import { journalUrlFetchBlockReason } from './journalHosts';
import { journalUrlsMatch, normalizeJournalUrl, type NormalizedJournalUrl } from './journalUrl';
import {
  DEFAULT_STAGE_URL_RULES,
  isStageUrlRole,
  parseStageUrlRules,
  stageUrlPatternLabel,
  type StageUrlRules,
} from './stageUrlRules';

/**
 * A better on-journal URL for the selected funnel stage.
 * Every suggestion is a link the page contained, or the journal landing URL.
 * Nothing here invents a path such as /about or /submission-guidelines.
 * `url` is null when the journal is known but no real link matches the saved patterns.
 */
export interface StageUrlSuggestion {
  url: string | null;
  reason: string;
}

interface FactValue {
  value?: string | null;
}

export interface StageUrlFacts {
  url?: string | null;
  issn?: string | null;
  eIssn?: string | null;
  authorGuidelinesUrl?: string | null;
  submissionPortalUrl?: string | null;
  extractedFacts?: {
    canonicalUrl?: FactValue | null;
    issnPrint?: FactValue | null;
    issnElectronic?: FactValue | null;
    aboutUrl?: FactValue | null;
    articlesUrl?: FactValue | null;
    aimsUrl?: FactValue | null;
    apcInfoUrl?: FactValue | null;
    metricsUrl?: FactValue | null;
    checklistUrl?: FactValue | null;
    authorGuidelinesUrl?: FactValue | null;
    submissionPortalUrl?: FactValue | null;
  } | null;
}

const DECISION_SLUGS = new Set([
  'submit',
  'submission',
  'submission-guidelines',
  'for-authors',
  'author-guidelines',
  'checklist',
  'submission-checklist',
]);

const CONSIDERATION_SLUGS = new Set([
  'aims',
  'aims-and-scope',
  'article-types',
  'open-access',
  'journal-metrics',
  'metrics',
]);

/** Article-type pages fit both awareness (browse) and consideration (what the journal publishes). */
const ARTICLE_SLUGS = new Set([
  'research-articles',
  'reviews-and-analysis',
  'news-and-comment',
  'letters',
  'articles',
  'correspondence',
  'resources',
  'perspectives',
  'comments',
  'reviews',
]);

type PageKind = 'decision' | 'consideration' | 'article' | 'about' | 'home' | 'other';

function clean(value: string | null | undefined): string {
  return normalizeJournalUrl(value).canonical;
}

function issnOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.toUpperCase().match(/\b(\d{4}-\d{3}[\dX])\b/);
  return match ? match[1] : null;
}

function isPortalHost(host: string): boolean {
  return (
    /^mts-[a-z0-9-]+\.nature\.com$/i.test(host) ||
    host === 'submission.springernature.com' ||
    host === 'editorialmanager.com' ||
    host.endsWith('.editorialmanager.com')
  );
}

function pageKind(url: string): PageKind {
  const norm = normalizeJournalUrl(url);
  if (!norm.canonical) return 'other';
  if (isPortalHost(norm.host)) return 'decision';
  const slug = norm.segments[norm.segments.length - 1] || '';
  if (DECISION_SLUGS.has(slug)) return 'decision';
  if (CONSIDERATION_SLUGS.has(slug)) return 'consideration';
  if (ARTICLE_SLUGS.has(slug)) return 'article';
  if (slug === 'about') return 'about';
  if (isJournalHome(norm)) return 'home';
  return 'other';
}

function isJournalHome(norm: NormalizedJournalUrl): boolean {
  if (norm.segments.length === 0) return true;
  if (norm.segments.length === 1) return true;
  return norm.segments.length === 2 && norm.segments[0] === 'journal' && /^\d+$/.test(norm.segments[1]);
}

const GUIDELINE_SLUGS = new Set(['submit', 'submission', 'submission-guidelines', 'for-authors', 'author-guidelines']);

function valueOf(field: FactValue | null | undefined): string {
  return clean(field?.value);
}

function catalogByIssn(facts: StageUrlFacts): string {
  const issns = [
    facts.issn,
    facts.eIssn,
    facts.extractedFacts?.issnPrint?.value,
    facts.extractedFacts?.issnElectronic?.value,
  ]
    .map(issnOf)
    .filter((issn): issn is string => Boolean(issn));
  const catalog = JOURNAL_CATALOG.find(
    (journal) => issns.includes(journal.issn || '') || issns.includes(journal.eIssn || '')
  );
  return catalog ? clean(catalog.url) : '';
}

/**
 * A catalog landing URL that actually contains this path.
 * An empty-path home is used only when that host has a single catalog journal,
 * so https://www.nature.com is not treated as the parent of every Nature journal.
 */
function catalogByPath(current: NormalizedJournalUrl): string {
  if (!current.hostKey) return '';
  const sameHost = JOURNAL_CATALOG.map((journal) => normalizeJournalUrl(journal.url)).filter(
    (journal) => journal.hostKey === current.hostKey && journal.canonical
  );
  const prefixed = sameHost
    .filter((journal) => journal.pathname && (journalUrlsMatch(journal, current) || isPathChild(journal, current)))
    .sort((a, b) => b.pathname.length - a.pathname.length);
  if (prefixed[0]) return prefixed[0].canonical;
  if (sameHost.length === 1 && !sameHost[0].pathname) return sameHost[0].canonical;
  return '';
}

function flagshipLandingApplies(landing: string, current: NormalizedJournalUrl): boolean {
  const home = normalizeJournalUrl(landing);
  if (!home.canonical || home.hostKey !== current.hostKey) return false;
  if (journalUrlsMatch(home, current) || isPathChild(home, current)) return true;
  if (home.pathname) return false;
  if (catalogByPath(current)) return false;
  return current.segments.length === 0 || current.segments[0] === 'nature';
}

/** Landing URL from the pasted path, a matching ISSN, or a canonical journal home. */
function journalLandingUrl(facts: StageUrlFacts, currentRaw: string): string {
  const current = normalizeJournalUrl(currentRaw);
  const byPath = catalogByPath(current);
  if (byPath) return byPath;
  const byIssn = catalogByIssn(facts);
  if (byIssn && flagshipLandingApplies(byIssn, current)) return byIssn;
  const canonical = valueOf(facts.extractedFacts?.canonicalUrl);
  if (!canonical || pageKind(canonical) !== 'home') return '';
  const home = normalizeJournalUrl(canonical);
  if (journalUrlsMatch(home, current) || isPathChild(home, current)) return canonical;
  if (!home.pathname && flagshipLandingApplies(canonical, current)) return canonical;
  return '';
}

function isPathChild(parent: NormalizedJournalUrl, child: NormalizedJournalUrl): boolean {
  if (!parent.pathname || parent.hostKey !== child.hostKey) return false;
  return child.pathname.startsWith(`${parent.pathname}/`);
}

function samePage(a: string, b: string): boolean {
  return journalUrlsMatch(normalizeJournalUrl(a), normalizeJournalUrl(b));
}

/**
 * The fetched facts belong to this URL when it is that page, a link on it,
 * or a page under the journal home. An empty-path Nature home is not the
 * parent of every nature.com journal.
 */
function onThisJournal(url: string, landing: string): boolean {
  const home = normalizeJournalUrl(landing);
  const target = normalizeJournalUrl(url);
  if (!home.canonical || !target.canonical || home.hostKey !== target.hostKey) return false;
  if (journalUrlsMatch(home, target) || isPathChild(home, target)) return true;
  if (!home.pathname) return target.segments.length === 0 || target.segments[0] === 'nature';
  return false;
}

function portalBelongsToJournal(facts: StageUrlFacts, landing: string): boolean {
  const byIssn = catalogByIssn(facts);
  if (byIssn && samePage(byIssn, landing)) return true;
  return Boolean(facts.url && onThisJournal(facts.url, landing));
}

function factsMatchUrl(currentRaw: string, facts: StageUrlFacts): boolean {
  const current = normalizeJournalUrl(currentRaw);
  if (!current.canonical) return false;
  if (catalogByPath(current) || (catalogByIssn(facts) && flagshipLandingApplies(catalogByIssn(facts), current))) return true;

  const canonical = normalizeJournalUrl(valueOf(facts.extractedFacts?.canonicalUrl));
  const known = [
    facts.url,
    canonical.canonical,
    facts.authorGuidelinesUrl,
    facts.submissionPortalUrl,
    valueOf(facts.extractedFacts?.aboutUrl),
    valueOf(facts.extractedFacts?.articlesUrl),
    valueOf(facts.extractedFacts?.aimsUrl),
    valueOf(facts.extractedFacts?.apcInfoUrl),
    valueOf(facts.extractedFacts?.metricsUrl),
    valueOf(facts.extractedFacts?.checklistUrl),
    valueOf(facts.extractedFacts?.authorGuidelinesUrl),
    valueOf(facts.extractedFacts?.submissionPortalUrl),
  ];
  if (known.some((url) => url && samePage(url, current.canonical))) return true;
  if (canonical.pathname && pageKind(canonical.canonical) === 'home' && isPathChild(canonical, current)) return true;
  return false;
}

function pagePhrase(url: string, facts: StageUrlFacts): string {
  const portal = clean(facts.submissionPortalUrl) || valueOf(facts.extractedFacts?.submissionPortalUrl);
  if (portal && samePage(url, portal)) return 'the submission portal';

  const kind = pageKind(url);
  const slug = normalizeJournalUrl(url).segments.at(-1) || '';
  if (slug === 'submission-guidelines') return 'the submission guidelines';
  if (slug === 'for-authors' || slug === 'author-guidelines') return 'the author guidelines';
  if (slug === 'submit' || slug === 'submission') return 'the submission page';
  if (slug.includes('checklist')) return 'the submission checklist';
  if (isPortalHost(normalizeJournalUrl(url).host)) return 'the submission portal';
  if (kind === 'decision') return 'the submission page';
  if (slug === 'aims' || slug === 'aims-and-scope') return 'the aims and scope';
  if (kind === 'article' || slug === 'article-types') return 'the article types';
  if (slug === 'open-access') return 'the publishing options';
  if (slug === 'metrics' || slug === 'journal-metrics') return 'the journal metrics';
  if (kind === 'about') return 'the journal overview';
  if (kind === 'home') return 'the journal home';
  return 'this page';
}

function reasonFor(stage: StageCode, target: string, current: string, facts: StageUrlFacts): string {
  const better = pagePhrase(target, facts);
  const pasted = pagePhrase(current, facts);
  if (stage === 'AWA') {
    if (pageKind(target) === 'article') {
      return `Awareness is for people who do not know the journal or the subject yet. The article types are a better first page than ${pasted}.`;
    }
    return `Awareness is for people who do not know the journal or the subject yet. ${sentence(better)} is a better first page than ${pasted}.`;
  }
  if (stage === 'CON') {
    if (pageKind(target) === 'article') {
      return `Consideration is for authors checking whether this journal fits their manuscript. The article types show what the journal publishes, which fits this stage better than ${pasted}.`;
    }
    const verb = better === 'the aims and scope' || better === 'the publishing options' || better === 'the journal metrics' ? 'fit' : 'fits';
    return `Consideration is for authors checking whether this journal fits their manuscript. ${sentence(better)} ${verb} this stage better than ${pasted}.`;
  }
  const lead = 'Decision is for authors preparing a submission.';
  if (better === 'the submission portal') return `${lead} The submission portal is where the manuscript is sent.`;
  if (better === 'the submission checklist') return `${lead} The submission checklist lists what to prepare.`;
  if (better === 'the submission page') return `${lead} The submission page explains how to submit.`;
  return `${lead} ${sentence(better)} explain how to submit.`;
}

function sentence(phrase: string): string {
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

interface LinkBag {
  landing: string;
  about: string;
  articles: string;
  aims: string;
  fees: string;
  metrics: string;
  checklist: string;
  guidelines: string;
  portal: string;
  links: string[];
}

function uniqueUrls(urls: string[]): string[] {
  const seen: string[] = [];
  for (const url of urls) {
    if (!url || seen.some((item) => samePage(item, url))) continue;
    seen.push(url);
  }
  return seen;
}

function slugOf(url: string): string {
  return (normalizeJournalUrl(url).segments.at(-1) || '').toLowerCase();
}

function pathMatches(url: string, pattern: string): boolean {
  const norm = normalizeJournalUrl(url);
  const needle = pattern.toLowerCase();
  const path = norm.pathname.replace(/^\//, '').toLowerCase();
  const slug = slugOf(url);
  if (!needle || (!path && !slug)) return false;
  return slug === needle || path === needle || path.endsWith(`/${needle}`);
}

/** A role or path pattern matches this real URL. It does not build a new path. */
function patternMatches(pattern: string, url: string, bag: LinkBag): boolean {
  if (!url) return false;
  if (!isStageUrlRole(pattern)) return pathMatches(url, pattern);
  const slug = slugOf(url);
  switch (pattern) {
    case 'journal-home':
      return Boolean(bag.landing && samePage(url, bag.landing)) || (pageKind(url) === 'home' && onThisJournal(url, bag.landing || url));
    case 'about':
      return Boolean(bag.about && samePage(url, bag.about)) || slug === 'about';
    case 'aims-and-scope':
      return Boolean(bag.aims && samePage(url, bag.aims)) || slug === 'aims' || slug === 'aims-and-scope';
    case 'article-types':
      return Boolean(bag.articles && samePage(url, bag.articles)) || slug === 'article-types' || ARTICLE_SLUGS.has(slug);
    case 'publishing-options':
      return Boolean(bag.fees && samePage(url, bag.fees)) || slug === 'open-access';
    case 'journal-metrics':
      return Boolean(bag.metrics && samePage(url, bag.metrics)) || slug === 'metrics' || slug === 'journal-metrics';
    case 'author-guidelines':
      return Boolean(bag.guidelines && samePage(url, bag.guidelines)) || GUIDELINE_SLUGS.has(slug);
    case 'submission-checklist':
      return Boolean(bag.checklist && samePage(url, bag.checklist)) || slug === 'checklist' || slug === 'submission-checklist';
    case 'submission-portal':
      return Boolean(bag.portal && samePage(url, bag.portal)) || isPortalHost(normalizeJournalUrl(url).host);
    default:
      return false;
  }
}

function urlsForPattern(pattern: string, bag: LinkBag): string[] {
  const preferred: string[] = [];
  if (isStageUrlRole(pattern)) {
    if (pattern === 'journal-home') preferred.push(bag.landing);
    if (pattern === 'about') preferred.push(bag.about);
    if (pattern === 'aims-and-scope') preferred.push(bag.aims);
    if (pattern === 'article-types') preferred.push(bag.articles);
    if (pattern === 'publishing-options') preferred.push(bag.fees);
    if (pattern === 'journal-metrics') preferred.push(bag.metrics);
    if (pattern === 'author-guidelines') preferred.push(bag.guidelines);
    if (pattern === 'submission-checklist') preferred.push(bag.checklist);
    if (pattern === 'submission-portal') preferred.push(bag.portal);
  }
  return uniqueUrls([...preferred, ...bag.links.filter((url) => patternMatches(pattern, url, bag))]);
}

function activeRules(rules: StageUrlRules | null | undefined): StageUrlRules {
  if (!rules) return DEFAULT_STAGE_URL_RULES;
  return parseStageUrlRules(rules) ?? DEFAULT_STAGE_URL_RULES;
}

function noMatchReason(stage: StageCode, patterns: string[]): string {
  const stageName = stage === 'AWA' ? 'Awareness' : stage === 'CON' ? 'Consideration' : 'Decision';
  if (patterns.length === 0) {
    return `No preferred page patterns are saved for ${stageName}. Nothing was guessed.`;
  }
  const list = patterns.map((pattern) => stageUrlPatternLabel(pattern)).join(', ');
  return `No page already on this journal matches the preferred ${stageName} patterns (${list}). Nothing was guessed.`;
}

/**
 * Suggest a URL on the same journal that fits the audience better.
 * Returns null when the journal is unknown, or when the pasted URL already
 * matches one of the stage's patterns. When the journal is known and nothing
 * real matches, returns a reason and a null URL. Generation is never blocked.
 * Saved rules override the source defaults. Passing nothing uses the defaults.
 */
export function suggestStageUrl(
  currentUrl: string,
  stage: StageCode,
  facts: StageUrlFacts | null | undefined,
  rules?: StageUrlRules | null
): StageUrlSuggestion | null {
  if (!facts) return null;
  const current = clean(currentUrl);
  if (!current || !factsMatchUrl(current, facts)) return null;

  const page = facts.extractedFacts;
  const landing = journalLandingUrl(facts, current);
  const keep = (url: string) => (url && onThisJournal(url, landing) ? url : '');
  const crossHost = (url: string) =>
    url && portalBelongsToJournal(facts, landing) && isPortalHost(normalizeJournalUrl(url).host) ? url : '';
  const about = keep(valueOf(page?.aboutUrl));
  const articles = keep(valueOf(page?.articlesUrl));
  const aims = keep(valueOf(page?.aimsUrl));
  const fees = keep(valueOf(page?.apcInfoUrl));
  const metrics = keep(valueOf(page?.metricsUrl));
  const checklist = keep(valueOf(page?.checklistUrl));
  const guidelinesRaw = clean(facts.authorGuidelinesUrl) || valueOf(page?.authorGuidelinesUrl);
  const portalRaw = clean(facts.submissionPortalUrl) || valueOf(page?.submissionPortalUrl);
  const guidelines = keep(guidelinesRaw) || crossHost(guidelinesRaw);
  const portal = keep(portalRaw) || crossHost(portalRaw);
  const ownUrl = keep(clean(facts.url));
  const canonical = keep(valueOf(page?.canonicalUrl));
  const bag: LinkBag = {
    landing,
    about,
    articles,
    aims,
    fees,
    metrics,
    checklist,
    guidelines,
    portal,
    links: uniqueUrls([landing, about, articles, aims, fees, metrics, checklist, guidelines, portal, canonical, ownUrl]),
  };

  const patterns = activeRules(rules)[stage];
  if (patterns.some((pattern) => patternMatches(pattern, current, bag))) return null;

  for (const pattern of patterns) {
    for (const url of urlsForPattern(pattern, bag)) {
      if (!url || samePage(url, current)) continue;
      if (!bag.links.some((link) => samePage(link, url))) continue;
      return { url, reason: reasonFor(stage, url, current, facts) };
    }
  }
  if (!landing) return null;
  return { url: null, reason: noMatchReason(stage, patterns) };
}

export interface EditedStageUrl {
  /** The marketer's URL, unchanged. Null when it must not be fetched. */
  url: string | null;
  warning: string | null;
}

/**
 * Accept an edited suggestion as the URL to fetch.
 * The prefilled value still comes from suggestStageUrl. This does not invent a
 * path and does not replace the marketer's slug with that suggestion.
 * A host other than the journal page or the suggestion is refused, including
 * hosts outside the Springer Nature fetch allowlist.
 */
export function editedStageUrlToApply(editedRaw: string, journalUrl: string, suggestedUrl: string): EditedStageUrl {
  const edited = (editedRaw || '').trim();
  const blocked = journalUrlFetchBlockReason(edited);
  if (blocked) return { url: null, warning: blocked };

  const editedHost = normalizeJournalUrl(edited).hostKey;
  const journalHost = normalizeJournalUrl(journalUrl).hostKey;
  const suggestedHost = normalizeJournalUrl(suggestedUrl).hostKey;
  if (!editedHost || (editedHost !== journalHost && editedHost !== suggestedHost)) {
    return {
      url: null,
      warning: 'That URL is on a different host than this journal, so it was not fetched.',
    };
  }

  return { url: edited, warning: null };
}
