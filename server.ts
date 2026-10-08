import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadMetricsCacheFromDisk } from './src/utils/metricsCache';
import { JOURNAL_CATALOG } from './src/data/journalCatalog';
import { joinJournalUrl, normalizeJournalUrl, journalUrlsMatch } from './src/utils/journalUrl';
import { installClarivateClient, pageFacts } from './src/utils/metricSources';
import { clarivateWosJournals as clarivateHttpClient } from './src/utils/clarivateHttp';
import { factsForCopy, formatJifClaim, guardAdCopy, metricPromptSection, sanitizeUserProvidedFacts } from './src/utils/metricClaims';
import type { ClarivateJournalMetrics } from './src/types';
import { loadJournalMetrics } from './src/utils/metricsRefresh';
import { normalizeIssn } from './src/utils/issn';

dotenv.config();
installClarivateClient(clarivateHttpClient);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '15mb' }));

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
  jcrTitle?: string;
  isoTitle?: string;
  wosName?: string;
  catalogDataYear?: number;
  missingFields?: string[];
  isVerifiedClarivate?: boolean;
  reportingYear?: string;
  sourceAttribution: string;
  isFromCache?: boolean;
  cachedAt?: string;
  cacheExpiresAt?: string;
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
}

// --- PERSISTENT METRICS CACHE (metrics-cache.json) ---
const CACHE_FILE_PATH = path.resolve(__dirname, 'metrics-cache.json');
const metricsCache = new Map<string, CachedJournal>();

function loadCacheFromDisk() {
  const loaded = loadMetricsCacheFromDisk<CachedJournal>(CACHE_FILE_PATH);
  loaded.forEach((val, key) => {
    // Clarivate editions live in the metrics store, not metrics-cache.json.
    if (val.fullFacts?.provenanceSource === 'clarivate_wos_journals_api') return;
    metricsCache.set(key, val);
  });
}

function saveCacheToDisk() {
  try {
    const obj: Record<string, CachedJournal> = {};
    metricsCache.forEach((val, key) => {
      obj[key] = val;
    });
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(obj, null, 2), 'utf-8');
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
      urlPath: '/about',
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
      urlPath: '/aims-and-scope',
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
      urlPath: '/submission-guidelines',
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

function rememberJournal(journalId: string, facts: JCRJournalEntry) {
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
  metricsCache.set(journalId, cachedEntry);
  if (facts.provenanceSource !== 'clarivate_wos_journals_api') {
    saveCacheToDisk();
  }
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

const PLACEHOLDER_LABEL = /^(unknown journal|unknown publisher)$/i;

function labelText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || PLACEHOLDER_LABEL.test(trimmed)) return '';
  return trimmed;
}

/** True when every letter is uppercase, as in the Web of Science id NATURE. */
export function isShoutyLabel(value: string): boolean {
  const letters = value.replace(/[^A-Za-z]/g, '');
  return letters.length >= 2 && letters === letters.toUpperCase();
}

/** Society and publisher acronyms that stay uppercase when an all-caps name is title-cased. */
const DISPLAY_ACRONYMS = new Set([
  'ACM',
  'ACS',
  'AIP',
  'AMS',
  'APS',
  'ASME',
  'BMC',
  'BMJ',
  'IEEE',
  'IET',
  'IOP',
  'JAMA',
  'OSA',
  'PLOS',
  'PNAS',
  'RSC',
  'SIAM',
  'SPIE',
]);

/** Title-case an all-caps Clarivate label. Mixed-case text is left as it arrived. */
export function toDisplayCase(value: string): string {
  if (!value || !isShoutyLabel(value)) return value;
  return value.replace(/[A-Za-z0-9]+/g, (word) => {
    const upper = word.toUpperCase();
    if (DISPLAY_ACRONYMS.has(upper)) return upper;
    return upper.charAt(0) + upper.slice(1).toLowerCase();
  });
}

function filled(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return labelText(value).length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  return true;
}

/**
 * Display title: isoTitle or jcrTitle, then the landing-page name, then the
 * Web of Science name. An all-caps id is title-cased so ads do not say NATURE.
 */
