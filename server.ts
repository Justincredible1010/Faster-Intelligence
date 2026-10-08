import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadMetricsCacheFromDisk } from './src/utils/metricsCache';
import { diffTrackedFields, recordMetricsAudit, type FieldChange, type MetricsAuditEvent } from './src/server/auditLog';
import { assertProductionAuthConfig } from './src/server/auth/config';
import { apiGuard, getRequestSession, requireAdmin } from './src/server/auth/guard';
import { registerAuthRoutes } from './src/server/auth/routes';
import { MANUAL_METRIC_SOURCE, MetricsValidationError, sanitizeUserProvidedFacts, validateJournalMetricsUpdate } from './src/server/metricsValidation';
import { JOURNAL_CATALOG } from './src/data/journalCatalog';
import { NATURE_HOMEPAGE_URL, normalizeJournalUrl, journalUrlsMatch } from './src/utils/journalUrl';
import { lookupMetricsByIssn, pageFacts } from './src/utils/metricSources';
import { factsForCopy, guardAdCopy, metricPromptSection } from './src/utils/metricClaims';
import { formatUsageCount } from './src/utils/usageCounts';
import type { ExtractedPageFacts, PageSourcedFeature } from './src/types';
import {
  LandingPageError,
  extractLandingPageFacts,
  fetchLandingPage,
  formatLandingPagePromptSection,
  isPublisherHomepage,
  journalCacheKey,
  mergeLandingPageFacts,
  parseAllowedJournalUrl,
  campaignLandingUrl,
  resolveCampaignUrl,
  stageDestinationUrl,
  type FetchLandingPageDeps,
} from './src/utils/landingPage';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const PORT = 3000;

// Express matches routes case-insensitively by default. Keep matching strict so
// `/API/...` cannot reach a handler that the guard only recognised as `/api`.
app.set('case sensitive routing', true);

if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}

// Campaign payloads are JSON text. 1mb is enough for playbooks and journal facts
// and replaces the previous 15mb limit.
export const JSON_BODY_LIMIT = '1mb';
app.use(express.json({ limit: JSON_BODY_LIMIT }));
app.use((err: { type?: string; status?: number; statusCode?: number }, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.type === 'entity.too.large' || err?.status === 413 || err?.statusCode === 413) {
    res.status(413).json({ error: 'Request body is too large. Maximum size is 1mb.' });
    return;
  }
  next(err);
});
app.use(apiGuard);
app.use('/api', apiGuard);
registerAuthRoutes(app);

// Shared Gemini client utility
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Stage codes and strategy definitions
export type StageCode = 'AWA' | 'CON' | 'DEC';

export interface JCRJournalEntry {
  url: string;
  slugs: string[];
  journalName: string;
  publisher: 'Springer Nature' | 'Nature Portfolio' | 'BMC (Part of Springer Nature)' | 'SpringerLink' | string;
  impactFactor: number | null;
  fiveYearImpactFactor?: number | null;
  jcrQuartile?: 'Q1' | 'Q2' | 'Q3' | 'Q4' | string | null;
  casZone?: string | null;
  firstDecisionDays?: number | null;
  indexing?: string[];
  openAccessType?: 'Gold Open Access' | 'Hybrid Open Access' | string | null;
  apcUsd?: number | null;
  /** Page-stated article download count. Not a date, and not Clarivate retrievedAt. */
  articleDownloads?: number | null;
  /** Page-stated full-text view count. */
  fullTextViews?: number | null;
  chinaWaiverAvailable?: boolean;
  aimsAndScopeSummary?: string;
  primaryDiscipline?: string;
  verificationStatus: 'user_provided' | 'page_sourced' | 'clarivate_api' | 'catalog_snapshot' | 'missing';
  provenanceSource?: 'user_provided' | 'page_sourced' | 'clarivate_wos_journals_api' | 'catalog_snapshot' | 'missing';
  jcrYear?: number;
  retrievedAt?: string;
  wosJournalId?: string;
  issn?: string;
  eIssn?: string;
  catalogDataYear?: number;
  missingFields?: string[];
  isVerifiedClarivate?: boolean;
  reportingYear?: string;
  sourceAttribution: string;
  isFromCache?: boolean;
  cachedAt?: string;
  cacheExpiresAt?: string;
  submissionPortalUrl?: string | null;
  authorGuidelinesUrl?: string | null;
  pageFeatures?: PageSourcedFeature[];
  extractedFacts?: ExtractedPageFacts;
  provenanceMap?: Record<string, { source: string; confidence: number; year?: number; note?: string }>;
}

export interface JournalLookupOptions {
  persist?: boolean;
  cache?: Map<string, CachedJournal>;
  fetchPage?: (url: string) => Promise<string | { html: string; finalUrl?: string }>;
  fetchDeps?: FetchLandingPageDeps;
  issn?: string;
}

export interface CachedMetricEntry {
  metric: string;
  value: number | string | null;
  year: number;
  source: string;
  cachedAt: string;
  expireAt: string;
}

export interface CachedJournal {
  journalId: string;
  journalName: string;
  publisher: string;
  metrics: Record<string, CachedMetricEntry>;
  lastAccess: string;
  fullFacts?: JCRJournalEntry;
  lastModifiedBy?: { email: string; sub: string; provider: string; at: string };
  audit?: MetricsAuditEvent[];
}

// --- PERSISTENT METRICS CACHE (metrics-cache.json) ---
function cacheFilePath(): string {
  const override = process.env.METRICS_CACHE_PATH;
  if (override && override.trim()) return path.resolve(override);
  return path.resolve(__dirname, 'metrics-cache.json');
}
const metricsCache = new Map<string, CachedJournal>();

export function resetMetricsCacheForTests(): void {
  metricsCache.clear();
}

type LandingPageFetchForTests = NonNullable<JournalLookupOptions['fetchPage']>;
let landingPageFetchForTests: LandingPageFetchForTests | null = null;

/** Test seam. Production leaves this unset, so lookup reads the live page. */
export function setLandingPageFetchForTests(fetchPage: LandingPageFetchForTests | null): void {
  landingPageFetchForTests = fetchPage;
}

function loadCacheFromDisk() {
  metricsCache.clear();
  const loaded = loadMetricsCacheFromDisk<CachedJournal>(cacheFilePath());
  loaded.forEach((val, key) => {
    metricsCache.set(key, val);
  });
}

function saveCacheToDisk() {
  try {
    const obj: Record<string, CachedJournal> = {};
    metricsCache.forEach((val, key) => {
      obj[key] = val;
    });
    fs.writeFileSync(cacheFilePath(), JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Metrics Cache] Failed to write cache to disk:', err);
  }
}

// Initialize cache on startup
loadCacheFromDisk();

function calculateMetricExpiry(metric: string): string {
  const now = new Date();
  if (metric === 'impactFactor') {
    // JCR releases annually in late June
    const juneRelease = new Date(now.getFullYear(), 5, 30, 23, 59, 59);
    if (now > juneRelease) {
      return new Date(now.getFullYear() + 1, 5, 30, 23, 59, 59).toISOString();
    }
    return juneRelease.toISOString();
  }
  if (metric === 'casZone') {
    // CAS Chinese Academy of Sciences releases rankings in late December
    const decRelease = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    if (now > decRelease) {
      return new Date(now.getFullYear() + 1, 11, 31, 23, 59, 59).toISOString();
    }
    return decRelease.toISOString();
  }
  if (metric === 'firstDecisionDays') {
    // Review turnaround changes quarterly (90 days)
    return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (metric === 'apcUsd') {
    // APC pricing refreshed every 60 days
    return new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString();
  }
  return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
}

function isCachedJournalExpired(cached: CachedJournal): boolean {
  if (!cached.metrics || Object.keys(cached.metrics).length === 0) return true;
  const now = Date.now();
  // If IF or review time is expired, consider stale
  const ifEntry = cached.metrics['impactFactor'];
  if (ifEntry && new Date(ifEntry.expireAt).getTime() < now) return true;
  const daysEntry = cached.metrics['firstDecisionDays'];
  if (daysEntry && new Date(daysEntry.expireAt).getTime() < now) return true;
  return false;
}

// CJK Character Double-Width Counting (Google Ads Standard)
export function countCharacterWidth(text: string): number {
  if (!text) return 0;
  const cjkChars = (text.match(/[\u4e00-\u9fa5\u3400-\u4dbf\u3000-\u303f\uff01-\uffee]/g) || []).length;
  const otherChars = text.length - cjkChars;
  return (cjkChars * 2) + otherChars;
}

// Smart clamp function respecting Google Ads visual width (30 max for headlines, 90 for descriptions)
export function smartClamp(text: string, maxWidth: number): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (countCharacterWidth(trimmed) <= maxWidth) return trimmed;

  let slice = trimmed;
  while (countCharacterWidth(slice) > maxWidth && slice.length > 0) {
    slice = slice.slice(0, -1);
  }

  // Avoid cutting mid-word for Latin letters
  const lastChar = slice.slice(-1);
  const nextChar = trimmed.charAt(slice.length);
  if (/[a-zA-Z0-9]/.test(lastChar) && /[a-zA-Z0-9]/.test(nextChar)) {
    const lastSpace = slice.lastIndexOf(' ');
    if (lastSpace > 4) {
      slice = slice.slice(0, lastSpace);
    }
  }

  return slice.replace(/[,;:\-\s·/|]+$/, '').trim();
}

// Shared Stage Strategy Configuration
export const STAGE_CONFIGS: Record<StageCode, any> = {
  AWA: {
    code: 'AWA',
    name: 'AWA — Awareness',
    authorMindset: '“What is this journal, and why is it relevant to my research?”',
    campaignObjective: 'Introduce the journal, establish subject relevance, and build credible discovery without submission pressure.',
    tone: 'Informative, welcoming, research-led, low-pressure',
    primaryCta: 'Explore the journal',
    recommendedDestination: {
      label: 'Journal Overview & Latest Research',
      description: 'Scope overview, editorial mission, and recently published highlights.',
    },
  },
  CON: {
    code: 'CON',
    name: 'CON — Consideration',
    authorMindset: '“Is this journal better suited for my manuscript than other publishing options?”',
    campaignObjective: 'Help the author evaluate topical fit, article types, editorial rigor, open access models, and objective comparisons with other journals.',
    tone: 'Specific, transparent, evidence-led, and useful for objective comparison',
    primaryCta: 'Check journal fit',
    recommendedDestination: {
      label: 'Aims & Scope and Publishing Options',
      description: 'Accepted article formats, editorial standards, and transparent fee policies.',
    },
  },
  DEC: {
    code: 'DEC',
    name: 'DEC — Decision',
    authorMindset: '“What do I need to prepare and do to submit my manuscript?”',
    campaignObjective: 'Reduce submission friction, provide clear preparation checklists, fee/waiver criteria, and direct submission access.',
    tone: 'Clear, practical, reassuring, and action-oriented without artificial hype',
    primaryCta: 'View submission checklist',
    recommendedDestination: {
      label: 'Author Guidelines & Submission Portal',
      description: 'Manuscript preparation instructions, checklist, and direct submission link.',
    },
  },
};

