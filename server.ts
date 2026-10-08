import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import { loadMetricsCacheFromDisk } from './src/utils/metricsCache';
import { diffTrackedFields, recordMetricsAudit, type FieldChange, type MetricsAuditEvent } from './src/server/auditLog';
import { assertProductionAuthConfig } from './src/server/auth/config';
import { apiGuard, getRequestSession, requireAdmin } from './src/server/auth/guard';
import { registerAuthRoutes } from './src/server/auth/routes';
import { MetricsValidationError, validateJournalMetricsUpdate } from './src/server/metricsValidation';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();
const PORT = 3000;

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
  chinaWaiverAvailable?: boolean;
  aimsAndScopeSummary?: string;
  primaryDiscipline?: string;
  verificationStatus: 'source_verified' | 'user_provided' | 'unverified' | 'missing';
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

// Verified Clarivate JCR & Web of Science Index Catalog
export const CLARIVATE_JCR_CATALOG: JCRJournalEntry[] = [
  {
    url: 'https://www.nature.com/nature',
    slugs: ['nature', 'flagship', 'default'],
    journalName: 'Nature',
    publisher: 'Nature Portfolio',
    impactFactor: 50.5,
    fiveYearImpactFactor: 54.3,
    jcrQuartile: 'Q1',
    casZone: '中科院综合性期刊1区 Top',
    firstDecisionDays: 32,
    indexing: ['SCIE', 'PubMed Central', 'MEDLINE', 'Scopus'],
    openAccessType: 'Hybrid Open Access',
    apcUsd: 11690,
    chinaWaiverAvailable: false,
    aimsAndScopeSummary: 'The world’s premier multidisciplinary science journal publishing the finest peer-reviewed research across all areas of science and technology.',
    primaryDiscipline: 'Multidisciplinary Sciences (综合性科学)',
    verificationStatus: 'source_verified',
    reportingYear: 'JCR 2024 (Clarivate Journal Citation Reports)',
    isVerifiedClarivate: true,
    sourceAttribution: 'Verified via Clarivate Journal Citation Reports (JCR 2024/2025) & Web of Science Index',
  },
  {
    url: 'https://www.nature.com/ncomms',
    slugs: ['ncomms', 'nature-communications'],
    journalName: 'Nature Communications',
    publisher: 'Nature Portfolio',
    impactFactor: 14.7,
    fiveYearImpactFactor: 16.2,
    jcrQuartile: 'Q1',
    casZone: '中科院综合性期刊1区 Top',
    firstDecisionDays: 28,
    indexing: ['SCIE', 'PubMed Central', 'Scopus', 'DOAJ'],
    openAccessType: 'Gold Open Access',
    apcUsd: 6790,
    chinaWaiverAvailable: false,
    aimsAndScopeSummary: 'Multidisciplinary open access journal dedicated to publishing high-quality research in natural sciences, biology, physics, and chemistry.',
    primaryDiscipline: 'Multidisciplinary Sciences (综合性科学)',
    verificationStatus: 'source_verified',
    reportingYear: 'JCR 2024 (Clarivate Journal Citation Reports)',
    isVerifiedClarivate: true,
    sourceAttribution: 'Verified via Clarivate Journal Citation Reports (JCR 2024/2025) & Web of Science Index',
  },
  {
    url: 'https://www.nature.com/aps',
    slugs: ['aps', 'acta-pharmacologica-sinica'],
    journalName: 'Acta Pharmacologica Sinica',
    publisher: 'Nature Portfolio',
    impactFactor: 6.9,
    fiveYearImpactFactor: 7.4,
    jcrQuartile: 'Q1',
    casZone: '中科院医学1区 Top / 药学1区',
    firstDecisionDays: 23,
    indexing: ['SCIE', 'PubMed Central', 'MEDLINE', 'Scopus'],
    openAccessType: 'Hybrid Open Access',
    apcUsd: 4190,
    chinaWaiverAvailable: true,
    aimsAndScopeSummary: 'Official journal of the Chinese Pharmacological Society and Shanghai Institute of Materia Medica, CAS, published with Nature Portfolio, covering all aspects of pharmacology and pharmaceutical sciences.',
    primaryDiscipline: 'Pharmacology & Pharmacy (药理学与药物科学)',
    verificationStatus: 'source_verified',
    reportingYear: 'JCR 2024 (Clarivate Journal Citation Reports)',
    isVerifiedClarivate: true,
    sourceAttribution: 'Verified via Clarivate Journal Citation Reports (JCR 2024/2025) & Web of Science Index',
  },
  {
    url: 'https://www.nature.com/cr',
    slugs: ['cr', 'cell-research'],
    journalName: 'Cell Research',
    publisher: 'Nature Portfolio',
    impactFactor: 28.1,
    fiveYearImpactFactor: 30.2,
    jcrQuartile: 'Q1',
    casZone: '中科院生物学1区 Top',
    firstDecisionDays: 19,
    indexing: ['SCIE', 'PubMed Central', 'MEDLINE', 'Scopus'],
    openAccessType: 'Hybrid Open Access',
    apcUsd: 4690,
    chinaWaiverAvailable: true,
    aimsAndScopeSummary: 'Co-published by CAS and Nature Portfolio, focusing on molecular and cell biology, cancer, and immunology.',
    primaryDiscipline: 'Cell Biology (细胞生物学)',
    verificationStatus: 'source_verified',
    reportingYear: 'JCR 2024 (Clarivate Journal Citation Reports)',
    isVerifiedClarivate: true,
    sourceAttribution: 'Verified via Clarivate Journal Citation Reports (JCR 2024/2025) & Web of Science Index',
  },
  {
    url: 'https://www.nature.com/srep',
    slugs: ['srep', 'scientific-reports'],
    journalName: 'Scientific Reports',
    publisher: 'Nature Portfolio',
    impactFactor: 3.8,
    fiveYearImpactFactor: 4.3,
    jcrQuartile: 'Q1',
    casZone: '中科院综合性期刊3区',
    firstDecisionDays: 38,
    indexing: ['SCIE', 'PubMed Central', 'Scopus', 'DOAJ'],
    openAccessType: 'Gold Open Access',
    apcUsd: 2690,
    chinaWaiverAvailable: true,
    aimsAndScopeSummary: 'An open access journal publishing scientifically valid, primary research from across all disciplines of natural and clinical sciences.',
    primaryDiscipline: 'Multidisciplinary Sciences (综合性科学)',
    verificationStatus: 'source_verified',
    reportingYear: 'JCR 2024 (Clarivate Journal Citation Reports)',
    isVerifiedClarivate: true,
    sourceAttribution: 'Verified via Clarivate Journal Citation Reports (JCR 2024/2025) & Web of Science Index',
  },
  {
    url: 'https://www.nature.com/onc',
    slugs: ['onc', 'oncogene'],
    journalName: 'Oncogene',
    publisher: 'Nature Portfolio',
    impactFactor: 6.9,
    fiveYearImpactFactor: 7.7,
    jcrQuartile: 'Q1',
    casZone: '中科院医学1区 Top / 肿瘤学1区',
    firstDecisionDays: 24,
    indexing: ['SCIE', 'PubMed Central', 'MEDLINE', 'Scopus'],
    openAccessType: 'Hybrid Open Access',
    apcUsd: 4990,
    chinaWaiverAvailable: false,
    aimsAndScopeSummary: 'Leading international cancer research journal publishing molecular pathways of disease, metastasis, and targeted therapies.',
    primaryDiscipline: 'Oncology (肿瘤学)',
    verificationStatus: 'source_verified',
    reportingYear: 'JCR 2024 (Clarivate Journal Citation Reports)',
    isVerifiedClarivate: true,
    sourceAttribution: 'Verified via Clarivate Journal Citation Reports (JCR 2024/2025) & Web of Science Index',
  },
  {
    url: 'https://bmcbiol.biomedcentral.com',
    slugs: ['bmc-biology', 'bmcbiol'],
    journalName: 'BMC Biology',
    publisher: 'BMC (Part of Springer Nature)',
    impactFactor: 5.4,
    fiveYearImpactFactor: 6.2,
    jcrQuartile: 'Q1',
    casZone: '中科院生物学1区 Top',
    firstDecisionDays: 29,
    indexing: ['SCIE', 'PubMed Central', 'Scopus', 'DOAJ'],
    openAccessType: 'Gold Open Access',
    apcUsd: 3690,
    chinaWaiverAvailable: true,
    aimsAndScopeSummary: 'Flagship biology journal of BMC, publishing research of broad interest across all areas of biological science.',
    primaryDiscipline: 'Biological Sciences (生物科学)',
    verificationStatus: 'source_verified',
    reportingYear: 'JCR 2024 (Clarivate Journal Citation Reports)',
    isVerifiedClarivate: true,
    sourceAttribution: 'Verified via Clarivate Journal Citation Reports (JCR 2024/2025) & Web of Science Index',
  },
];

