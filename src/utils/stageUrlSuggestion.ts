import { JOURNAL_CATALOG } from '../data/journalCatalog';
import type { StageCode } from '../types';
import { journalUrlsMatch, normalizeJournalUrl, type NormalizedJournalUrl } from './journalUrl';

/**
 * A better on-journal URL for the selected funnel stage.
 * Every suggestion is a link the page contained, or the journal landing URL.
 * Nothing here invents a path such as /about or /submission-guidelines.
 */
export interface StageUrlSuggestion {
  url: string;
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

function stageAccepts(url: string, stage: StageCode): boolean {
  const kind = pageKind(url);
  if (stage === 'DEC') return kind === 'decision';
  if (stage === 'CON') return kind === 'consideration' || kind === 'article';
  return kind === 'home' || kind === 'about' || kind === 'article';
}

function valueOf(field: FactValue | null | undefined): string {
  return clean(field?.value);
}

/** Landing URL from the catalog when the ISSN matches, otherwise a canonical journal home. */
function journalLandingUrl(facts: StageUrlFacts): string {
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
  if (catalog) return clean(catalog.url);
  const canonical = valueOf(facts.extractedFacts?.canonicalUrl);
  if (canonical && pageKind(canonical) === 'home') return canonical;
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
function factsMatchUrl(currentRaw: string, facts: StageUrlFacts): boolean {
  const current = normalizeJournalUrl(currentRaw);
  if (!current.canonical) return false;

  const landing = normalizeJournalUrl(journalLandingUrl(facts));
  const canonical = normalizeJournalUrl(valueOf(facts.extractedFacts?.canonicalUrl));
  const known = [
    facts.url,
    landing.canonical,
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

  const home = landing.pathname ? landing : canonical.pathname && pageKind(canonical.canonical) === 'home' ? canonical : null;
  if (home?.pathname && isPathChild(home, current)) return true;

  if (landing.canonical && !landing.pathname && landing.hostKey === current.hostKey) {
    if (current.segments.length === 0) return true;
    if (current.segments[0] === 'nature') return true;
  }
  return false;
}

function pagePhrase(url: string, facts: StageUrlFacts): string {
  const guidelines = clean(facts.authorGuidelinesUrl) || valueOf(facts.extractedFacts?.authorGuidelinesUrl);
  const portal = clean(facts.submissionPortalUrl) || valueOf(facts.extractedFacts?.submissionPortalUrl);
  if (guidelines && samePage(url, guidelines)) {
    const slug = normalizeJournalUrl(url).segments.at(-1) || '';
    if (slug === 'submission-guidelines') return 'the submission guidelines';
    return 'the author guidelines';
  }
  if (portal && samePage(url, portal)) return 'the submission portal';

  const kind = pageKind(url);
  const slug = normalizeJournalUrl(url).segments.at(-1) || '';
  if (kind === 'decision' && slug === 'submission-guidelines') return 'the submission guidelines';
  if (kind === 'decision' && (slug === 'for-authors' || slug === 'author-guidelines')) return 'the author guidelines';
  if (kind === 'decision' && slug.includes('checklist')) return 'the submission checklist';
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

function firstAccepted(stage: StageCode, current: string, urls: string[]): string {
  for (const url of urls) {
    if (!url || samePage(url, current)) continue;
    if (stageAccepts(url, stage)) return url;
  }
  return '';
}

/**
 * Suggest a URL on the same journal that fits the audience better.
 * Returns null when the pasted URL already fits, or when no real link or
 * journal landing URL is a better fit. Generation is never blocked.
 */
export function suggestStageUrl(
  currentUrl: string,
  stage: StageCode,
  facts: StageUrlFacts | null | undefined
): StageUrlSuggestion | null {
  if (!facts) return null;
  const current = clean(currentUrl);
  if (!current || !factsMatchUrl(current, facts)) return null;
  if (stageAccepts(current, stage)) return null;

  const page = facts.extractedFacts;
  const landing = journalLandingUrl(facts);
  const about = valueOf(page?.aboutUrl);
  const articles = valueOf(page?.articlesUrl);
  const aims = valueOf(page?.aimsUrl);
  const fees = valueOf(page?.apcInfoUrl);
  const metrics = valueOf(page?.metricsUrl);
  const checklist = valueOf(page?.checklistUrl);
  const guidelines = clean(facts.authorGuidelinesUrl) || valueOf(page?.authorGuidelinesUrl);
  const portal = clean(facts.submissionPortalUrl) || valueOf(page?.submissionPortalUrl);

  const allowed = new Set(
    [landing, about, articles, aims, fees, metrics, checklist, guidelines, portal, valueOf(page?.canonicalUrl), clean(facts.url)].filter(
      Boolean
    )
  );

  const target =
    stage === 'AWA'
      ? firstAccepted(stage, current, [landing, about, articles])
      : stage === 'CON'
        ? firstAccepted(stage, current, [aims, articles, fees, metrics])
        : firstAccepted(stage, current, [guidelines, checklist, portal]);

  if (!target || !allowed.has(target) || samePage(target, current)) return null;
  return { url: target, reason: reasonFor(stage, target, current, facts) };
}