export function normalizeStage(stage: string): StageCode {
  const upper = (stage || '').toUpperCase();
  if (upper === 'AWA' || upper === 'TOFU') return 'AWA';
  if (upper === 'CON' || upper === 'MOFU') return 'CON';
  if (upper === 'DEC' || upper === 'BOFU') return 'DEC';
  return 'CON';
}

// Canonical journal list. URLs and snapshot labels live in src/data/journalCatalog.ts.
export const CLARIVATE_JCR_CATALOG: JCRJournalEntry[] = JOURNAL_CATALOG;

const CURRENT_METRIC_STATUSES = new Set(['user_provided', 'page_sourced', 'clarivate_api', 'catalog_snapshot']);

function rememberJournal(
  journalId: string,
  facts: JCRJournalEntry,
  cache: Map<string, CachedJournal> = metricsCache,
  persist = true
) {
  const nowStr = new Date().toISOString();
  const source = facts.verificationStatus === 'catalog_snapshot'
    ? `Catalog snapshot ${facts.catalogDataYear || ''}`.trim()
    : facts.verificationStatus;
  const cachedEntry: CachedJournal = {
    journalId,
    journalName: facts.journalName,
    publisher: facts.publisher,
    lastAccess: nowStr,
    metrics: {
      impactFactor: {
        metric: 'impactFactor',
        value: facts.impactFactor,
        year: facts.catalogDataYear || new Date().getFullYear(),
        source,
        cachedAt: nowStr,
        expireAt: calculateMetricExpiry('impactFactor'),
      },
      casZone: {
        metric: 'casZone',
        value: facts.casZone || null,
        year: facts.catalogDataYear || new Date().getFullYear(),
        source,
        cachedAt: nowStr,
        expireAt: calculateMetricExpiry('casZone'),
      },
      firstDecisionDays: {
        metric: 'firstDecisionDays',
        value: facts.firstDecisionDays || null,
        year: facts.catalogDataYear || new Date().getFullYear(),
        source,
        cachedAt: nowStr,
        expireAt: calculateMetricExpiry('firstDecisionDays'),
      },
      apcUsd: {
        metric: 'apcUsd',
        value: facts.apcUsd || null,
        year: facts.catalogDataYear || new Date().getFullYear(),
        source,
        cachedAt: nowStr,
        expireAt: calculateMetricExpiry('apcUsd'),
      },
    },
    fullFacts: facts,
  };
  cache.set(journalId, cachedEntry);
  if (persist && cache === metricsCache) saveCacheToDisk();
  return cachedEntry;
}

function missingJournalFacts(canonicalUrl: string): JCRJournalEntry {
  return {
    url: canonicalUrl,
    slugs: [],
    journalName: 'Unknown journal',
    publisher: 'Unknown publisher',
    impactFactor: null,
    fiveYearImpactFactor: null,
    jcrQuartile: null,
    casZone: null,
    firstDecisionDays: null,
    indexing: [],
    openAccessType: null,
    apcUsd: null,
    chinaWaiverAvailable: false,
    aimsAndScopeSummary: '',
    primaryDiscipline: '',
    isVerifiedClarivate: false,
    verificationStatus: 'missing',
    provenanceSource: 'missing',
    missingFields: ['impactFactor', 'casZone', 'jcrQuartile', 'firstDecisionDays', 'apcUsd', 'indexing'],
    reportingYear: '',
    sourceAttribution: 'No trusted metrics for this URL. Add them manually, or connect the Clarivate API.',
  };
}

function lookupRequest(issnOrOptions?: string | JournalLookupOptions): { issn?: string; options: JournalLookupOptions } {
  if (typeof issnOrOptions === 'string') return { issn: issnOrOptions, options: {} };
  return { issn: issnOrOptions?.issn, options: issnOrOptions || {} };
}

function catalogForUrl(canonical: string): JCRJournalEntry | undefined {
  const norm = normalizeJournalUrl(canonical);
  return CLARIVATE_JCR_CATALOG.find((entry) => journalUrlsMatch(norm, normalizeJournalUrl(entry.url)));
}

const NATURE_HOME_CACHE_MS = 24 * 60 * 60 * 1000;

function isNatureHomepage(canonical: string): boolean {
  return journalUrlsMatch(normalizeJournalUrl(canonical), normalizeJournalUrl(NATURE_HOMEPAGE_URL));
}

function freshCachedFacts(cached: CachedJournal | undefined, requestUrl: string): JCRJournalEntry | null {
  if (!cached?.fullFacts) return null;
  const status = cached.fullFacts.verificationStatus;
  if (!status || status === 'missing' || !CURRENT_METRIC_STATUSES.has(status)) return null;
  if (isNatureHomepage(requestUrl)) {
    const fetchedAt = Date.parse(cached.lastAccess || '');
    if (!Number.isFinite(fetchedAt) || Date.now() - fetchedAt > NATURE_HOME_CACHE_MS) return null;
    return cached.fullFacts;
  }
  if (status === 'catalog_snapshot' || isCachedJournalExpired(cached)) return null;
  return cached.fullFacts;
}

export async function lookupClarivateFacts(
  url: string,
  forceRefresh = false,
  issnOrOptions?: string | JournalLookupOptions
): Promise<JCRJournalEntry> {
  const { issn: issnArg, options } = lookupRequest(issnOrOptions);
  const persist = options.persist !== false;
  const cache = options.cache || metricsCache;
  const norm = normalizeJournalUrl(url);
  if (!norm.canonical) return missingJournalFacts(url || '');

  if (isPublisherHomepage(norm.canonical)) {
    return {
      ...missingJournalFacts(norm.canonical),
      journalName: 'Publisher homepage',
      publisher: 'Springer Nature',
      sourceAttribution: 'This URL is a publisher homepage, not a journal. Paste a journal landing page.',
    };
  }

  try {
    parseAllowedJournalUrl(norm.canonical);
  } catch (err) {
    if (err instanceof LandingPageError && err.code === 'ssrf') throw err;
    return missingJournalFacts(norm.canonical);
  }

  const urlKey = journalCacheKey({ requestUrl: norm.canonical });
  const cachedUrl = forceRefresh ? null : freshCachedFacts(cache.get(urlKey), norm.canonical);
  if (cachedUrl) {
    console.log(`[Cache HIT] Retrieved ${urlKey} (${cachedUrl.journalName})`);
    return {
      ...cachedUrl,
      url: norm.canonical,
      isFromCache: true,
      cachedAt: cache.get(urlKey)?.lastAccess,
      cacheExpiresAt: cache.get(urlKey)?.metrics['impactFactor']?.expireAt,
    };
  }

  // The default page client stays unwired. A caller can replace it later.
  const fromClient = await pageFacts.extractFromPage(norm.canonical);
  if (fromClient) {
    const facts: JCRJournalEntry = {
      ...missingJournalFacts(norm.canonical),
      ...fromClient,
      url: norm.canonical,
      slugs: fromClient.url ? [] : [],
      verificationStatus: 'page_sourced',
      provenanceSource: 'page_sourced',
      isVerifiedClarivate: false,
      sourceAttribution: fromClient.sourceAttribution || 'Read from the journal page',
    };
    const key = journalCacheKey({
      issn: facts.issn,
      eIssn: facts.eIssn,
      requestUrl: norm.canonical,
    });
    rememberJournal(key, facts, cache, persist);
    if (key !== urlKey) rememberJournal(urlKey, facts, cache, persist);
    return facts;
  }

  let page = null;
  let fetchError: string | undefined;
  try {
    const fetchPage = options.fetchPage ?? landingPageFetchForTests ?? undefined;
    const fetched = await fetchLandingPage(norm.canonical, options.fetchDeps, fetchPage);
    page = extractLandingPageFacts(fetched.html, fetched.finalUrl);
  } catch (err) {
    if (err instanceof LandingPageError && err.code === 'ssrf') throw err;
    fetchError = err instanceof Error ? err.message : 'Landing page fetch failed';
  }

  const issnKey = journalCacheKey({
    issn: page?.issnPrint.value || issnArg,
    eIssn: page?.issnElectronic.value,
    canonicalUrl: page?.canonicalUrl.value,
    requestUrl: norm.canonical,
  });
  if (!forceRefresh && issnKey !== urlKey) {
    const cachedIssn = freshCachedFacts(cache.get(issnKey), norm.canonical);
    if (cachedIssn) {
      console.log(`[Cache ALIAS] ${urlKey} matches ${issnKey}`);
      const aliased = { ...cachedIssn, url: norm.canonical };
      rememberJournal(urlKey, aliased, cache, persist);
      return {
        ...aliased,
        isFromCache: true,
        cachedAt: cache.get(issnKey)?.lastAccess,
        cacheExpiresAt: cache.get(issnKey)?.metrics['impactFactor']?.expireAt,
      };
    }
  }

  const issnToUse = (issnArg || page?.issnPrint.value || page?.issnElectronic.value || '').trim();
  let base: JCRJournalEntry = missingJournalFacts(norm.canonical);
  if (issnToUse) {
    const fromApi = await lookupMetricsByIssn(issnToUse);
    if (fromApi) {
      base = {
        ...missingJournalFacts(norm.canonical),
        ...fromApi,
        url: norm.canonical,
        slugs: [],
      };
    }
  }

  if (base.verificationStatus !== 'clarivate_api') {
    const exact = catalogForUrl(norm.canonical);
    if (exact) {
      console.log(`[Catalog MATCH] Found catalog snapshot for ${exact.journalName}`);
      base = { ...exact, url: normalizeJournalUrl(exact.url).canonical };
    }
  }

  const merged = mergeLandingPageFacts(base, page, { fetchError }) as JCRJournalEntry;
  merged.url = norm.canonical;
  merged.slugs = merged.slugs || [];
  merged.issn = merged.issn || page?.issnPrint.value || base.issn;
  merged.eIssn = merged.eIssn || page?.issnElectronic.value || base.eIssn;

  const storeKey = journalCacheKey({
    issn: merged.issn,
    eIssn: merged.eIssn,
    requestUrl: norm.canonical,
  });
  if (merged.issn || merged.eIssn || merged.verificationStatus !== 'missing') {
    const cachedEntry = rememberJournal(storeKey, merged, cache, persist);
    if (urlKey !== storeKey) rememberJournal(urlKey, merged, cache, persist);
    return {
      ...merged,
      isFromCache: false,
      cachedAt: cachedEntry.lastAccess,
      cacheExpiresAt: cachedEntry.metrics['impactFactor']?.expireAt,
    };
  }

  console.log(`[Metrics Missing] No trusted record for ${norm.canonical}.`);
  return merged;
}

// --- REST API ENDPOINTS ---

// 1. Fetch Clarivate Facts (checks cache first)
app.post('/api/fetch-clarivate-facts', async (req, res) => {
  try {
    const { url, forceRefresh = false, issn } = req.body;
    if (!url || !url.trim()) {
      return res.status(400).json({ error: 'URL is required' });
    }
    const facts = await lookupClarivateFacts(url, forceRefresh, typeof issn === 'string' ? issn : undefined);
    res.json({ success: true, facts });
  } catch (err: any) {
    if (err instanceof LandingPageError) {
      const status = err.code === 'ssrf' ? 400 : 502;
      return res.status(status).json({ error: err.message });
    }
    console.error('Clarivate lookup error:', err);
    res.status(500).json({ error: 'Failed to retrieve Clarivate metrics' });
  }
});