export function normalizeUrlComponents(rawUrl: string): { host: string; slug: string; full: string; journalId: string } {
  let cleaned = (rawUrl || '').trim();
  if (!cleaned.startsWith('http://') && !cleaned.startsWith('https://')) {
    cleaned = 'https://' + cleaned;
  }
  try {
    const parsed = new URL(cleaned);
    const host = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase().replace(/\/+$/, '');
    const parts = pathname.split('/').filter(Boolean);
    const slug = parts.length > 0 ? parts[parts.length - 1] : '';
    const journalId = slug || (host.includes('nature.com') ? 'nature' : host.replace(/[^a-z0-9]/g, '-'));
    return { host, slug, full: `${parsed.protocol}//${parsed.host}${parsed.pathname}`, journalId };
  } catch {
    return { host: '', slug: '', full: rawUrl, journalId: 'unknown' };
  }
}

// Lookup Clarivate facts with Persistent Cache + Fallback Safeguards
export async function lookupClarivateFacts(url: string, forceRefresh = false): Promise<JCRJournalEntry> {
  const norm = normalizeUrlComponents(url);
  const journalId = norm.journalId;

  // 1. Check persistent in-memory cache first (unless forceRefresh)
  if (!forceRefresh && metricsCache.has(journalId)) {
    const cached = metricsCache.get(journalId)!;
    if (!isCachedJournalExpired(cached) && cached.fullFacts) {
      console.log(`[Cache HIT] Retrieved ${journalId} (${cached.journalName}) from metrics-cache.json`);
      return {
        ...cached.fullFacts,
        isFromCache: true,
        cachedAt: cached.lastAccess,
        cacheExpiresAt: cached.metrics['impactFactor']?.expireAt,
      };
    }
    console.log(`[Cache EXPIRED] Cached data for ${journalId} is stale. Refreshing...`);
  }

  // 2. Direct exact catalog match
  const exact = CLARIVATE_JCR_CATALOG.find((entry) => {
    const entryNorm = normalizeUrlComponents(entry.url);
    if (norm.slug && entry.slugs.includes(norm.slug)) return true;
    if (!norm.slug && (norm.host.includes('nature.com') || norm.full === 'https://www.nature.com') && entry.slugs.includes('nature')) {
      return true;
    }
    return entryNorm.full === norm.full || entryNorm.host === norm.host && entryNorm.slug === norm.slug;
  });

  if (exact) {
    console.log(`[Catalog MATCH] Found verified record for ${exact.journalName}`);
    // Save into cache
    const nowStr = new Date().toISOString();
    const cachedEntry: CachedJournal = {
      journalId,
      journalName: exact.journalName,
      publisher: exact.publisher,
      lastAccess: nowStr,
      metrics: {
        impactFactor: {
          metric: 'impactFactor',
          value: exact.impactFactor,
          year: 2024,
          source: 'Clarivate JCR',
          cachedAt: nowStr,
          expireAt: calculateMetricExpiry('impactFactor'),
        },
        casZone: {
          metric: 'casZone',
          value: exact.casZone || null,
          year: 2024,
          source: 'CAS Ranking',
          cachedAt: nowStr,
          expireAt: calculateMetricExpiry('casZone'),
        },
        firstDecisionDays: {
          metric: 'firstDecisionDays',
          value: exact.firstDecisionDays || null,
          year: 2024,
          source: 'Publisher Average',
          cachedAt: nowStr,
          expireAt: calculateMetricExpiry('firstDecisionDays'),
        },
        apcUsd: {
          metric: 'apcUsd',
          value: exact.apcUsd || null,
          year: 2024,
          source: 'Publisher Price List',
          cachedAt: nowStr,
          expireAt: calculateMetricExpiry('apcUsd'),
        },
      },
      fullFacts: exact,
    };
    metricsCache.set(journalId, cachedEntry);
    saveCacheToDisk();

    return {
      ...exact,
      isFromCache: false,
      cachedAt: nowStr,
      cacheExpiresAt: cachedEntry.metrics['impactFactor']?.expireAt,
    };
  }

  // 3. AI Lookup via Gemini if available
  if (ai) {
    try {
      console.log(`[AI Lookup] Querying Gemini for journal metrics: ${norm.full}`);
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('AI lookup timed out')), 5000)
      );

      const aiQuery = ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: `You are an academic publishing metrics database. Find the verified Clarivate JCR metrics for this journal URL: "${norm.full}".
Return strictly a JSON object with:
{
  "journalName": string,
  "publisher": string,
  "impactFactor": number,
  "fiveYearImpactFactor": number,
  "jcrQuartile": "Q1" | "Q2" | "Q3" | "Q4",
  "casZone": string,
  "firstDecisionDays": number,
  "indexing": string[],
  "openAccessType": string,
  "apcUsd": number,
  "chinaWaiverAvailable": boolean,
  "aimsAndScopeSummary": string,
  "primaryDiscipline": string
}
If this is not a known scholarly journal or impact factor cannot be verified, return null for impactFactor.`,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const res: any = await Promise.race([aiQuery, timeoutPromise]);
      if (res && res.text) {
        const parsed = JSON.parse(res.text);
        if (parsed.journalName && parsed.impactFactor !== null && parsed.impactFactor !== undefined) {
          const aiFacts: JCRJournalEntry = {
            url: norm.full,
            slugs: [norm.slug],
            ...parsed,
            isVerifiedClarivate: false,
            verificationStatus: 'unverified',
            reportingYear: 'Estimated Web Knowledge (Review in Step 1)',
            sourceAttribution: 'Retrieved via Web Knowledge Engine — Please verify against official Clarivate JCR',
          };

          // Cache AI result
          const nowStr = new Date().toISOString();
          metricsCache.set(journalId, {
            journalId,
            journalName: parsed.journalName,
            publisher: parsed.publisher || 'Springer Nature',
            lastAccess: nowStr,
            metrics: {
              impactFactor: {
                metric: 'impactFactor',
                value: parsed.impactFactor,
                year: 2024,
                source: 'Web Lookup',
                cachedAt: nowStr,
                expireAt: calculateMetricExpiry('impactFactor'),
              },
            },
            fullFacts: aiFacts,
          });
          saveCacheToDisk();

          return aiFacts;
        }
      }
    } catch (e: any) {
      console.warn('[AI Lookup Failed]:', e.message);
    }
  }

  // 4. UNKNOWN JOURNAL / LOOKUP FAILED:
  // Return missing verificationStatus with null metrics and missingFields list.
  // NO INVENTED NUMBERS!
  let guessedName = 'Unknown Journal';
  let guessedPublisher = 'Springer Nature';

  if (norm.host.includes('nature.com')) {
    guessedPublisher = 'Nature Portfolio';
    guessedName = norm.slug ? `Nature ${norm.slug.charAt(0).toUpperCase() + norm.slug.slice(1)}` : 'Nature Portfolio Journal';
  } else if (norm.host.includes('biomedcentral.com')) {
    guessedPublisher = 'BMC (Part of Springer Nature)';
    guessedName = norm.slug ? `BMC ${norm.slug.charAt(0).toUpperCase() + norm.slug.slice(1)}` : 'BMC Journal';
  } else if (norm.host.includes('springer.com')) {
    guessedPublisher = 'SpringerLink';
    guessedName = norm.slug ? `Springer ${norm.slug.charAt(0).toUpperCase() + norm.slug.slice(1)}` : 'Springer Journal';
  }

  console.log(`[Metrics Missing] Journal ${norm.full} is unknown. Returning null fields and prompting user verification.`);

  return {
    url: norm.full,
    slugs: norm.slug ? [norm.slug] : [],
    journalName: guessedName,
    publisher: guessedPublisher,
    impactFactor: null,
    fiveYearImpactFactor: null,
    jcrQuartile: null,
    casZone: null,
    firstDecisionDays: null,
    indexing: [],
    openAccessType: null,
    apcUsd: null,
    chinaWaiverAvailable: false,
    aimsAndScopeSummary: 'Aims and scope not verified.',
    primaryDiscipline: 'Research Fields Unverified',
    isVerifiedClarivate: false,
    verificationStatus: 'missing',
    missingFields: ['impactFactor', 'casZone', 'jcrQuartile', 'firstDecisionDays', 'apcUsd', 'indexing'],
    reportingYear: 'Missing Data',
    sourceAttribution: 'Please manually verify and add journal metrics before generating campaigns.',
  };
}