export function displayJournalName(
  api: { jcrTitle?: string; isoTitle?: string; journalName?: string; wosName?: string },
  landingName?: string
): string {
  const proper = [api.jcrTitle, api.isoTitle].map(labelText).find((value) => value && !isShoutyLabel(value));
  if (proper) return proper;
  const landing = labelText(landingName);
  if (landing && !isShoutyLabel(landing)) return landing;
  const raw = labelText(api.journalName) || labelText(api.wosName) || landing;
  if (!raw) return landing || 'Journal';
  return toDisplayCase(raw);
}

/**
 * Prefer a mixed-case publisher. An all-caps API value is title-cased when
 * the landing page has no mixed-case publisher. "Unknown publisher" is dropped.
 */
export function displayPublisher(apiPublisher: unknown, landingPublisher?: string): string {
  const api = labelText(apiPublisher);
  const landing = labelText(landingPublisher);
  if (api && !isShoutyLabel(api)) return api;
  if (landing && !isShoutyLabel(landing)) return landing;
  return toDisplayCase(api || landing);
}

/** Copy with a safe journal name and publisher for headlines and callouts. */
export function withAdIdentity<T extends { journalName?: string; publisher?: string; jcrTitle?: string; isoTitle?: string; wosName?: string }>(
  facts: T
): T {
  return {
    ...facts,
    journalName: displayJournalName(facts, facts.journalName),
    publisher: displayPublisher(facts.publisher, facts.publisher),
  };
}

/**
 * ISSN for a journal URL.
 * Client input wins, then the landing-page scraper, then cached facts, then the catalog.
 */
export function resolveJournalIssn(input: {
  requested?: string | null;
  /**
   * PR #3 landing-page scraper hook. Pass the ISSN printed on the page.
   * lookupClarivateFacts also reads issn/eIssn from extractFromPage when this is omitted.
   */
  pageIssn?: string | null;
  cached?: { issn?: string | null; eIssn?: string | null } | null;
  catalog?: { issn?: string | null; eIssn?: string | null } | null;
}): string {
  const candidates = [
    input.requested,
    input.pageIssn,
    input.cached?.issn,
    input.cached?.eIssn,
    input.catalog?.issn,
    input.catalog?.eIssn,
  ];
  for (const candidate of candidates) {
    const normalized = normalizeIssn(typeof candidate === 'string' ? candidate : '');
    if (normalized) return normalized;
  }
  return '';
}

const CLARIVATE_OVERLAY_SKIP = new Set(['journalName', 'publisher', 'jcrTitle', 'isoTitle', 'wosName', 'url', 'slugs']);

/**
 * Spread Clarivate fields over landing-page facts. Empty Clarivate values
 * and an all-caps name do not replace a better landing-page name or publisher.
 */
export function mergeClarivateOverLanding(landing: JCRJournalEntry, api: ClarivateJournalMetrics): JCRJournalEntry {
  const merged: JCRJournalEntry = { ...landing };
  for (const [key, value] of Object.entries(api)) {
    if (CLARIVATE_OVERLAY_SKIP.has(key) || !filled(value)) continue;
    (merged as unknown as Record<string, unknown>)[key] = value;
  }
  merged.journalName = displayJournalName(api, landing.journalName);
  merged.publisher = displayPublisher(api.publisher, landing.publisher);
  merged.jcrTitle = labelText(api.jcrTitle) || landing.jcrTitle;
  merged.isoTitle = labelText(api.isoTitle) || landing.isoTitle;
  merged.wosName = labelText(api.wosName) || landing.wosName;
  merged.url = landing.url;
  merged.slugs = landing.slugs || [];
  return merged;
}