// 2. Cache Management Endpoints
app.get('/api/cache/journal/:journalId', (req, res) => {
  const { journalId } = req.params;
  const cached = metricsCache.get(journalId);
  if (!cached) {
    return res.status(404).json({ error: `No cached journal found for id: ${journalId}` });
  }
  res.json({
    success: true,
    cachedJournal: cached,
    isExpired: isCachedJournalExpired(cached),
  });
});

app.post('/api/cache/refresh/:journalId', requireAdmin, async (req, res) => {
  try {
    const { journalId } = req.params;
    const { url } = req.body;
    const cachedUrl = metricsCache.get(journalId)?.fullFacts?.url;
    const targetUrl = url || cachedUrl;
    if (!targetUrl) {
      return res.status(400).json({ error: 'A journal URL is required to refresh this cache entry.' });
    }
    const refreshed = await lookupClarivateFacts(targetUrl, true);
    res.json({
      success: true,
      refreshedFacts: refreshed,
      message: `Forced fresh lookup and updated persistent cache for ${journalId}`,
    });
  } catch (err: any) {
    if (err instanceof LandingPageError) {
      const status = err.code === 'ssrf' ? 400 : 502;
      return res.status(status).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Failed to refresh cache' });
  }
});

app.get('/api/cache/list', (_req, res) => {
  const list: any[] = [];
  metricsCache.forEach((val, key) => {
    list.push({
      journalId: key,
      journalName: val.journalName,
      publisher: val.publisher,
      lastAccess: val.lastAccess,
      isExpired: isCachedJournalExpired(val),
      metricsCount: Object.keys(val.metrics || {}).length,
    });
  });
  res.json({
    success: true,
    totalCached: metricsCache.size,
    journals: list,
  });
});

app.post('/api/cache/clear', requireAdmin, (_req, res) => {
  metricsCache.clear();
  try {
    const filePath = cacheFilePath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn('Failed to delete cache file:', err);
  }
  console.log('[Metrics Cache] Cleared all cached journal metrics.');
  res.json({ success: true, message: 'All cached metrics cleared successfully.' });
});

function cacheKeysForFacts(facts: { url?: string | null; issn?: string | null; eIssn?: string | null }): string[] {
  const canonical = normalizeJournalUrl(facts.url || '').canonical;
  const keys = [
    journalCacheKey({ issn: facts.issn, eIssn: facts.eIssn, requestUrl: canonical }),
    facts.eIssn ? journalCacheKey({ eIssn: facts.eIssn, requestUrl: canonical }) : '',
    canonical ? journalCacheKey({ requestUrl: canonical }) : '',
  ];
  return [...new Set(keys.filter((key) => key && key !== 'host:unknown'))];
}

/** The cached page record for this URL or ISSN, preferring one that still has provenance or extracted links. */
function cachedFactsFor(facts: { url?: string | null; issn?: string | null; eIssn?: string | null }): JCRJournalEntry | null {
  const matches = cacheKeysForFacts(facts)
    .map((key) => metricsCache.get(key)?.fullFacts)
    .filter((entry): entry is JCRJournalEntry => Boolean(entry));
  const hasLinks = (entry: JCRJournalEntry) => Boolean(entry.extractedFacts || entry.submissionPortalUrl || entry.authorGuidelinesUrl);
  return (
    matches.find((entry) => entry.provenanceMap && hasLinks(entry)) ||
    matches.find((entry) => entry.provenanceMap) ||
    matches.find(hasLinks) ||
    matches[0] ||
    null
  );
}

const PROVENANCE_FIELDS = [
  'journalName',
  'publisher',
  'impactFactor',
  'fiveYearImpactFactor',
  'firstDecisionDays',
  'apcUsd',
  'articleDownloads',
  'fullTextViews',
  'jcrQuartile',
  'casZone',
  'indexing',
  'aimsAndScopeSummary',
  'openAccessType',
] as const;

function sameFactValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
  }
  if (left == null && right == null) return true;
  if (typeof left === 'number' || typeof right === 'number') return left === right;
  return String(left).trim() === String(right).trim();
}

/**
 * Keep the cached label on every field the edit did not change.
 * A field the user actually changed becomes user_provided.
 */
function restoredProvenance(
  facts: JCRJournalEntry,
  cached: JCRJournalEntry
): NonNullable<JCRJournalEntry['provenanceMap']> {
  const map: NonNullable<JCRJournalEntry['provenanceMap']> = { ...(cached.provenanceMap || {}) };
  const submitted = facts as unknown as Record<string, unknown>;
  const prior = cached as unknown as Record<string, unknown>;
  for (const field of PROVENANCE_FIELDS) {
    if (sameFactValue(submitted[field], prior[field])) continue;
    map[field] = { source: 'user_provided', confidence: 0.85, note: 'Edited by the user.' };
  }
  return map;
}

/**
 * Browser edits drop extractedFacts, provenanceMap, and the portal fields.
 * Put back the page facts, provenance, and links already cached for that URL or ISSN.
 */
/** A browser edit omits usage counts. Put the cached count back before labels are compared. */
function withCachedUsageCounts<T extends JCRJournalEntry>(facts: T, cached: JCRJournalEntry): T {
  const articleDownloads =
    facts.articleDownloads == null && typeof cached.articleDownloads === 'number'
      ? cached.articleDownloads
      : facts.articleDownloads;
  const fullTextViews =
    facts.fullTextViews == null && typeof cached.fullTextViews === 'number'
      ? cached.fullTextViews
      : facts.fullTextViews;
  if (articleDownloads === facts.articleDownloads && fullTextViews === facts.fullTextViews) return facts;
  return { ...facts, articleDownloads, fullTextViews };
}

function attachCachedPageFacts<T extends JCRJournalEntry>(facts: T): T {
  const cached = cachedFactsFor(facts);
  if (!cached) return facts;
  const withUsage = withCachedUsageCounts(facts, cached);
  return {
    ...withUsage,
    extractedFacts: withUsage.extractedFacts ?? cached.extractedFacts,
    pageFeatures: withUsage.pageFeatures?.length ? withUsage.pageFeatures : cached.pageFeatures,
    submissionPortalUrl: withUsage.submissionPortalUrl ?? cached.submissionPortalUrl,
    authorGuidelinesUrl: withUsage.authorGuidelinesUrl ?? cached.authorGuidelinesUrl,
    provenanceMap: restoredProvenance(withUsage, cached),
  };
}

const DATED_FEATURE_KINDS = new Set<PageSourcedFeature['kind']>(['usage_date', 'download_date', 'data_retrieved', 'retrieval_date']);

function datedFeatureLines(facts: { pageFeatures?: PageSourcedFeature[] }): string[] {
  return (facts.pageFeatures || [])
    .filter((feature) => DATED_FEATURE_KINDS.has(feature.kind) && feature.text.trim())
    .map((feature) => {
      const source = feature.provenance === 'clarivate_wos_journals_api' ? 'clarivate_wos_journals_api' : 'journal website';
      return `${feature.label}: ${feature.text} (${source})`;
    });
}

function mixedDescriptions(
  en: { text: string; sourceFact: string; language: 'EN'; theme: string }[],
  zh: { text: string; sourceFact: string; language: 'ZH'; theme: string }[],
  preferred?: { text: string; sourceFact: string; language: 'EN'; theme: string }
) {
  const dated = en.filter((item) => item.sourceFact === 'Dated usage');
  const english = [...dated, preferred, ...en].filter((item, index, list): item is NonNullable<typeof item> => {
    if (!item) return false;
    return list.findIndex((other) => other?.text === item.text) === index;
  }).slice(0, 2);
  return [english[0] || en[0], zh[0], english[1] || en[1], zh[1]].map((item) => ({ ...item, charCount: item.text.length }));
}

function pageFeatureText(facts: { pageFeatures?: PageSourcedFeature[] }, kind: PageSourcedFeature['kind']): string | null {
  const found = (facts.pageFeatures || []).find(
    (item) => item.kind === kind && item.provenance === 'page-sourced' && item.text.trim()
  );
  return found?.text.trim() || null;
}

/** One ad line, plus the remainder of a long page sentence when it does not fit. */
function pageFeatureLines(text: string | null, width: number): string[] {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const first = smartClamp(clean, width);
  if (!first) return [];
  if (first === clean) return [first];
  const rest = clean.slice(first.length).replace(/^[\s,;:.\-–—]+/, '').trim();
  const second = rest ? smartClamp(rest, width) : '';
  return second ? [first, second] : [first];
}

function clarivateHeadline(facts: { impactFactor?: number | null; jcrYear?: number | null }): string | null {
  if (facts.impactFactor == null || facts.jcrYear == null) return null;
  const full = `clarivate_wos_journals_api JCR ${facts.jcrYear} IF ${facts.impactFactor}`;
  if (countCharacterWidth(full) <= 30) return full;
  const short = `Clarivate JCR ${facts.jcrYear} IF ${facts.impactFactor}`;
  return countCharacterWidth(short) <= 30 ? short : null;
}

function clarivateDescription(facts: {
  impactFactor?: number | null;
  fiveYearImpactFactor?: number | null;
  jcrYear?: number | null;
}): string | null {
  if (facts.impactFactor == null || facts.jcrYear == null) return null;
  const five = facts.fiveYearImpactFactor != null ? `, 5-year IF ${facts.fiveYearImpactFactor}` : '';
  return `clarivate_wos_journals_api JCR ${facts.jcrYear} IF ${facts.impactFactor}${five}.`;
}

function rejectedJournalHost(res: express.Response, raw: string): boolean {
  try {
    parseAllowedJournalUrl(raw);
    return false;
  } catch (err) {
    if (err instanceof LandingPageError && err.code === 'ssrf') {
      res.status(400).json({ error: err.message });
      return true;
    }
    throw err;
  }
}