// --- REST API ENDPOINTS ---

// 1. Fetch Clarivate Facts (checks cache first)
app.post('/api/fetch-clarivate-facts', async (req, res) => {
  try {
    const { url, forceRefresh = false } = req.body;
    if (!url || !url.trim()) {
      return res.status(400).json({ error: 'URL is required' });
    }
    const facts = await lookupClarivateFacts(url, forceRefresh);
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

app.post('/api/cache/refresh/:journalId', requireAdmin, async (req, res) => {
  try {
    const { journalId } = req.params;
    const { url } = req.body;
    const targetUrl = url || `https://www.nature.com/${journalId}`;
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

// Update or store user-provided journal metrics into cache.
// Only known fields are accepted. The signed-in user is recorded on the entry and in the audit log.
app.post('/api/update-journal-metrics', (req, res) => {
  try {
    const actor = getRequestSession(res)?.user;
    if (!actor) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const facts = validateJournalMetricsUpdate(req.body);
    const norm = normalizeUrlComponents(facts.url);
    const journalId = norm.slug || facts.journalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'journal';
    const nowStr = new Date().toISOString();
    const previous = metricsCache.get(journalId);

    const userProvidedFacts: JCRJournalEntry = {
      url: facts.url,
      slugs: norm.slug ? [norm.slug] : [],
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
      isVerifiedClarivate: false,
      verificationStatus: 'user_provided',
      sourceAttribution: `Manually supplied by ${actor.email}`,
      missingFields: [],
      reportingYear: facts.reportingYear,
    };

    const changedFields: FieldChange[] = diffTrackedFields(
      previous?.fullFacts as unknown as Record<string, unknown> | undefined,
      userProvidedFacts as unknown as Record<string, unknown>
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
      year: new Date().getFullYear(),
      source: `User provided by ${actor.email}`,
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
      fullFacts: userProvidedFacts,
      lastModifiedBy: {
        email: actor.email,
        sub: actor.sub,
        provider: actor.provider,
        at: nowStr,
      },
      audit: [...(previous?.audit || []), auditEvent].slice(-20),
    };

    metricsCache.set(journalId, cachedEntry);
    saveCacheToDisk();

    console.log(`[Metrics Cache] ${actor.email} saved user-provided metrics for ${facts.journalName} (${journalId})`);
    res.json({
      success: true,
      message: `Saved verified metrics for ${facts.journalName}`,
      facts: userProvidedFacts,
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
  const shortName = facts.journalName.length > 18 ? facts.journalName.slice(0, 18) : facts.journalName;
  const disciplineShort = (facts.primaryDiscipline || 'Scientific').split('(')[0].trim().slice(0, 14);

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
      ...(facts.impactFactor ? [{ text: smartClamp(`Clarivate IF ${facts.impactFactor} ${facts.jcrQuartile || ''}`.trim(), 30), sourceFact: `IF ${facts.impactFactor}`, language: 'EN' as const, category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' }] : []),
      { text: smartClamp(`Indexed in ${facts.indexing?.slice(0, 2).join(' & ') || 'SCIE & Scopus'}`, 30), sourceFact: 'Indexing', language: 'EN', category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' },
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
  if (stage === 'AWA') {
    const en = [
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
    return [en[0], zh[0], en[1], zh[1]].map(d => ({ ...d, charCount: d.text.length }));
  }

  if (stage === 'CON') {
    const ifText = facts.impactFactor ? `Clarivate IF ${facts.impactFactor}, ` : '';
    const daysText = facts.firstDecisionDays ? `First decision in ${facts.firstDecisionDays} days.` : 'Prompt editorial turnaround.';
    const feeText = facts.apcUsd ? `APC ($${facts.apcUsd})` : 'publishing options';
    const casText = facts.casZone ? `（${facts.casZone.slice(0, 10)}）` : '';

    const en = [
      { text: smartClamp(`Evaluate ${facts.journalName} for your paper. ${ifText}indexed in SCIE & Scopus.`, 90), sourceFact: 'Evaluation', language: 'EN' as const, theme: 'Evaluation & Peer Review' },
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
        { keyword: `[${shortName} impact factor 2024]`, matchType: 'Exact' as const, intent: 'Metric Evaluation' },
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
    const metricStr = facts.impactFactor ? `Clarivate IF ${facts.impactFactor}` : 'Indexed Research';
    return {
      shortHeadline: smartClamp(`Check ${shortName} Fit`, 30),
      shortHeadlineCharCount: 0,
      longHeadline: smartClamp(`Evaluate ${facts.journalName}: ${metricStr}, Peer-Reviewed Rigor`, 90),
      longHeadlineCharCount: 0,
      description: smartClamp(`Transparent editorial standards, accepted formats, and objective journal metrics comparison.`, 90),
      descriptionCharCount: 0,
      businessName: facts.publisher,
      ctaText: 'Check Journal Fit',
      visualConceptPrompt: `An objective academic evaluation ad featuring the official journal cover, Clarivate indexing badges (SCIE), and professional scholarly palette.`,
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

  const norm = normalizeUrlComponents(facts.url || '');
  const baseUrl = norm.full || 'https://www.nature.com';

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
          { title: 'Journal Metrics & Indexing', desc: `Indexing & Clarivate status`, urlPath: `${baseUrl}/metrics` },
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
      ? [`Published by ${facts.publisher}`, (facts.primaryDiscipline || 'Scientific Research').split('(')[0].trim(), 'Global Readership', 'Peer-Reviewed Science']
      : stage === 'CON'
      ? [facts.impactFactor ? `Clarivate IF ${facts.impactFactor}` : 'Indexed in SCIE', facts.casZone ? facts.casZone.slice(0, 14) : 'Peer-Reviewed Quality', facts.firstDecisionDays ? `1st Decision: ${facts.firstDecisionDays} Days` : 'Editorial Standards', 'Transparent Policies']
      : ['Author Guidelines Ready', 'Standard Preparation Checklist', facts.firstDecisionDays ? `First Decision: ${facts.firstDecisionDays} Days` : 'Prompt Review', 'Official Submission Portal'];

  return {
    funnelStage: stage,
    legacyStage: stage === 'AWA' ? 'TOFU' : stage === 'CON' ? 'MOFU' : 'BOFU',
    clarivateFacts: facts,
    funnelStrategyNote: `${stageConfig.name}: ${stageConfig.campaignObjective}`,
    primaryCta: stageConfig.primaryCta,
    recommendedDestination: {
      label: stageConfig.recommendedDestination.label,
      url: `${baseUrl}${stageConfig.recommendedDestination.urlPath}`,
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
      recommendedFinalUrl: `${baseUrl}${stageConfig.recommendedDestination.urlPath}`,
    },
    displayAds: {
      ...displayAd,
      recommendedFinalUrl: `${baseUrl}${stageConfig.recommendedDestination.urlPath}`,
    },
    keywords,
  };
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

    // Priority 1: Check facts. If userProvidedFacts is sent, use them directly!
    let facts: JCRJournalEntry;
    if (userProvidedFacts && userProvidedFacts.verificationStatus === 'user_provided') {
      facts = userProvidedFacts;
    } else {
      facts = await lookupClarivateFacts(landingPageUrl);
    }

    // BLOCK GENERATION IF REQUIRED METRICS ARE MISSING
    if (facts.verificationStatus === 'missing' || (facts.missingFields && facts.missingFields.length > 0)) {
      return res.status(400).json({
        error: 'Please complete journal metrics to continue. Key Clarivate metrics are unverified.',
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

FACTUAL METRICS (Strict source attribution, NO invented numbers):
- Journal: ${facts.journalName} (${facts.publisher})
- Clarivate Impact Factor: ${facts.impactFactor || 'Not reported'}
- CAS Zone: ${facts.casZone || 'Not reported'}
- Turnaround: ${facts.firstDecisionDays ? `${facts.firstDecisionDays} days` : 'Not reported'}
- Indexing: ${facts.indexing?.join(', ') || 'SCIE, Scopus'}
- Open Access: ${facts.openAccessType || 'Hybrid Open Access'} (APC: $${facts.apcUsd || 'Transparent'})
- Output Language: ${outputLanguage}

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

    const norm = normalizeUrlComponents(facts.url || '');
    const baseUrl = norm.full || 'https://www.nature.com';

    res.json({
      success: true,
      campaign: {
        funnelStage: normalizedStage,
        legacyStage: normalizedStage === 'AWA' ? 'TOFU' : normalizedStage === 'CON' ? 'MOFU' : 'BOFU',
        clarivateFacts: facts,
        funnelStrategyNote: `${stageConfig.name}: ${stageConfig.campaignObjective}`,
        primaryCta: campaignOutput.primaryCta || stageConfig.primaryCta,
        recommendedDestination: {
          label: stageConfig.recommendedDestination.label,
          url: `${baseUrl}${stageConfig.recommendedDestination.urlPath}`,
          description: stageConfig.recommendedDestination.description,
        },
        generationSource,
        outputLanguage,
        generatedAt: new Date().toISOString(),
        ...campaignOutput,
      },
    });
  } catch (error: any) {
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