export async function lookupClarivateFacts(
  url: string,
  forceRefresh = false,
  issn?: string,
  /**
   * PR #3 landing-page scraper hook. Pass the ISSN the scraper read on the page.
   * Until that scraper lands, extractFromPage returns null and this stays empty.
   */
  pageIssn?: string
): Promise<JCRJournalEntry> {
  const norm = normalizeJournalUrl(url);
  const journalId = norm.cacheKey;
  if (!norm.canonical) return missingJournalFacts(url || '');

  const cachedRecord = metricsCache.get(journalId);
  const catalog = CLARIVATE_JCR_CATALOG.find((entry) => journalUrlsMatch(norm, normalizeJournalUrl(entry.url)));

  if (!forceRefresh && cachedRecord) {
    const cached = cachedRecord;
    const status = cached.fullFacts?.verificationStatus;
    // Catalog snapshots are re-read from the in-repo list so a stale hardcoded
    // figure cannot linger in metrics-cache.json.
    const usable = !!status
      && status !== 'catalog_snapshot'
      && CURRENT_METRIC_STATUSES.has(status)
      && !isCachedJournalExpired(cached)
      && cached.fullFacts;
    if (usable && cached.fullFacts) {
      console.log(`[Cache HIT] Retrieved ${journalId} (${cached.journalName}) from metrics-cache.json`);
      return withAdIdentity({
        ...cached.fullFacts,
        url: normalizeJournalUrl(cached.fullFacts.url).canonical || norm.canonical,
        isFromCache: true,
        cachedAt: cached.lastAccess,
        cacheExpiresAt: cached.metrics['impactFactor']?.expireAt,
      });
    }
    console.log(status === 'catalog_snapshot'
      ? `[Cache SKIP] Catalog snapshot for ${journalId} is re-read from the in-repo catalog.`
      : status && !CURRENT_METRIC_STATUSES.has(status)
      ? `[Cache SKIP] Legacy entry for ${journalId} is not a current metric status.`
      : `[Cache EXPIRED] Cached data for ${journalId} is stale. Refreshing...`);
  }

  const fromPage = await pageFacts.extractFromPage(norm.canonical);
  const issnToUse = resolveJournalIssn({
    requested: issn,
    pageIssn: pageIssn || fromPage?.issn || fromPage?.eIssn,
    cached: cachedRecord?.fullFacts,
    catalog,
  });
  const landing: JCRJournalEntry = fromPage
    ? {
        ...missingJournalFacts(norm.canonical),
        ...fromPage,
        url: norm.canonical,
        slugs: [],
        verificationStatus: 'page_sourced',
        provenanceSource: 'page_sourced',
        isVerifiedClarivate: false,
        sourceAttribution: fromPage.sourceAttribution || 'Read from the journal page',
      }
    : catalog
      ? { ...catalog, url: normalizeJournalUrl(catalog.url).canonical }
      : missingJournalFacts(norm.canonical);

  if (issnToUse) {
    const fromApi = await loadJournalMetrics(issnToUse);
    if (fromApi) {
      const facts = mergeClarivateOverLanding(landing, fromApi);
      facts.url = norm.canonical;
      rememberJournal(journalId, facts);
      return facts;
    }
  }

  if (fromPage) {
    const facts: JCRJournalEntry = {
      ...missingJournalFacts(norm.canonical),
      ...fromPage,
      url: norm.canonical,
      slugs: [],
      verificationStatus: 'page_sourced',
      provenanceSource: 'page_sourced',
      isVerifiedClarivate: false,
      sourceAttribution: fromPage.sourceAttribution || 'Read from the journal page',
    };
    rememberJournal(journalId, facts);
    return facts;
  }

  const exact = CLARIVATE_JCR_CATALOG.find((entry) => journalUrlsMatch(norm, normalizeJournalUrl(entry.url)));
  if (exact) {
    console.log(`[Catalog MATCH] Found catalog snapshot for ${exact.journalName}`);
    const facts: JCRJournalEntry = { ...exact, url: normalizeJournalUrl(exact.url).canonical };
    const cachedEntry = rememberJournal(journalId, facts);
    return {
      ...facts,
      isFromCache: false,
      cachedAt: cachedEntry.lastAccess,
      cacheExpiresAt: cachedEntry.metrics['impactFactor']?.expireAt,
    };
  }

  console.log(`[Metrics Missing] No record for ${norm.canonical}.`);
  return missingJournalFacts(norm.canonical);
}

// --- REST API ENDPOINTS ---