// Update or store user-provided journal metrics into cache.
// Only known fields are accepted. The signed-in user is recorded on the entry and in the audit log.
app.post('/api/update-journal-metrics', (req, res) => {
  try {
    const actor = getRequestSession(res)?.user;
    if (!actor) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const facts = validateJournalMetricsUpdate(req.body);
    const norm = normalizeJournalUrl(facts.url);
    if (!norm.canonical) {
      return res.status(400).json({ error: 'A journal URL is required. Metrics are stored against that URL, not an invented path.' });
    }
    if (rejectedJournalHost(res, norm.canonical)) return;
    const journalId = journalCacheKey({
      issn: facts.issn,
      eIssn: facts.eIssn,
      requestUrl: norm.canonical,
    });
    const nowStr = new Date().toISOString();
    const previous = metricsCache.get(journalId);

    const userProvidedFacts: JCRJournalEntry = {
      url: norm.canonical,
      slugs: [],
      journalName: facts.journalName,
      publisher: facts.publisher,
      impactFactor: facts.impactFactor,
      fiveYearImpactFactor: facts.fiveYearImpactFactor,
      jcrQuartile: facts.jcrQuartile,
      casZone: facts.casZone,
      firstDecisionDays: facts.firstDecisionDays,
      indexing: facts.indexing,
      openAccessType: facts.openAccessType,
      apcUsd: facts.apcUsd,
      chinaWaiverAvailable: facts.chinaWaiverAvailable,
      aimsAndScopeSummary: facts.aimsAndScopeSummary,
      primaryDiscipline: facts.primaryDiscipline,
      issn: facts.issn,
      eIssn: facts.eIssn,
      isVerifiedClarivate: false,
      verificationStatus: 'user_provided',
      provenanceSource: 'user_provided',
      sourceAttribution: MANUAL_METRIC_SOURCE,
      missingFields: [],
      reportingYear: facts.reportingYear,
      jcrYear: facts.jcrYear,
    };
    const savedFacts = attachCachedPageFacts(userProvidedFacts);

    const changedFields: FieldChange[] = diffTrackedFields(
      previous?.fullFacts as unknown as Record<string, unknown> | undefined,
      savedFacts as unknown as Record<string, unknown>
    );
    const auditEvent: MetricsAuditEvent = {
      at: nowStr,
      actorEmail: actor.email,
      actorSub: actor.sub,
      actorProvider: actor.provider,
      journalId,
      journalName: facts.journalName,
      action: previous ? 'update' : 'create',
      changedFields,
    };
    recordMetricsAudit(auditEvent);

    const metric = (name: string, value: number | string | null) => ({
      metric: name,
      value,
      year: facts.jcrYear,
      source: MANUAL_METRIC_SOURCE,
      cachedAt: nowStr,
      expireAt: calculateMetricExpiry(name),
    });

    const cachedEntry: CachedJournal = {
      journalId,
      journalName: facts.journalName,
      publisher: facts.publisher,
      lastAccess: nowStr,
      metrics: {
        impactFactor: metric('impactFactor', facts.impactFactor),
        casZone: metric('casZone', facts.casZone),
        firstDecisionDays: metric('firstDecisionDays', facts.firstDecisionDays),
        apcUsd: metric('apcUsd', facts.apcUsd),
      },
      fullFacts: savedFacts,
      lastModifiedBy: {
        email: actor.email,
        sub: actor.sub,
        provider: actor.provider,
        at: nowStr,
      },
      audit: [...(previous?.audit || []), auditEvent].slice(-20),
    };

    metricsCache.set(journalId, cachedEntry);
    const urlKey = journalCacheKey({ requestUrl: norm.canonical });
    if (urlKey !== journalId) metricsCache.set(urlKey, cachedEntry);
    saveCacheToDisk();

    console.log(`[Metrics Cache] ${actor.email} saved user-provided metrics for ${facts.journalName} (${journalId})`);
    res.json({
      success: true,
      message: `Saved manually entered metrics for ${facts.journalName}`,
      facts: savedFacts,
      audit: {
        at: auditEvent.at,
        actorEmail: auditEvent.actorEmail,
        action: auditEvent.action,
        changedFields: auditEvent.changedFields,
      },
    });
  } catch (err: any) {
    if (err instanceof MetricsValidationError) {
      return res.status(400).json({ error: err.message });
    }
    console.error('Failed to update journal metrics:', err);
    res.status(500).json({ error: err.message || 'Failed to update metrics' });
  }
});

interface HeadlineSeed {
  text: string;
  sourceFact: string;
  language: 'EN' | 'ZH';
  category: string;
  positionRecommendation: string;
}

// Stage Headlines with language purity & null-metrics defenses
export function generateStageHeadlines(
  facts: any,
  stage: StageCode,
  outputLanguage: 'all' | 'EN' | 'ZH' = 'all'
) {
  facts = factsForCopy(facts);
  const shortName = facts.journalName.length > 18 ? facts.journalName.slice(0, 18) : facts.journalName;
  const disciplineShort = (facts.primaryDiscipline || 'Scientific').split('(')[0].trim().slice(0, 14);
  const impactHeadline = clarivateHeadline(facts);
  const articleTypeHeadline = pageFeatureText(facts, 'article_types')?.split(',')[0]?.trim() || '';
  const publishingHeadline = pageFeatureText(facts, 'publishing_model') || '';
  const submissionHeadline = pageFeatureText(facts, 'submission')?.split(';')[0]?.trim() || '';

  // AWA (Awareness)
  if (stage === 'AWA') {
    const en: HeadlineSeed[] = [
      { text: smartClamp(`Discover ${shortName}`, 30), sourceFact: facts.journalName, language: 'EN', category: 'Journal Identity', positionRecommendation: 'Position 1' },
      { text: smartClamp(`Explore ${disciplineShort} Research`, 30), sourceFact: facts.primaryDiscipline, language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 1' },
      { text: smartClamp(`Published by ${facts.publisher}`, 30), sourceFact: facts.publisher, language: 'EN', category: 'Journal Identity', positionRecommendation: 'Position 1' },
      { text: smartClamp(`Topics in ${disciplineShort}`, 30), sourceFact: facts.primaryDiscipline, language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 2' },
      { text: smartClamp(`Global Research Community`, 30), sourceFact: 'Readership', language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 2' },
      { text: smartClamp(`Read High-Impact Discoveries`, 30), sourceFact: 'Discovery', language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 2' },
      { text: smartClamp(`Peer-Reviewed Scientific Work`, 30), sourceFact: 'Peer Review', language: 'EN', category: 'Journal Identity', positionRecommendation: 'Position 3' },
      { text: smartClamp(`Open Research in ${disciplineShort}`, 30), sourceFact: facts.openAccessType || 'Open Access', language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 3' },
      { text: smartClamp(`Discover Journal Scope`, 30), sourceFact: 'Aims & Scope', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
      { text: smartClamp(`Browse Latest Articles`, 30), sourceFact: 'Readership', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
      { text: smartClamp(`Explore the Journal`, 30), sourceFact: 'CTA', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
      { text: smartClamp(`Leading Scientific Discoveries`, 30), sourceFact: 'Discovery', language: 'EN', category: 'Scope & Community', positionRecommendation: 'Any Position' },
      { text: smartClamp(`Scholarly Research Highlights`, 30), sourceFact: 'Readership', language: 'EN', category: 'Scope & Community', positionRecommendation: 'Any Position' },
      { text: smartClamp(`International Author Network`, 30), sourceFact: 'Community', language: 'EN', category: 'Scope & Community', positionRecommendation: 'Any Position' },
      { text: smartClamp(`Access Recent Publications`, 30), sourceFact: 'CTA', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
    ];

    const zh: HeadlineSeed[] = [
      { text: smartClamp(`探索 ${shortName} 学术期刊`, 30), sourceFact: facts.journalName, language: 'ZH', category: 'Journal Identity', positionRecommendation: 'Position 1' },
      { text: smartClamp(`前沿学术成果与领域进展`, 30), sourceFact: facts.primaryDiscipline, language: 'ZH', category: 'Scope & Community', positionRecommendation: 'Position 1' },
      { text: smartClamp(`国际同行评议学术交流`, 30), sourceFact: 'Community', language: 'ZH', category: 'Scope & Community', positionRecommendation: 'Position 2' },
      { text: smartClamp(`查阅期刊学术定位与论文`, 30), sourceFact: 'Discovery', language: 'ZH', category: 'Call to Action', positionRecommendation: 'Position 2' },
      { text: smartClamp(`汇聚全球学者科研发现`, 30), sourceFact: 'Community', language: 'ZH', category: 'Scope & Community', positionRecommendation: 'Position 3' },
      { text: smartClamp(`开放获取前沿学科论文`, 30), sourceFact: 'Open Access', language: 'ZH', category: 'Scope & Community', positionRecommendation: 'Position 3' },
      { text: smartClamp(`了解期刊发表范围与使命`, 30), sourceFact: 'Aims & Scope', language: 'ZH', category: 'Call to Action', positionRecommendation: 'Any Position' },
      { text: smartClamp(`探索知名出版机构期刊`, 30), sourceFact: facts.publisher, language: 'ZH', category: 'Journal Identity', positionRecommendation: 'Any Position' },
      { text: smartClamp(`查阅最新发表原创成果`, 30), sourceFact: 'Articles', language: 'ZH', category: 'Call to Action', positionRecommendation: 'Any Position' },
      { text: smartClamp(`跨学科科研视野与发现`, 30), sourceFact: 'Scope', language: 'ZH', category: 'Scope & Community', positionRecommendation: 'Any Position' },
      { text: smartClamp(`国际学术前沿论文阅览`, 30), sourceFact: 'Readership', language: 'ZH', category: 'Call to Action', positionRecommendation: 'Any Position' },
      { text: smartClamp(`科研学者学术成果交流`, 30), sourceFact: 'Community', language: 'ZH', category: 'Scope & Community', positionRecommendation: 'Any Position' },
      { text: smartClamp(`权威出版支持学科探索`, 30), sourceFact: facts.publisher, language: 'ZH', category: 'Journal Identity', positionRecommendation: 'Any Position' },
      { text: smartClamp(`浏览学科重点研究课题`, 30), sourceFact: 'Topics', language: 'ZH', category: 'Scope & Community', positionRecommendation: 'Any Position' },
      { text: smartClamp(`查阅期刊同行评议规范`, 30), sourceFact: 'Peer Review', language: 'ZH', category: 'Journal Identity', positionRecommendation: 'Any Position' },
    ];

    if (outputLanguage === 'EN') return en.slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
    if (outputLanguage === 'ZH') return zh.slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
    return [...en.slice(0, 10), ...zh.slice(0, 5)].map(h => ({ ...h, charCount: h.text.length }));
  }

  // CON (Consideration) - Includes Journal Comparison
  if (stage === 'CON') {
    const en: HeadlineSeed[] = [
      { text: smartClamp(`Is Your Manuscript a Fit?`, 30), sourceFact: 'Fit Evaluation', language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 1' },
      { text: smartClamp(`${shortName} Aims & Scope`, 30), sourceFact: 'Scope Criteria', language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 1' },
      { text: smartClamp(`Evaluate ${shortName}`, 30), sourceFact: facts.journalName, language: 'EN', category: 'Journal Identity', positionRecommendation: 'Position 1' },
      // Conditional metrics (NO nulls)
      ...(impactHeadline ? [{ text: impactHeadline, sourceFact: impactHeadline, language: 'EN' as const, category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' }] : []),
      ...(facts.jcrQuartile ? [{ text: smartClamp(`Quartile ${facts.jcrQuartile}`, 30), sourceFact: 'JCR quartile', language: 'EN' as const, category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' }] : []),
      ...(articleTypeHeadline ? [{ text: smartClamp(articleTypeHeadline, 30), sourceFact: 'Article types', language: 'EN' as const, category: 'Scope & Community', positionRecommendation: 'Position 2' }] : []),
      ...(publishingHeadline ? [{ text: smartClamp(publishingHeadline, 30), sourceFact: 'Publishing model', language: 'EN' as const, category: 'Publishing Options', positionRecommendation: 'Position 2' }] : []),
      ...(facts.indexing?.length ? [{ text: smartClamp(`Indexed in ${facts.indexing.slice(0, 2).join(' & ')}`, 30), sourceFact: 'Indexing', language: 'EN' as const, category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' }] : []),
      ...(facts.articleDownloads ? [{ text: smartClamp(`${formatUsageCount(facts.articleDownloads)} Article Downloads`, 30), sourceFact: 'Article downloads', language: 'EN' as const, category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' }] : []),
      ...(facts.fullTextViews ? [{ text: smartClamp(`${formatUsageCount(facts.fullTextViews)} Full-Text Views`, 30), sourceFact: 'Full-text views', language: 'EN' as const, category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' }] : []),
      { text: smartClamp(`Rigorous Peer Review Standards`, 30), sourceFact: 'Editorial Standards', language: 'EN', category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' },
      ...(facts.firstDecisionDays ? [{ text: smartClamp(`Avg ${facts.firstDecisionDays} Days to 1st Decision`, 30), sourceFact: `${facts.firstDecisionDays} Days Decision`, language: 'EN' as const, category: 'Evaluation & Metrics', positionRecommendation: 'Position 3' }] : []),
      { text: smartClamp(`Compare Publishing Options`, 30), sourceFact: 'Comparison Evaluation', language: 'EN', category: 'Evaluation & Metrics', positionRecommendation: 'Position 3' },
      { text: smartClamp(`Transparent APC & OA Options`, 30), sourceFact: facts.openAccessType || 'Open Access', language: 'EN', category: 'Evaluation & Metrics', positionRecommendation: 'Position 3' },
      { text: smartClamp(`Accepted Article Types`, 30), sourceFact: 'Article Formats', language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 3' },
      { text: smartClamp(`Check Journal Fit`, 30), sourceFact: 'Evaluation CTA', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
      { text: smartClamp(`Review Aims and Scope`, 30), sourceFact: 'Scope Review', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
      { text: smartClamp(`Compare Editorial Metrics`, 30), sourceFact: 'Comparison Evaluation', language: 'EN', category: 'Evaluation & Metrics', positionRecommendation: 'Any Position' },
      { text: smartClamp(`Evaluate Publication Speed`, 30), sourceFact: 'Turnaround Evaluation', language: 'EN', category: 'Evaluation & Metrics', positionRecommendation: 'Any Position' },
      { text: smartClamp(`Explore Publishing Fit`, 30), sourceFact: 'Evaluation CTA', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
    ];

    const zh: HeadlineSeed[] = [
      ...(facts.casZone ? [{ text: smartClamp(`${facts.casZone.slice(0, 11)}评议标准`, 30), sourceFact: facts.casZone, language: 'ZH' as const, category: 'Evaluation & Metrics', positionRecommendation: 'Position 1' }] : []),
      { text: smartClamp(`查阅期刊范围与收稿类型`, 30), sourceFact: 'Scope Check', language: 'ZH', category: 'Scope & Community', positionRecommendation: 'Position 1' },
      ...(facts.firstDecisionDays ? [{ text: smartClamp(`平均初审周期约${facts.firstDecisionDays}天`, 30), sourceFact: `${facts.firstDecisionDays}天初审`, language: 'ZH' as const, category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' }] : []),
      ...(facts.articleDownloads ? [{ text: smartClamp(`文章下载量${formatUsageCount(facts.articleDownloads)}`, 30), sourceFact: 'Article downloads', language: 'ZH' as const, category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' }] : []),
      ...(facts.fullTextViews ? [{ text: smartClamp(`全文浏览量${formatUsageCount(facts.fullTextViews)}`, 30), sourceFact: 'Full-text views', language: 'ZH' as const, category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' }] : []),
      { text: smartClamp(`评估稿件学术契合度`, 30), sourceFact: 'Fit CTA', language: 'ZH', category: 'Call to Action', positionRecommendation: 'Position 2' },
      { text: smartClamp(`对比同类学术期刊指标`, 30), sourceFact: 'Comparison Evaluation', language: 'ZH', category: 'Evaluation & Metrics', positionRecommendation: 'Position 3' },
      { text: smartClamp(`核对分区与审稿流程`, 30), sourceFact: 'Evaluation & Metrics', language: 'ZH', category: 'Evaluation & Metrics', positionRecommendation: 'Position 3' },
      { text: smartClamp(`核对出版模式与支持政策`, 30), sourceFact: 'Publishing Options', language: 'ZH', category: 'Publishing Options', positionRecommendation: 'Any Position' },
      { text: smartClamp(`了解稿件学术契合标准`, 30), sourceFact: 'Scope Criteria', language: 'ZH', category: 'Scope & Community', positionRecommendation: 'Any Position' },
      { text: smartClamp(`理性评估期刊综合优势`, 30), sourceFact: 'Comparison Evaluation', language: 'ZH', category: 'Evaluation & Metrics', positionRecommendation: 'Any Position' },
      { text: smartClamp(`查阅编委会与同行评议`, 30), sourceFact: 'Editorial Standards', language: 'ZH', category: 'Evaluation & Metrics', positionRecommendation: 'Any Position' },
      { text: smartClamp(`审慎选刊对比分析指南`, 30), sourceFact: 'Comparison Evaluation', language: 'ZH', category: 'Call to Action', positionRecommendation: 'Any Position' },
      { text: smartClamp(`核对各栏目收稿要求`, 30), sourceFact: 'Article Formats', language: 'ZH', category: 'Scope & Community', positionRecommendation: 'Any Position' },
      { text: smartClamp(`查阅作者版面费与资助`, 30), sourceFact: 'Publishing Options', language: 'ZH', category: 'Publishing Options', positionRecommendation: 'Any Position' },
      { text: smartClamp(`评估科研成果适配刊物`, 30), sourceFact: 'Fit Evaluation', language: 'ZH', category: 'Call to Action', positionRecommendation: 'Any Position' },
      { text: smartClamp(`综合评估期刊学术声誉`, 30), sourceFact: 'Reputation', language: 'ZH', category: 'Evaluation & Metrics', positionRecommendation: 'Any Position' },
    ];

    if (outputLanguage === 'EN') return en.slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
    if (outputLanguage === 'ZH') return zh.slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
    return [...en.slice(0, 10), ...zh.slice(0, 5)].map(h => ({ ...h, charCount: h.text.length }));
  }

  // DEC (Decision)
  const en: HeadlineSeed[] = [
    { text: smartClamp(`Submit to ${shortName}`, 30), sourceFact: 'Submission Portal', language: 'EN', category: 'Journal Identity', positionRecommendation: 'Position 1' },
    ...(submissionHeadline ? [{ text: smartClamp(submissionHeadline, 30), sourceFact: 'Submission', language: 'EN' as const, category: 'Author Guidance', positionRecommendation: 'Position 1' }] : []),
    { text: smartClamp(`Author Guidelines & Checklist`, 30), sourceFact: 'Author Guidelines', language: 'EN', category: 'Author Guidance', positionRecommendation: 'Position 1' },
    { text: smartClamp(`Official Submission Portal`, 30), sourceFact: 'Verified Portal', language: 'EN', category: 'Author Guidance', positionRecommendation: 'Position 1' },
    { text: smartClamp(`Manuscript Prep Instructions`, 30), sourceFact: 'Preparation', language: 'EN', category: 'Author Guidance', positionRecommendation: 'Position 2' },
    { text: smartClamp(`Submission Checklist Download`, 30), sourceFact: 'Checklist', language: 'EN', category: 'Author Guidance', positionRecommendation: 'Position 2' },
    { text: smartClamp(`Transparent APC & Waivers`, 30), sourceFact: 'Fee Policies', language: 'EN', category: 'Author Guidance', positionRecommendation: 'Position 2' },
    ...(facts.firstDecisionDays ? [{ text: smartClamp(`First Decision in ${facts.firstDecisionDays} Days`, 30), sourceFact: `${facts.firstDecisionDays} Days Review`, language: 'EN' as const, category: 'Author Guidance', positionRecommendation: 'Position 3' }] : []),
    { text: smartClamp(`What to Expect After Submitting`, 30), sourceFact: 'Peer Review Workflow', language: 'EN', category: 'Author Guidance', positionRecommendation: 'Position 3' },
    { text: smartClamp(`View Submission Checklist`, 30), sourceFact: 'CTA', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
    { text: smartClamp(`Read Author Guidelines`, 30), sourceFact: 'CTA', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
    { text: smartClamp(`Start Your Submission`, 30), sourceFact: 'CTA', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
    { text: smartClamp(`Download Article Templates`, 30), sourceFact: 'Preparation', language: 'EN', category: 'Author Guidance', positionRecommendation: 'Any Position' },
    { text: smartClamp(`Direct Submission System`, 30), sourceFact: 'Portal', language: 'EN', category: 'Author Guidance', positionRecommendation: 'Any Position' },
    { text: smartClamp(`Review Checklist Before Submit`, 30), sourceFact: 'Checklist', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
    { text: smartClamp(`Online Peer Review Portal`, 30), sourceFact: 'Portal', language: 'EN', category: 'Author Guidance', positionRecommendation: 'Any Position' },
  ];

  const zh: HeadlineSeed[] = [
    { text: smartClamp(`${shortName} 作者投稿须知`, 30), sourceFact: 'Author Guide', language: 'ZH', category: 'Author Guidance', positionRecommendation: 'Position 1' },
    { text: smartClamp(`稿件体例规范与准备清单`, 30), sourceFact: 'Manuscript Prep', language: 'ZH', category: 'Author Guidance', positionRecommendation: 'Position 1' },
    ...(facts.firstDecisionDays ? [{ text: smartClamp(`初审参考周期约${facts.firstDecisionDays}天`, 30), sourceFact: `${facts.firstDecisionDays}天审稿`, language: 'ZH' as const, category: 'Author Guidance', positionRecommendation: 'Position 2' }] : []),
    { text: smartClamp(`查阅作者指南并提交稿件`, 30), sourceFact: 'CTA', language: 'ZH', category: 'Call to Action', positionRecommendation: 'Position 2' },
    { text: smartClamp(`在线系统投递学术稿件`, 30), sourceFact: 'Portal', language: 'ZH', category: 'Author Guidance', positionRecommendation: 'Position 3' },
    { text: smartClamp(`下载官方投稿排版模板`, 30), sourceFact: 'Templates', language: 'ZH', category: 'Author Guidance', positionRecommendation: 'Position 3' },
    { text: smartClamp(`核对投稿必需材料清单`, 30), sourceFact: 'Checklist', language: 'ZH', category: 'Author Guidance', positionRecommendation: 'Any Position' },
    { text: smartClamp(`官方投递系统入口通道`, 30), sourceFact: 'Portal', language: 'ZH', category: 'Author Guidance', positionRecommendation: 'Any Position' },
    { text: smartClamp(`了解稿件提交具体步骤`, 30), sourceFact: 'Submission Steps', language: 'ZH', category: 'Author Guidance', positionRecommendation: 'Any Position' },
    { text: smartClamp(`投前自查与格式校对清单`, 30), sourceFact: 'Checklist', language: 'ZH', category: 'Call to Action', positionRecommendation: 'Any Position' },
    { text: smartClamp(`国际学术出版标准规范`, 30), sourceFact: 'Standards', language: 'ZH', category: 'Author Guidance', positionRecommendation: 'Any Position' },
    { text: smartClamp(`在线提交完整学术手稿`, 30), sourceFact: 'CTA', language: 'ZH', category: 'Call to Action', positionRecommendation: 'Any Position' },
    { text: smartClamp(`查阅版面费与资助流程`, 30), sourceFact: 'Fees', language: 'ZH', category: 'Author Guidance', positionRecommendation: 'Any Position' },
    { text: smartClamp(`同行评议流程指引须知`, 30), sourceFact: 'Peer Review', language: 'ZH', category: 'Author Guidance', positionRecommendation: 'Any Position' },
    { text: smartClamp(`开始准备您的学术稿件`, 30), sourceFact: 'CTA', language: 'ZH', category: 'Call to Action', positionRecommendation: 'Any Position' },
  ];

  if (outputLanguage === 'EN') return en.slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
  if (outputLanguage === 'ZH') return zh.slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
  return [...en.slice(0, 10), ...zh.slice(0, 5)].map(h => ({ ...h, charCount: h.text.length }));
}

// Stage Descriptions with language purity
export function generateStageDescriptions(facts: any, stage: StageCode, outputLanguage: 'all' | 'EN' | 'ZH' = 'all') {
  facts = factsForCopy(facts);
  const aimsLines = pageFeatureLines(pageFeatureText(facts, 'aims_and_audience'), 90);
  const articleTypesText = pageFeatureText(facts, 'article_types');
  const publishingText = pageFeatureText(facts, 'publishing_model');
  const impactDescription = clarivateDescription(facts);
  const submissionText = pageFeatureText(facts, 'submission');
  const datedLines = datedFeatureLines(facts);
  const featureDescription = (text: string, sourceFact: string, theme: string) => ({
    text: smartClamp(text, 90),
    sourceFact,
    language: 'EN' as const,
    theme,
  });
  if (stage === 'AWA') {
    const en = [
      ...aimsLines.map((text) => featureDescription(text, 'Aims and audience', 'Scope & Relevance')),
      ...(articleTypesText ? [featureDescription(articleTypesText, 'Article types', 'Scope & Relevance')] : []),
      ...(publishingText ? [featureDescription(publishingText, 'Publishing model', 'Publishing Options')] : []),
      ...datedLines.map((text) => featureDescription(text, 'Dated usage', 'Evaluation & Metrics')),
      { text: smartClamp(`Explore research published in ${facts.journalName}. Serving the global scientific community.`, 90), sourceFact: 'Journal Overview', language: 'EN' as const, theme: 'Scope & Relevance' },
      { text: smartClamp(`Discover multidisciplinary advances and innovative discoveries across ${facts.primaryDiscipline}.`, 90), sourceFact: facts.primaryDiscipline, language: 'EN' as const, theme: 'Scope & Relevance' },
      { text: smartClamp(`Published by ${facts.publisher}. Connect with global readership and open scholarship.`, 90), sourceFact: facts.publisher, language: 'EN' as const, theme: 'Scope & Relevance' },
      { text: smartClamp(`Browse recent articles, view journal scope, and explore research topics today.`, 90), sourceFact: 'Discovery CTA', language: 'EN' as const, theme: 'Scope & Relevance' },
    ];
    const zh = [
      { text: smartClamp(`了解 ${facts.journalName} 的学术范畴与研究议题，探索 ${facts.publisher} 前沿学术成果。`, 90), sourceFact: 'Journal Scope', language: 'ZH' as const, theme: 'Scope & Relevance' },
      { text: smartClamp(`汇聚领域前沿论文，促进国际学者学术交流与知识共享，欢迎查阅最新研究成果。`, 90), sourceFact: 'Community Readership', language: 'ZH' as const, theme: 'Scope & Relevance' },
      { text: smartClamp(`查阅期刊学术定位、出版宗旨及最新录用论文成果，探索国际前沿科研动态。`, 90), sourceFact: 'Discovery', language: 'ZH' as const, theme: 'Scope & Relevance' },
      { text: smartClamp(`由知名出版机构提供高质量学术平台，赋能科研人员把握学科发展脉络。`, 90), sourceFact: facts.publisher, language: 'ZH' as const, theme: 'Scope & Relevance' },
    ];
    if (outputLanguage === 'EN') return en.map(d => ({ ...d, charCount: d.text.length }));
    if (outputLanguage === 'ZH') return zh.map(d => ({ ...d, charCount: d.text.length }));
    return mixedDescriptions(en, zh);
  }

  if (stage === 'CON') {
    const daysText = facts.firstDecisionDays ? `First decision in ${facts.firstDecisionDays} days.` : 'Editorial criteria are listed on the journal site.';
    const feeText = facts.apcUsd ? `APC ($${facts.apcUsd})` : 'publishing options';
    const casText = facts.casZone ? `（${facts.casZone.slice(0, 10)}）` : '';
    const downloadsText = facts.articleDownloads
      ? `${formatUsageCount(facts.articleDownloads)} article downloads.`
      : facts.fullTextViews
        ? `${formatUsageCount(facts.fullTextViews)} full-text views.`
        : '';

    const en = [
      ...aimsLines.map((text) => featureDescription(text, 'Aims and audience', 'Scope & Relevance')),
      ...(articleTypesText ? [featureDescription(articleTypesText, 'Article types', 'Scope & Relevance')] : []),
      ...(publishingText ? [featureDescription(publishingText, 'Publishing model', 'Publishing Options')] : []),
      ...datedLines.map((text) => featureDescription(text, 'Dated usage', 'Evaluation & Metrics')),
      ...(impactDescription ? [{ text: smartClamp(impactDescription, 90), sourceFact: 'Clarivate impact factor', language: 'EN' as const, theme: 'Evaluation & Peer Review' }] : []),
      ...(facts.jcrQuartile ? [featureDescription(`Quartile ${facts.jcrQuartile}`, 'JCR quartile', 'Evaluation & Peer Review')] : []),
      { text: smartClamp(`Evaluate ${facts.journalName} for your paper. ${facts.indexing?.length ? `indexed in ${facts.indexing.slice(0, 2).join(' & ')}.` : 'Review the aims and scope.'}`, 90), sourceFact: 'Evaluation', language: 'EN' as const, theme: 'Evaluation & Peer Review' },
      ...(downloadsText ? [{ text: smartClamp(downloadsText, 90), sourceFact: facts.articleDownloads ? 'Article downloads' : 'Full-text views', language: 'EN' as const, theme: 'Readership' }] : []),
      { text: smartClamp(`Transparent publishing options and editorial criteria. ${daysText}`, 90), sourceFact: 'Turnaround', language: 'EN' as const, theme: 'Evaluation & Peer Review' },
      { text: smartClamp(`Review accepted article types, transparent ${feeText}, and peer review workflow.`, 90), sourceFact: 'Publishing Options', language: 'EN' as const, theme: 'Publishing Options' },
      { text: smartClamp(`Compare scope, turnaround metrics, and open access models to make an informed choice.`, 90), sourceFact: 'Comparison Evaluation', language: 'EN' as const, theme: 'Comparison & Fit' },
    ];
    const zh = [
      { text: smartClamp(`核对研究范围、同行评审流程与收录指标${casText}，评估稿件学术契合度。`, 90), sourceFact: 'Evaluation', language: 'ZH' as const, theme: 'Evaluation & Peer Review' },
      { text: smartClamp(`提供透明的发表模式与同行评议标准，对比同类学术期刊指标，助您理性选刊。`, 90), sourceFact: 'Comparison Evaluation', language: 'ZH' as const, theme: 'Publishing Options' },
      { text: smartClamp(`查阅作者要求、出版模式及同行评审流程，为您的学术成果选择适宜期刊。`, 90), sourceFact: 'Scope Check', language: 'ZH' as const, theme: 'Evaluation & Peer Review' },
      { text: smartClamp(`客观对比各期刊审稿周期与收稿方向，基于真实指标评估稿件发表定位。`, 90), sourceFact: 'Comparison Evaluation', language: 'ZH' as const, theme: 'Comparison & Fit' },
    ];
    if (outputLanguage === 'EN') return en.map(d => ({ ...d, charCount: d.text.length }));
    if (outputLanguage === 'ZH') return zh.map(d => ({ ...d, charCount: d.text.length }));
    const usageLine = en.find((item) => item.theme === 'Readership');
    return mixedDescriptions(en, zh, usageLine);
  }

  // DEC
  const en = [
    ...datedLines.map((text) => featureDescription(text, 'Dated usage', 'Evaluation & Metrics')),
    ...(submissionText ? [{ text: smartClamp(submissionText, 90), sourceFact: 'Submission', language: 'EN' as const, theme: 'Author Checklist' }] : []),
    { text: smartClamp(`Prepare your manuscript for ${facts.journalName}. Access author guidelines and checklist.`, 90), sourceFact: 'Author Guidelines', language: 'EN' as const, theme: 'Author Checklist' },
    { text: smartClamp(`Clear manuscript formatting instructions and required documents for official submission.`, 90), sourceFact: 'Manuscript Prep', language: 'EN' as const, theme: 'Author Checklist' },
    { text: smartClamp(`Review fee waiver policies and submit directly through the verified Springer Nature portal.`, 90), sourceFact: 'Submission Portal', language: 'EN' as const, theme: 'Publishing Options' },
    { text: smartClamp(`Rigorous peer review with straightforward online manuscript tracking from submission.`, 90), sourceFact: 'Peer Review Workflow', language: 'EN' as const, theme: 'Evaluation & Peer Review' },
  ];
  const zh = [
    { text: smartClamp(`查阅作者投稿须知、格式规范与稿件提交清单，通过 Springer Nature 官方系统在线投递。`, 90), sourceFact: 'Author Portal', language: 'ZH' as const, theme: 'Author Checklist' },
    { text: smartClamp(`准备完整投稿材料，获取官方模板，按流程在线递交经过校对的学术手稿。`, 90), sourceFact: 'Submission Steps', language: 'ZH' as const, theme: 'Publishing Options' },
    { text: smartClamp(`提供详尽作者准备清单与格式规范，支持在线追踪稿件审稿状态。`, 90), sourceFact: 'Manuscript Prep', language: 'ZH' as const, theme: 'Author Checklist' },
    { text: smartClamp(`严格遵循学术规范，查阅版面费与资助支持细则，安全提交研究手稿。`, 90), sourceFact: 'Submission Portal', language: 'ZH' as const, theme: 'Publishing Options' },
  ];
  if (outputLanguage === 'EN') return en.map(d => ({ ...d, charCount: d.text.length }));
  if (outputLanguage === 'ZH') return zh.map(d => ({ ...d, charCount: d.text.length }));
  return mixedDescriptions(en, zh);
}

export function generateStageKeywords(facts: any, stage: StageCode) {
  facts = factsForCopy(facts);
  const shortName = facts.journalName.toLowerCase();
  const disc = (facts.primaryDiscipline || 'science').toLowerCase().split('(')[0].trim();

  if (stage === 'AWA') {
    return {
      englishSearchKeywords: [
        { keyword: `${disc} research articles`, matchType: 'Broad' as const, intent: 'Research Discovery' },
        { keyword: `"${facts.journalName.toLowerCase()}" overview`, matchType: 'Phrase' as const, intent: 'Journal Discovery' },
        { keyword: `explore ${facts.publisher.toLowerCase()} journals`, matchType: 'Phrase' as const, intent: 'Publisher Discovery' },
        { keyword: `[${facts.journalName.toLowerCase()} scope]`, matchType: 'Exact' as const, intent: 'Scope Discovery' },
      ],
      chineseAuthorKeywords: [
        { keywordZh: `${facts.journalName} 期刊介绍与研究方向`, matchType: '短语 (Phrase)' as const, intentZh: '了解学科范畴' },
        { keywordZh: `${disc} 学术前沿文献`, matchType: '短语 (Phrase)' as const, intentZh: '学术发现与阅读' },
        { keywordZh: `${facts.publisher} 旗下学术期刊`, matchType: '短语 (Phrase)' as const, intentZh: '出版机构发现' },
      ],
      negativeKeywords: ['代写', '买卖论文', '包录用', '降重包过', '枪手', '论文代发中介'],
    };
  }

  if (stage === 'CON') {
    return {
      englishSearchKeywords: [
        ...(facts.impactFactor
          ? [{ keyword: `[${shortName} impact factor]`, matchType: 'Exact' as const, intent: 'Metric Evaluation' }]
          : []),
        { keyword: `"${shortName} aims and scope"`, matchType: 'Phrase' as const, intent: 'Fit Evaluation' },
        { keyword: `"${shortName} compared to similar journals"`, matchType: 'Phrase' as const, intent: 'Journal Comparison' },
        { keyword: `[${shortName} review time vs standard]`, matchType: 'Exact' as const, intent: 'Turnaround Check' },
      ],
      chineseAuthorKeywords: [
        { keywordZh: `${facts.journalName} 和同类期刊对比`, matchType: '短语 (Phrase)' as const, intentZh: '选刊横向对比' },
        { keywordZh: `${facts.journalName} 分区 影响因子`, matchType: '短语 (Phrase)' as const, intentZh: '分区与考核标准' },
        { keywordZh: `${facts.journalName} 审稿周期与收稿范围`, matchType: '短语 (Phrase)' as const, intentZh: '稿件契合度评估' },
      ],
      negativeKeywords: ['代写', '买卖论文', '包录用', '降重包过', '枪手', '论文代发中介'],
    };
  }

  // DEC
  return {
    englishSearchKeywords: [
      { keyword: `[submit manuscript ${shortName}]`, matchType: 'Exact' as const, intent: 'Direct Submission' },
      { keyword: `"${shortName} author guidelines"`, matchType: 'Phrase' as const, intent: 'Manuscript Preparation' },
      { keyword: `"${shortName} submission portal"`, matchType: 'Phrase' as const, intent: 'Submission System' },
      { keyword: `[${shortName} manuscript checklist]`, matchType: 'Exact' as const, intent: 'Pre-submission Checklist' },
    ],
    chineseAuthorKeywords: [
      { keywordZh: `${facts.journalName} 官方投稿系统入口`, matchType: '短语 (Phrase)' as const, intentZh: '在线提交稿件' },
      { keywordZh: `${facts.journalName} 作者指南与格式体例`, matchType: '短语 (Phrase)' as const, intentZh: '准备投稿文件' },
      { keywordZh: `${facts.journalName} 投稿模板与流程`, matchType: '短语 (Phrase)' as const, intentZh: '提交前格式校对' },
    ],
    negativeKeywords: ['代写', '买卖论文', '包录用', '降重包过', '枪手', '论文代发中介'],
  };
}

export function generateStageDisplayAd(facts: any, stage: StageCode) {
  facts = factsForCopy(facts);
  const shortName = facts.journalName.length > 18 ? facts.journalName.slice(0, 18) : facts.journalName;

  if (stage === 'AWA') {
    return {
      shortHeadline: smartClamp(`Explore ${shortName}`, 30),
      shortHeadlineCharCount: 0,
      longHeadline: smartClamp(`Discover Pioneering Research in ${facts.journalName} · ${facts.publisher}`, 90),
      longHeadlineCharCount: 0,
      description: smartClamp(`Browse latest scientific advances and breakthroughs across ${facts.primaryDiscipline}.`, 90),
      descriptionCharCount: 0,
      businessName: facts.publisher,
      ctaText: 'Explore Journal',
      visualConceptPrompt: `An academic research banner focusing on scientific discovery, high-resolution microscopy or molecular lattice, subtle journal cover, and clean Springer Nature branding. Low text density.`,
      imageAccentColor: '#002d62',
      targetPlacements: ['researchgate.net', 'ncbi.nlm.nih.gov (PubMed)', 'sciencedirect.com', 'nature.com'],
      bannerHeadlineZh: `探索 ${facts.journalName} 学术成果`,
      bannerSubtextZh: `由 ${facts.publisher} 出版 · 汇聚全球前沿学术发现与学科突破`,
    };
  }

  if (stage === 'CON') {
    const metricStr = clarivateDescription(facts) || 'Peer-Reviewed Research';
    return {
      shortHeadline: smartClamp(`Check ${shortName} Fit`, 30),
      shortHeadlineCharCount: 0,
      longHeadline: smartClamp(`Evaluate ${facts.journalName}: ${metricStr}, Peer-Reviewed Rigor`, 90),
      longHeadlineCharCount: 0,
      description: smartClamp(`Transparent editorial standards, accepted formats, and objective journal metrics comparison.`, 90),
      descriptionCharCount: 0,
      businessName: facts.publisher,
      ctaText: 'Check Journal Fit',
      visualConceptPrompt: `An objective academic evaluation ad featuring the official journal cover and a professional scholarly palette. Do not draw impact-factor, quartile, or Clarivate badges.`,
      imageAccentColor: '#1e1b4b',
      targetPlacements: ['researchgate.net', 'ncbi.nlm.nih.gov (PubMed)', 'scholar.google.com', 'nature.com'],
      bannerHeadlineZh: `${facts.journalName} 选刊评估指南`,
      bannerSubtextZh: `核对学术契合度、审稿流程与收稿范围`,
    };
  }

  // DEC
  return {
    shortHeadline: smartClamp(`Submit to ${shortName}`, 30),
    shortHeadlineCharCount: 0,
    longHeadline: smartClamp(`Author Guidelines & Submission Portal: ${facts.journalName}`, 90),
    longHeadlineCharCount: 0,
    description: smartClamp(`Access manuscript preparation checklists and submit directly via the official Springer Nature portal.`, 90),
    descriptionCharCount: 0,
    businessName: facts.publisher,
    ctaText: 'View Checklist',
    visualConceptPrompt: `A streamlined author guidance banner showcasing a manuscript submission checklist icon, clear typography, verified portal badge, and Springer Nature integrity crest.`,
    imageAccentColor: '#064e3b',
    targetPlacements: ['researchgate.net', 'ncbi.nlm.nih.gov (PubMed)', 'nature.com', 'springerlink.com'],
    bannerHeadlineZh: `${facts.journalName} 作者投稿须知`,
    bannerSubtextZh: `获取官方投稿清单与格式指南 · 在线投递学术稿件`,
  };
}

function uniqueSitelinks(
  links: { title: string; desc: string; urlPath: string }[],
  landingUrl: string
) {
  const seen = new Set<string>();
  const landingKey = normalizeJournalUrl(landingUrl).canonical;
  if (landingKey) seen.add(landingKey);
  return links.filter((link) => {
    const key = normalizeJournalUrl(link.urlPath).canonical;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function generateDeterministicCampaign(
  facts: any,
  stage: StageCode,
  outputLanguage: 'all' | 'EN' | 'ZH' = 'all'
) {
  const stageConfig = STAGE_CONFIGS[stage];
  const headlines = generateStageHeadlines(facts, stage, outputLanguage);
  const descriptions = generateStageDescriptions(facts, stage, outputLanguage);
  const keywords = generateStageKeywords(facts, stage);
  const displayAd = generateStageDisplayAd(facts, stage);

  displayAd.shortHeadlineCharCount = displayAd.shortHeadline.length;
  displayAd.longHeadlineCharCount = displayAd.longHeadline.length;
  displayAd.descriptionCharCount = displayAd.description.length;

  const copyFacts = factsForCopy(facts);
  const destinationUrl = stageDestinationUrl(facts, stage);
  const sitelink = (title: string, desc: string, role: Parameters<typeof resolveCampaignUrl>[1]) => ({
    title,
    desc,
    urlPath: resolveCampaignUrl(facts, role),
  });

  const sitelinks = uniqueSitelinks(
    stage === 'AWA'
      ? [
          sitelink('Journal Overview & Scope', 'Explore research fields and mission', 'about'),
          sitelink('Browse Latest Articles', 'Read recent peer-reviewed discoveries', 'articles'),
          sitelink('Editorial Leadership', 'Meet the international editorial board', 'editors'),
          sitelink('Research Collections', 'Curated thematic paper collections', 'collections'),
        ]
      : stage === 'CON'
      ? [
          sitelink('Aims & Scope Evaluation', 'Check topical alignment and criteria', 'aims'),
          sitelink('Article Types & Formats', 'Accepted original research and reviews', 'articles'),
          sitelink('Journal Metrics & Indexing', 'Indexing and journal metrics', 'landing'),
          sitelink('Publishing Options & Fees', 'Transparent APC and OA publishing', 'fees'),
        ]
      : [
          sitelink('Author Guidelines', 'Manuscript preparation and style guide', 'guidelines'),
          sitelink('Submission Checklist', 'Required documentation before submitting', 'checklist'),
          sitelink('APC & Waiver Criteria', 'Fee policy and funding guidelines', 'fees'),
          sitelink('Online Submission Portal', 'Submit paper for peer review', 'submission'),
        ],
    campaignLandingUrl(facts)
  );

  const labelledImpact = clarivateHeadline(copyFacts);
  const impactCallout = labelledImpact && countCharacterWidth(labelledImpact) <= 25 ? labelledImpact : 'Peer-reviewed journal';
  const callouts =
    stage === 'AWA'
      ? [`Published by ${facts.publisher}`, (facts.primaryDiscipline || 'Scientific Research').split('(')[0].trim(), 'Global Readership', 'Peer-Reviewed Science']
      : stage === 'CON'
      ? [impactCallout, copyFacts.casZone ? copyFacts.casZone.slice(0, 14) : 'Peer-Reviewed Quality', copyFacts.firstDecisionDays ? `1st Decision: ${copyFacts.firstDecisionDays} Days` : 'Editorial Standards', 'Transparent Policies']
      : ['Author Guidelines Ready', 'Standard Preparation Checklist', copyFacts.firstDecisionDays ? `First Decision: ${copyFacts.firstDecisionDays} Days` : 'Editorial Standards', 'Official Submission Portal'];

  return guardAdCopy({
    funnelStage: stage,
    legacyStage: stage === 'AWA' ? 'TOFU' : stage === 'CON' ? 'MOFU' : 'BOFU',
    clarivateFacts: facts,
    funnelStrategyNote: `${stageConfig.name}: ${stageConfig.campaignObjective}`,
    primaryCta: stageConfig.primaryCta,
    recommendedDestination: {
      label: stageConfig.recommendedDestination.label,
      url: destinationUrl,
      description: stageConfig.recommendedDestination.description,
    },
    generationSource: 'template_fallback' as const,
    searchAds: {
      headlines,
      descriptions,
      sitelinks,
      callouts,
      structuredSnippet: {
        header: 'Disciplines',
        values: [(facts.primaryDiscipline || 'Scientific Research').split('(')[0].trim(), facts.publisher, 'Peer-Reviewed Research'],
      },
      recommendedFinalUrl: destinationUrl,
    },
    displayAds: {
      ...displayAd,
      recommendedFinalUrl: destinationUrl,
    },
    keywords,
  }, facts);
}

// 3. Campaign Generation API
app.post('/api/generate-campaign', async (req, res) => {
  try {
    const {
      landingPageUrl,
      channels = ['search', 'display'],
      funnelStage = 'CON',
      outputLanguage = 'all',
      customPlaybook = '',
      userProvidedFacts = null,
    } = req.body;

    const normalizedStage = normalizeStage(funnelStage);
    const stageConfig = STAGE_CONFIGS[normalizedStage];

    // Browser-supplied facts are always user-entered. A hand edit cannot keep a Clarivate label.
    let facts: JCRJournalEntry;
    if (userProvidedFacts && userProvidedFacts.verificationStatus === 'user_provided') {
      let sanitized;
      try {
        sanitized = sanitizeUserProvidedFacts(userProvidedFacts);
      } catch (err) {
        if (err instanceof MetricsValidationError) {
          return res.status(400).json({ error: err.message });
        }
        throw err;
      }
      const norm = normalizeJournalUrl(sanitized.url);
      const canonical = norm.canonical || sanitized.url;
      if (rejectedJournalHost(res, canonical)) return;
      facts = attachCachedPageFacts({
        ...sanitized,
        url: canonical,
        slugs: [],
        verificationStatus: 'user_provided',
        provenanceSource: 'user_provided',
        isVerifiedClarivate: false,
        sourceAttribution: MANUAL_METRIC_SOURCE,
        missingFields: [],
      });
    } else {
      facts = await lookupClarivateFacts(landingPageUrl);
    }

    // Unknown journals have no identity to advertise. Snapshot and trusted records can
    // generate copy; untrusted numbers are omitted by factsForCopy and the claim guard.
    if (facts.verificationStatus === 'missing') {
      return res.status(400).json({
        error: 'Please complete journal metrics to continue. No trusted or catalog record exists for this URL.',
        missingFields: facts.missingFields || ['impactFactor', 'casZone', 'firstDecisionDays', 'apcUsd'],
        facts,
      });
    }

    let campaignOutput: any = null;
    let generationSource: 'ai_grounded' | 'template_fallback' = 'template_fallback';

    if (ai) {
      const prompt = `You are a Senior Academic Publishing Growth Marketer at Springer Nature.
Generate a Google Ads campaign tailored to the author marketing stage: "${stageConfig.name}".

AUDIENCE AND STAGE STRATEGY:
- Target Stage: ${stageConfig.name}
- Author Mindset: ${stageConfig.authorMindset}
- Campaign Objective: ${stageConfig.campaignObjective}
- Required Tone: ${stageConfig.tone}
- Primary CTA: "${stageConfig.primaryCta}"

STAGE SPECIFIC RULES:
${
  normalizedStage === 'AWA'
    ? `* Awareness: Focus on scope, research fields, publisher identity. Low-pressure. NO submission pressure, NO deadlines.`
    : normalizedStage === 'CON'
    ? `* Consideration: Focus on evaluation, article types, fees, review turnaround, and journal comparison keywords. DO NOT invent competitor claims.`
    : `* Decision: Practical author guidelines, manuscript checklist, submission portal. NO guaranteed acceptance claims.`
}

JOURNAL:
- Name: ${facts.journalName} (${facts.publisher})
- Discipline: ${facts.primaryDiscipline || 'Not stated'}
- Open access model: ${facts.openAccessType || 'Not stated'}
- Indexing: ${facts.indexing?.length ? facts.indexing.join(', ') : 'Not stated'}
- Output Language: ${outputLanguage}

${metricPromptSection(facts)}

${formatLandingPagePromptSection(facts)}

${customPlaybook ? `PLAYBOOK RULES:\n${customPlaybook}\n` : ''}

GOOGLE ADS REQUIREMENTS:
1. Search Headlines: 15 items, strictly <=30 visual width.
2. Search Descriptions: 4 items, strictly <=90 visual width.
3. Language purity: If language is 'EN', output ZERO Chinese characters. If 'ZH', output ZERO Latin letters.`;

      try {
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('AI generation timed out')), 6500)
        );

        const aiPromise = ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
          },
        });

        const response: any = await Promise.race([aiPromise, timeoutPromise]);
        if (response && response.text) {
          campaignOutput = JSON.parse(response.text);
          generationSource = 'ai_grounded';
        }
      } catch (e: any) {
        console.warn('AI generation bypassed to deterministic stage engine:', e.message);
      }
    }

    if (!campaignOutput || !campaignOutput.searchAds) {
      campaignOutput = generateDeterministicCampaign(facts, normalizedStage, outputLanguage);
      generationSource = 'template_fallback';
    }

    // STRICT AD FORMAT VALIDATION & CLAMPING
    const fallback = generateDeterministicCampaign(facts, normalizedStage, outputLanguage);

    if (campaignOutput.searchAds) {
      let headlines = campaignOutput.searchAds.headlines || [];
      // Pad to 15
      if (headlines.length < 15) {
        for (const fb of fallback.searchAds.headlines) {
          if (headlines.length >= 15) break;
          if (!headlines.some((h: any) => h.text.toLowerCase() === fb.text.toLowerCase())) {
            headlines.push(fb);
          }
        }
      }

      campaignOutput.searchAds.headlines = headlines.slice(0, 15).map((h: any, idx: number) => {
        const clamped = smartClamp(h.text, 30);
        return {
          ...h,
          text: clamped,
          charCount: clamped.length,
          charWidth: countCharacterWidth(clamped),
          positionRecommendation: h.positionRecommendation || (idx < 3 ? 'Position 1' : idx < 6 ? 'Position 2' : 'Any Position'),
        };
      });

      let descs = campaignOutput.searchAds.descriptions || [];
      for (const line of [...datedFeatureLines(facts)].reverse()) {
        const already = descs.some((item: { text?: string }) => (item.text || '').includes(line));
        if (!already) descs.unshift({ text: line, sourceFact: 'Dated usage', language: 'EN', theme: 'Evaluation & Metrics' });
      }
      if (descs.length < 4) {
        for (const fd of fallback.searchAds.descriptions) {
          if (descs.length >= 4) break;
          descs.push(fd);
        }
      }

      campaignOutput.searchAds.descriptions = descs.slice(0, 4).map((d: any) => {
        const clamped = smartClamp(d.text, 90);
        return {
          ...d,
          text: clamped,
          charCount: clamped.length,
          charWidth: countCharacterWidth(clamped),
        };
      });

      campaignOutput.searchAds.callouts = campaignOutput.searchAds.callouts || fallback.searchAds.callouts;
      campaignOutput.searchAds.sitelinks = fallback.searchAds.sitelinks;
    }

    if (campaignOutput.displayAds) {
      campaignOutput.displayAds.shortHeadline = smartClamp(campaignOutput.displayAds.shortHeadline || fallback.displayAds.shortHeadline, 30);
      campaignOutput.displayAds.shortHeadlineCharCount = campaignOutput.displayAds.shortHeadline.length;
      campaignOutput.displayAds.shortHeadlineCharWidth = countCharacterWidth(campaignOutput.displayAds.shortHeadline);

      campaignOutput.displayAds.longHeadline = smartClamp(campaignOutput.displayAds.longHeadline || fallback.displayAds.longHeadline, 90);
      campaignOutput.displayAds.longHeadlineCharCount = campaignOutput.displayAds.longHeadline.length;
      campaignOutput.displayAds.longHeadlineCharWidth = countCharacterWidth(campaignOutput.displayAds.longHeadline);

      campaignOutput.displayAds.description = smartClamp(campaignOutput.displayAds.description || fallback.displayAds.description, 90);
      campaignOutput.displayAds.descriptionCharCount = campaignOutput.displayAds.description.length;
      campaignOutput.displayAds.descriptionCharWidth = countCharacterWidth(campaignOutput.displayAds.description);

      campaignOutput.displayAds.ctaText = campaignOutput.displayAds.ctaText || stageConfig.primaryCta;
      campaignOutput.displayAds.businessName = campaignOutput.displayAds.businessName || facts.publisher;
      campaignOutput.displayAds.targetPlacements = campaignOutput.displayAds.targetPlacements || fallback.displayAds.targetPlacements;
    }

    const destinationUrl = stageDestinationUrl(facts, normalizedStage);

    const campaign = guardAdCopy({
      funnelStage: normalizedStage,
      legacyStage: normalizedStage === 'AWA' ? 'TOFU' : normalizedStage === 'CON' ? 'MOFU' : 'BOFU',
      clarivateFacts: facts,
      funnelStrategyNote: `${stageConfig.name}: ${stageConfig.campaignObjective}`,
      primaryCta: campaignOutput.primaryCta || stageConfig.primaryCta,
      generationSource,
      outputLanguage,
      generatedAt: new Date().toISOString(),
      ...campaignOutput,
      recommendedDestination: {
        label: stageConfig.recommendedDestination.label,
        url: destinationUrl,
        description: stageConfig.recommendedDestination.description,
      },
    }, facts);

    res.json({ success: true, campaign });
  } catch (error: any) {
    if (error instanceof LandingPageError) {
      const status = error.code === 'ssrf' ? 400 : 502;
      return res.status(status).json({ error: error.message });
    }
    console.error('Campaign generation failed:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

// 4. API: Compare All 3 Stages (AWA, CON, DEC) Side-by-Side
app.post('/api/compare-stages', async (req, res) => {
  try {
    const { landingPageUrl, outputLanguage = 'all' } = req.body;
    const facts = await lookupClarivateFacts(landingPageUrl);

    const awa = generateDeterministicCampaign(facts, 'AWA', outputLanguage);
    const con = generateDeterministicCampaign(facts, 'CON', outputLanguage);
    const dec = generateDeterministicCampaign(facts, 'DEC', outputLanguage);

    res.json({
      success: true,
      facts,
      stages: {
        AWA: awa,
        CON: con,
        DEC: dec,
      },
    });
  } catch (err: any) {
    if (err instanceof LandingPageError) {
      const status = err.code === 'ssrf' ? 400 : 502;
      return res.status(status).json({ error: err.message });
    }
    console.error('Compare stages failed:', err);
    res.status(500).json({ error: err.message || 'Failed to compare stages' });
  }
});

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export async function startServer() {
  assertProductionAuthConfig();
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Springer Nature Ad Engine running on http://0.0.0.0:${PORT}`);
  });
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (invokedDirectly) {
  startServer().catch((err) => {
    console.error('Server failed to start:', err);
    process.exit(1);
  });
}