// 1. Fetch Clarivate Facts (checks cache first)
app.post('/api/fetch-clarivate-facts', async (req, res) => {
  try {
    const { url, forceRefresh = false, issn, eIssn } = req.body;
    if (!url || !url.trim()) {
      return res.status(400).json({ error: 'URL is required' });
    }
    const requestedIssn = typeof issn === 'string' && issn.trim() ? issn : typeof eIssn === 'string' ? eIssn : undefined;
    const facts = await lookupClarivateFacts(url, forceRefresh, requestedIssn);
    res.json({ success: true, facts });
  } catch (err: any) {
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

app.post('/api/cache/refresh/:journalId', async (req, res) => {
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

/**
 * Admin-only Clarivate refresh. This bypasses the once-per-day JCR check.
 * Disabled unless CLARIVATE_ADMIN_REFRESH_ENABLED=true, so a merge of this
 * branch before or after PR #4 cannot burn the shared Journals API quota.
 * TODO: when PR #4 lands, also gate this route with requireAdmin from
 * src/server/auth/guard.ts, the same middleware used on /api/cache/refresh
 * and /api/cache/clear.
 */
export function clarivateAdminRefreshEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CLARIVATE_ADMIN_REFRESH_ENABLED === 'true';
}

app.post('/api/admin/clarivate-metrics/refresh', async (req, res) => {
  if (!clarivateAdminRefreshEnabled()) {
    return res.status(404).json({ error: 'Not found' });
  }
  try {
    const issn = typeof req.body?.issn === 'string' ? req.body.issn : '';
    if (!issn.trim()) {
      return res.status(400).json({ error: 'issn is required' });
    }
    const metrics = await loadJournalMetrics(issn, { force: true });
    if (!metrics) {
      return res.status(404).json({ error: 'No Clarivate metrics for that ISSN' });
    }
    res.json({ success: true, metrics });
  } catch (err: any) {
    console.error('Clarivate refresh failed:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Failed to refresh Clarivate metrics' });
  }
});

app.post('/api/cache/clear', (_req, res) => {
  metricsCache.clear();
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      fs.unlinkSync(CACHE_FILE_PATH);
    }
  } catch (err) {
    console.warn('Failed to delete cache file:', err);
  }
  console.log('[Metrics Cache] Cleared all cached journal metrics.');
  res.json({ success: true, message: 'All cached metrics cleared successfully.' });
});

// Update or store user-provided journal metrics into cache
app.post('/api/update-journal-metrics', (req, res) => {
  try {
    const { facts } = req.body;
    if (!facts || !facts.journalName) {
      return res.status(400).json({ error: 'Valid journal metrics object is required.' });
    }

    const norm = normalizeJournalUrl(facts.url || '');
    if (!norm.canonical) {
      return res.status(400).json({ error: 'A journal URL is required. Metrics are stored against that URL, not an invented path.' });
    }
    const journalId = norm.cacheKey;
    const nowStr = new Date().toISOString();

    const userProvidedFacts: JCRJournalEntry = {
      ...facts,
      url: norm.canonical,
      slugs: [],
      isVerifiedClarivate: false,
      verificationStatus: 'user_provided',
      provenanceSource: 'user_provided',
      sourceAttribution: facts.sourceAttribution || 'Manually supplied by user (User Verified)',
      missingFields: [],
      reportingYear: facts.reportingYear || 'User Provided (2025/2026)',
    };

    const cachedEntry: CachedJournal = {
      journalId,
      journalName: facts.journalName,
      publisher: facts.publisher || 'Springer Nature',
      lastAccess: nowStr,
      metrics: {
        impactFactor: {
          metric: 'impactFactor',
          value: facts.impactFactor,
          year: 2025,
          source: 'User Provided',
          cachedAt: nowStr,
          expireAt: calculateMetricExpiry('impactFactor'),
        },
        casZone: {
          metric: 'casZone',
          value: facts.casZone || null,
          year: 2025,
          source: 'User Provided',
          cachedAt: nowStr,
          expireAt: calculateMetricExpiry('casZone'),
        },
        firstDecisionDays: {
          metric: 'firstDecisionDays',
          value: facts.firstDecisionDays || null,
          year: 2025,
          source: 'User Provided',
          cachedAt: nowStr,
          expireAt: calculateMetricExpiry('firstDecisionDays'),
        },
        apcUsd: {
          metric: 'apcUsd',
          value: facts.apcUsd || null,
          year: 2025,
          source: 'User Provided',
          cachedAt: nowStr,
          expireAt: calculateMetricExpiry('apcUsd'),
        },
      },
      fullFacts: userProvidedFacts,
    };

    metricsCache.set(journalId, cachedEntry);
    saveCacheToDisk();

    console.log(`[Metrics Cache] Saved user-provided metrics for ${facts.journalName} (${journalId})`);
    res.json({
      success: true,
      message: `Saved verified metrics for ${facts.journalName}`,
      facts: userProvidedFacts,
    });
  } catch (err: any) {
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
  facts = withAdIdentity(factsForCopy(facts));
  const jifClaim = formatJifClaim(facts);
  const shortName = facts.journalName.length > 18 ? facts.journalName.slice(0, 18) : facts.journalName;
  const disciplineShort = (facts.primaryDiscipline || 'Scientific').split('(')[0].trim().slice(0, 14);
  const publishedBy = facts.publisher ? smartClamp(`Published by ${facts.publisher}`, 30) : '';

  // AWA (Awareness)
  if (stage === 'AWA') {
    const en: HeadlineSeed[] = [
      { text: smartClamp(`Discover ${shortName}`, 30), sourceFact: facts.journalName, language: 'EN', category: 'Journal Identity', positionRecommendation: 'Position 1' },
      { text: smartClamp(`Explore ${disciplineShort} Research`, 30), sourceFact: facts.primaryDiscipline, language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 1' },
      ...(publishedBy
        ? [{ text: publishedBy, sourceFact: facts.publisher, language: 'EN' as const, category: 'Journal Identity', positionRecommendation: 'Position 1' }]
        : []),
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
      ...(jifClaim ? [{ text: smartClamp(jifClaim, 30), sourceFact: jifClaim, language: 'EN' as const, category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' }] : []),
      ...(facts.indexing?.length ? [{ text: smartClamp(`Indexed in ${facts.indexing.slice(0, 2).join(' & ')}`, 30), sourceFact: 'Indexing', language: 'EN' as const, category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' }] : []),
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
  facts = withAdIdentity(factsForCopy(facts));
  const jifClaim = formatJifClaim(facts);
  if (stage === 'AWA') {
    const en = [
      { text: smartClamp(`Explore research published in ${facts.journalName}. Serving the global scientific community.`, 90), sourceFact: 'Journal Overview', language: 'EN' as const, theme: 'Scope & Relevance' },
      { text: smartClamp(`Discover multidisciplinary advances and innovative discoveries across ${facts.primaryDiscipline}.`, 90), sourceFact: facts.primaryDiscipline, language: 'EN' as const, theme: 'Scope & Relevance' },
      {
        text: smartClamp(
          facts.publisher
            ? `Published by ${facts.publisher}. Connect with global readership and open scholarship.`
            : 'Connect with global readership and open scholarship.',
          90
        ),
        sourceFact: facts.publisher || 'Readership',
        language: 'EN' as const,
        theme: 'Scope & Relevance',
      },
      { text: smartClamp(`Browse recent articles, view journal scope, and explore research topics today.`, 90), sourceFact: 'Discovery CTA', language: 'EN' as const, theme: 'Scope & Relevance' },
    ];
    const zh = [
      {
        text: smartClamp(
          facts.publisher
            ? `了解 ${facts.journalName} 的学术范畴与研究议题，探索 ${facts.publisher} 前沿学术成果。`
            : `了解 ${facts.journalName} 的学术范畴与研究议题，探索前沿学术成果。`,
          90
        ),
        sourceFact: 'Journal Scope',
        language: 'ZH' as const,
        theme: 'Scope & Relevance',
      },
      { text: smartClamp(`汇聚领域前沿论文，促进国际学者学术交流与知识共享，欢迎查阅最新研究成果。`, 90), sourceFact: 'Community Readership', language: 'ZH' as const, theme: 'Scope & Relevance' },
      { text: smartClamp(`查阅期刊学术定位、出版宗旨及最新录用论文成果，探索国际前沿科研动态。`, 90), sourceFact: 'Discovery', language: 'ZH' as const, theme: 'Scope & Relevance' },
      { text: smartClamp(`由知名出版机构提供高质量学术平台，赋能科研人员把握学科发展脉络。`, 90), sourceFact: facts.publisher, language: 'ZH' as const, theme: 'Scope & Relevance' },
    ];
    if (outputLanguage === 'EN') return en.map(d => ({ ...d, charCount: d.text.length }));
    if (outputLanguage === 'ZH') return zh.map(d => ({ ...d, charCount: d.text.length }));
    return [en[0], zh[0], en[1], zh[1]].map(d => ({ ...d, charCount: d.text.length }));
  }

  if (stage === 'CON') {
    const ifText = jifClaim ? `${jifClaim}, ` : '';
    const daysText = facts.firstDecisionDays ? `First decision in ${facts.firstDecisionDays} days.` : 'Editorial criteria are listed on the journal site.';
    const feeText = facts.apcUsd ? `APC ($${facts.apcUsd})` : 'publishing options';
    const casText = facts.casZone ? `（${facts.casZone.slice(0, 10)}）` : '';

    const en = [
      { text: smartClamp(`Evaluate ${facts.journalName} for your paper. ${ifText}${facts.indexing?.length ? `indexed in ${facts.indexing.slice(0, 2).join(' & ')}.` : 'Review the aims and scope.'}`, 90), sourceFact: 'Evaluation', language: 'EN' as const, theme: 'Evaluation & Peer Review' },
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
    return [en[0], zh[0], en[2], zh[1]].map(d => ({ ...d, charCount: d.text.length }));
  }

  // DEC
  const en = [
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
  return [en[0], zh[0], en[1], zh[1]].map(d => ({ ...d, charCount: d.text.length }));
}

export function generateStageKeywords(facts: any, stage: StageCode) {
  facts = withAdIdentity(factsForCopy(facts));
  const shortName = facts.journalName.toLowerCase();
  const disc = (facts.primaryDiscipline || 'science').toLowerCase().split('(')[0].trim();

  if (stage === 'AWA') {
    return {
      englishSearchKeywords: [
        { keyword: `${disc} research articles`, matchType: 'Broad' as const, intent: 'Research Discovery' },
        { keyword: `"${facts.journalName.toLowerCase()}" overview`, matchType: 'Phrase' as const, intent: 'Journal Discovery' },
        ...(facts.publisher
          ? [{ keyword: `explore ${facts.publisher.toLowerCase()} journals`, matchType: 'Phrase' as const, intent: 'Publisher Discovery' }]
          : []),
        { keyword: `[${facts.journalName.toLowerCase()} scope]`, matchType: 'Exact' as const, intent: 'Scope Discovery' },
      ],
      chineseAuthorKeywords: [
        { keywordZh: `${facts.journalName} 期刊介绍与研究方向`, matchType: '短语 (Phrase)' as const, intentZh: '了解学科范畴' },
        { keywordZh: `${disc} 学术前沿文献`, matchType: '短语 (Phrase)' as const, intentZh: '学术发现与阅读' },
        ...(facts.publisher
          ? [{ keywordZh: `${facts.publisher} 旗下学术期刊`, matchType: '短语 (Phrase)' as const, intentZh: '出版机构发现' }]
          : []),
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
  facts = withAdIdentity(factsForCopy(facts));
  const jifClaim = formatJifClaim(facts);
  const shortName = facts.journalName.length > 18 ? facts.journalName.slice(0, 18) : facts.journalName;

  if (stage === 'AWA') {
    return {
      shortHeadline: smartClamp(`Explore ${shortName}`, 30),
      shortHeadlineCharCount: 0,
      longHeadline: smartClamp(
        facts.publisher
          ? `Discover Pioneering Research in ${facts.journalName} · ${facts.publisher}`
          : `Discover Pioneering Research in ${facts.journalName}`,
        90
      ),
      longHeadlineCharCount: 0,
      description: smartClamp(`Browse latest scientific advances and breakthroughs across ${facts.primaryDiscipline}.`, 90),
      descriptionCharCount: 0,
      businessName: facts.publisher || facts.journalName,
      ctaText: 'Explore Journal',
      visualConceptPrompt: `An academic research banner focusing on scientific discovery, high-resolution microscopy or molecular lattice, subtle journal cover, and clean Springer Nature branding. Low text density.`,
      imageAccentColor: '#002d62',
      targetPlacements: ['researchgate.net', 'ncbi.nlm.nih.gov (PubMed)', 'sciencedirect.com', 'nature.com'],
      bannerHeadlineZh: `探索 ${facts.journalName} 学术成果`,
      bannerSubtextZh: facts.publisher
        ? `由 ${facts.publisher} 出版 · 汇聚全球前沿学术发现与学科突破`
        : `汇聚全球前沿学术发现与学科突破`,
    };
  }

  if (stage === 'CON') {
    const metricStr = jifClaim || 'Peer-Reviewed Research';
    return {
      shortHeadline: smartClamp(`Check ${shortName} Fit`, 30),
      shortHeadlineCharCount: 0,
      longHeadline: smartClamp(`Evaluate ${facts.journalName}: ${metricStr}, Peer-Reviewed Rigor`, 90),
      longHeadlineCharCount: 0,
      description: smartClamp(`Transparent editorial standards, accepted formats, and objective journal metrics comparison.`, 90),
      descriptionCharCount: 0,
      businessName: facts.publisher || facts.journalName,
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
    businessName: facts.publisher || facts.journalName,
    ctaText: 'View Checklist',
    visualConceptPrompt: `A streamlined author guidance banner showcasing a manuscript submission checklist icon, clear typography, verified portal badge, and Springer Nature integrity crest.`,
    imageAccentColor: '#064e3b',
    targetPlacements: ['researchgate.net', 'ncbi.nlm.nih.gov (PubMed)', 'nature.com', 'springerlink.com'],
    bannerHeadlineZh: `${facts.journalName} 作者投稿须知`,
    bannerSubtextZh: `获取官方投稿清单与格式指南 · 在线投递学术稿件`,
  };
}

export function generateDeterministicCampaign(
  facts: any,
  stage: StageCode,
  outputLanguage: 'all' | 'EN' | 'ZH' = 'all'
) {
  facts = withAdIdentity(facts);
  const stageConfig = STAGE_CONFIGS[stage];
  const headlines = generateStageHeadlines(facts, stage, outputLanguage);
  const descriptions = generateStageDescriptions(facts, stage, outputLanguage);
  const keywords = generateStageKeywords(facts, stage);
  const displayAd = generateStageDisplayAd(facts, stage);

  displayAd.shortHeadlineCharCount = displayAd.shortHeadline.length;
  displayAd.longHeadlineCharCount = displayAd.longHeadline.length;
  displayAd.descriptionCharCount = displayAd.description.length;

  const copyFacts = factsForCopy(facts);
  const baseUrl = normalizeJournalUrl(facts.url || '').canonical;
  const destinationUrl = joinJournalUrl(baseUrl, stageConfig.recommendedDestination.urlPath);

  const sitelinks =
    stage === 'AWA'
      ? [
          { title: 'Journal Overview & Scope', desc: 'Explore research fields and mission', urlPath: `${baseUrl}/about` },
          { title: 'Browse Latest Articles', desc: 'Read recent peer-reviewed discoveries', urlPath: `${baseUrl}/articles` },
          { title: 'Editorial Leadership', desc: 'Meet the international editorial board', urlPath: `${baseUrl}/editors` },
          { title: 'Research Collections', desc: 'Curated thematic paper collections', urlPath: `${baseUrl}/collections` },
        ]
      : stage === 'CON'
      ? [
          { title: 'Aims & Scope Evaluation', desc: 'Check topical alignment and criteria', urlPath: `${baseUrl}/aims-and-scope` },
          { title: 'Article Types & Formats', desc: 'Accepted original research & reviews', urlPath: `${baseUrl}/article-types` },
          { title: 'Journal Metrics & Indexing', desc: 'Indexing and journal metrics', urlPath: `${baseUrl}/metrics` },
          { title: 'Publishing Options & Fees', desc: `Transparent APC & OA publishing`, urlPath: `${baseUrl}/open-access` },
        ]
      : [
          { title: 'Author Guidelines', desc: 'Manuscript preparation and style guide', urlPath: `${baseUrl}/for-authors` },
          { title: 'Submission Checklist', desc: 'Required documentation before submitting', urlPath: `${baseUrl}/checklist` },
          { title: 'APC & Waiver Criteria', desc: 'Fee policy and funding guidelines', urlPath: `${baseUrl}/apc-waivers` },
          { title: 'Online Submission Portal', desc: 'Submit paper for peer review', urlPath: `${baseUrl}/submit` },
        ];

  const callouts =
    stage === 'AWA'
      ? [
          ...(facts.publisher ? [`Published by ${facts.publisher}`] : []),
          (facts.primaryDiscipline || 'Scientific Research').split('(')[0].trim(),
          'Global Readership',
          'Peer-Reviewed Science',
        ]
      : stage === 'CON'
      ? [formatJifClaim(copyFacts) || 'Peer-reviewed journal', copyFacts.casZone ? copyFacts.casZone.slice(0, 14) : 'Peer-Reviewed Quality', copyFacts.firstDecisionDays ? `1st Decision: ${copyFacts.firstDecisionDays} Days` : 'Editorial Standards', 'Transparent Policies']
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
        values: [(facts.primaryDiscipline || 'Scientific Research').split('(')[0].trim(), facts.publisher, 'Peer-Reviewed Research'].filter(Boolean),
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
      issn,
      eIssn,
    } = req.body;

    const normalizedStage = normalizeStage(funnelStage);
    const stageConfig = STAGE_CONFIGS[normalizedStage];

    // Priority 1: Check facts. If userProvidedFacts is sent, use them directly!
    let facts: JCRJournalEntry;
    if (userProvidedFacts && userProvidedFacts.verificationStatus === 'user_provided') {
      facts = sanitizeUserProvidedFacts(userProvidedFacts);
    } else {
      const requestedIssn = typeof issn === 'string' && issn.trim() ? issn : typeof eIssn === 'string' ? eIssn : undefined;
      // Catalog issn/eIssn, cached facts, and the PR #3 pageIssn hook are resolved inside lookupClarivateFacts.
      facts = await lookupClarivateFacts(landingPageUrl, false, requestedIssn);
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
    facts = withAdIdentity(facts);

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
- Name: ${facts.journalName}${facts.publisher ? ` (${facts.publisher})` : ''}
- Discipline: ${facts.primaryDiscipline || 'Not stated'}
- Open access model: ${facts.openAccessType || 'Not stated'}
- Indexing: ${facts.indexing?.length ? facts.indexing.join(', ') : 'Not stated'}
- Output Language: ${outputLanguage}

${metricPromptSection(facts)}

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
      campaignOutput.searchAds.sitelinks = campaignOutput.searchAds.sitelinks || fallback.searchAds.sitelinks;
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

    const destinationUrl = joinJournalUrl(facts.url, stageConfig.recommendedDestination.urlPath);

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
    console.error('Campaign generation failed:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
});

// 4. API: Compare All 3 Stages (AWA, CON, DEC) Side-by-Side
app.post('/api/compare-stages', async (req, res) => {
  try {
    const { landingPageUrl, outputLanguage = 'all', issn, eIssn } = req.body;
    const requestedIssn = typeof issn === 'string' && issn.trim() ? issn : typeof eIssn === 'string' ? eIssn : undefined;
    const facts = withAdIdentity(await lookupClarivateFacts(landingPageUrl, false, requestedIssn));

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
    console.error('Compare stages failed:', err);
    res.status(500).json({ error: err.message || 'Failed to compare stages' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Springer Nature Ad Engine running on http://0.0.0.0:${PORT}`);
  });
}

const entryPoint = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entryPoint === fileURLToPath(import.meta.url)) {
  startServer().catch((err) => {
    console.error('Server failed to start:', err);
    process.exit(1);
  });
}
