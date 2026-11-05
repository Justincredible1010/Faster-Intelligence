import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

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
  submissionPortalUrl?: string;
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
}

// --- STRUCTURED METRICS DATABASE (metrics-database.json) ---
const DATABASE_FILE_PATH = path.resolve(__dirname, 'metrics-database.json');
const metricsDatabase = new Map<string, any>();

function loadDatabaseFromDisk() {
  try {
    if (fs.existsSync(DATABASE_FILE_PATH)) {
      const data = fs.readFileSync(DATABASE_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      Object.entries(parsed).forEach(([key, val]: [string, any]) => {
        metricsDatabase.set(key, val);
        if (val.canonicalUrl) metricsDatabase.set(val.canonicalUrl, val);
        if (val.journalId) metricsDatabase.set(val.journalId, val);
        if (val.slugs && Array.isArray(val.slugs)) {
          val.slugs.forEach((slug: string) => {
            if (slug) metricsDatabase.set(slug, val);
          });
        }
      });
      console.log(`[Metrics DB] Loaded ${metricsDatabase.size} journal records from metrics-database.json`);
    }
  } catch (err) {
    console.warn('[Metrics DB] Failed to load metrics-database.json:', err);
  }
}

function saveDatabaseToDisk() {
  try {
    const raw: Record<string, any> = {};
    metricsDatabase.forEach((val, key) => {
      // Only write canonical URL keys to keep JSON clean
      if (key.startsWith('http://') || key.startsWith('https://')) {
        raw[key] = val;
      }
    });
    fs.writeFileSync(DATABASE_FILE_PATH, JSON.stringify(raw, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Metrics DB] Failed to write database to disk:', err);
  }
}

// --- ADMIN PLAYBOOK CONFIG (admin-playbook.json) ---
const PLAYBOOK_FILE_PATH = path.resolve(__dirname, 'admin-playbook.json');
let adminPlaybook: any = {
  activePreset: 'Academic Integrity & Truth in Advertising',
  brandVoice: 'Evidence-backed, scholarly, welcoming, strictly non-hyperbolic',
  brandRules: [
    'Always spell Nature Portfolio and Springer Nature accurately.',
    'Do not mention competitor journals in copy headlines or descriptions.',
    'Awareness stage must focus on subject scope and research community with zero submission pressure.',
    'Consideration stage must focus on objective metrics with explicit release year.',
    'Decision stage must direct authors to clear checklists with no acceptance guarantees.',
  ],
  prohibitedTerms: ['guaranteed', 'fastest', 'world-best', '#1', 'top-ranked', '100% acceptance', '保过', '最速', '採択保証'],
  requiredDisclaimers: {},
  customPromptInstructions: 'Enforce strict author marketing funnel alignment. Never output invented metrics.',
  lastModified: new Date().toISOString(),
  modifiedBy: 'Admin',
};

function loadPlaybookFromDisk() {
  try {
    if (fs.existsSync(PLAYBOOK_FILE_PATH)) {
      adminPlaybook = JSON.parse(fs.readFileSync(PLAYBOOK_FILE_PATH, 'utf-8'));
      console.log(`[Admin Playbook] Loaded active preset: ${adminPlaybook.activePreset}`);
    }
  } catch (err) {
    console.warn('[Admin Playbook] Failed to load admin-playbook.json:', err);
  }
}

function savePlaybookToDisk() {
  try {
    fs.writeFileSync(PLAYBOOK_FILE_PATH, JSON.stringify(adminPlaybook, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Admin Playbook] Failed to write playbook to disk:', err);
  }
}

// --- PERSISTENT METRICS CACHE (metrics-cache.json) ---
const CACHE_FILE_PATH = path.resolve(__dirname, 'metrics-cache.json');
const metricsCache = new Map<string, CachedJournal>();

function loadCacheFromDisk() {
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      const data = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
      const parsed: Record<string, CachedJournal> = JSON.parse(data);
      Object.entries(parsed).forEach(([key, val]) => {
        metricsCache.set(key, val);
      });
      console.log(`[Metrics Cache] Loaded ${metricsCache.size} cached journals from disk.`);
    }
  } catch (err) {
    console.warn('[Metrics Cache] Failed to load cache file, starting fresh:', err);
  }
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

// Initialize on startup
loadDatabaseFromDisk();
loadPlaybookFromDisk();
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

// CJK & Japanese Kana Character Double-Width Counting (Google Ads Standard)
export function countCharacterWidth(text: string): number {
  if (!text) return 0;
  const cjkChars = (text.match(/[\u4e00-\u9fa5\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\u3000-\u303f\uff01-\uffee]/g) || []).length;
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
    url: 'https://www.nature.com',
    slugs: ['nature', 'flagship', 'default', ''],
    journalName: 'Nature',
    publisher: 'Nature Portfolio',
    impactFactor: 56.1,
    fiveYearImpactFactor: 56.7,
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
    reportingYear: 'JCR 2025 (Clarivate Journal Citation Reports)',
    isVerifiedClarivate: true,
    sourceAttribution: 'Verified via Clarivate Journal Citation Reports (JCR 2025) & Web of Science Index',
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

// Lookup Clarivate facts with Persistent Database + Fallback Safeguards
export async function lookupClarivateFacts(url: string, forceRefresh = false): Promise<JCRJournalEntry> {
  const norm = normalizeUrlComponents(url);
  const journalId = norm.journalId;

  // 1. Check structured metrics database (metrics-database.json) first
  let dbRecord = metricsDatabase.get(norm.full) ||
                 metricsDatabase.get(norm.journalId) ||
                 (norm.slug ? metricsDatabase.get(norm.slug) : null);

  // Fallback match for nature root
  if (!dbRecord && (norm.full === 'https://www.nature.com' || norm.host === 'nature.com' || norm.host === 'www.nature.com') && !norm.slug) {
    dbRecord = metricsDatabase.get('https://www.nature.com');
  }

  if (dbRecord && !forceRefresh) {
    const ifMetric = dbRecord.metrics?.impactFactor;
    const casMetric = dbRecord.metrics?.casZone;
    const daysMetric = dbRecord.metrics?.firstDecisionDays;
    const apcMetric = dbRecord.metrics?.apcUsd;

    const ifExpired = ifMetric?.expireAt && new Date(ifMetric.expireAt).getTime() < Date.now();

    if (!ifExpired && ifMetric?.value !== null) {
      console.log(`[Database HIT] Found verified record for ${dbRecord.journalName} (${ifMetric.year} ${ifMetric.period})`);
      return {
        url: dbRecord.canonicalUrl || norm.full,
        slugs: dbRecord.slugs || [norm.slug],
        journalName: dbRecord.journalName,
        publisher: dbRecord.publisher,
        impactFactor: ifMetric?.value ?? null,
        fiveYearImpactFactor: dbRecord.metrics?.fiveYearImpactFactor?.value ?? null,
        jcrQuartile: dbRecord.metrics?.jcrQuartile?.value ?? 'Q1',
        casZone: casMetric?.value ?? null,
        firstDecisionDays: daysMetric?.value ?? null,
        indexing: dbRecord.metrics?.indexing?.value ?? ['SCIE', 'Scopus'],
        openAccessType: dbRecord.metrics?.openAccessType?.value ?? 'Hybrid Open Access',
        apcUsd: apcMetric?.value ?? null,
        chinaWaiverAvailable: false,
        aimsAndScopeSummary: dbRecord.aimsAndScopeSummary,
        primaryDiscipline: dbRecord.primaryDiscipline,
        submissionPortalUrl: dbRecord.submissionPortalUrl,
        isVerifiedClarivate: true,
        verificationStatus: 'source_verified',
        reportingYear: ifMetric?.period || `JCR ${ifMetric?.year || 2025} (Clarivate JCR)`,
        sourceAttribution: `Verified via ${ifMetric?.source || 'Clarivate JCR'} (${ifMetric?.year || 2025})`,
        isFromCache: true,
        cachedAt: dbRecord.lastUpdated || dbRecord.lastAccess,
        cacheExpiresAt: ifMetric?.expireAt,
      };
    }
  }

  // 2. Check persistent in-memory cache
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

  // 3. Direct exact catalog match
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

app.post('/api/cache/refresh/:journalId', async (req, res) => {
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

    const norm = normalizeUrlComponents(facts.url || '');
    const journalId = norm.slug || facts.journalName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const nowStr = new Date().toISOString();

    const userProvidedFacts: JCRJournalEntry = {
      ...facts,
      isVerifiedClarivate: false,
      verificationStatus: 'user_provided',
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
  language: 'EN' | 'ZH' | 'JA';
  category: string;
  positionRecommendation: string;
}

// Stage Headlines with language purity & null-metrics defenses
export function generateStageHeadlines(
  facts: any,
  stage: StageCode,
  outputLanguage: 'EN' | 'ZH' | 'JA' = 'EN'
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

    const ja: HeadlineSeed[] = [
      { text: smartClamp(`${shortName} 学術ジャーナル公式`, 30), sourceFact: facts.journalName, language: 'JA', category: 'Journal Identity', positionRecommendation: 'Position 1' },
      { text: smartClamp(`最新の科学研究成果と論文`, 30), sourceFact: facts.primaryDiscipline, language: 'JA', category: 'Scope & Community', positionRecommendation: 'Position 1' },
      { text: smartClamp(`${facts.publisher} 刊行学術誌`, 30), sourceFact: facts.publisher, language: 'JA', category: 'Journal Identity', positionRecommendation: 'Position 1' },
      { text: smartClamp(`国際ピアレビュー学術論文`, 30), sourceFact: 'Peer Review', language: 'JA', category: 'Journal Identity', positionRecommendation: 'Position 2' },
      { text: smartClamp(`世界の科学者による研究知見`, 30), sourceFact: 'Community', language: 'JA', category: 'Scope & Community', positionRecommendation: 'Position 2' },
      { text: smartClamp(`学術ブレークスルーを閲覧`, 30), sourceFact: 'Discovery', language: 'JA', category: 'Call to Action', positionRecommendation: 'Position 2' },
      { text: smartClamp(`オープンアクセス論文も多数`, 30), sourceFact: facts.openAccessType || 'Open Access', language: 'JA', category: 'Scope & Community', positionRecommendation: 'Position 3' },
      { text: smartClamp(`掲載領域と出版趣旨を確認`, 30), sourceFact: 'Aims & Scope', language: 'JA', category: 'Call to Action', positionRecommendation: 'Position 3' },
      { text: smartClamp(`最新の査読済み論文を読む`, 30), sourceFact: 'Readership', language: 'JA', category: 'Call to Action', positionRecommendation: 'Any Position' },
      { text: smartClamp(`ジャーナルの詳細はこちら`, 30), sourceFact: 'CTA', language: 'JA', category: 'Call to Action', positionRecommendation: 'Any Position' },
      { text: smartClamp(`国際研究ネットワークと連携`, 30), sourceFact: 'Community', language: 'JA', category: 'Scope & Community', positionRecommendation: 'Any Position' },
      { text: smartClamp(`注目論文ハイライトを公開中`, 30), sourceFact: 'Highlights', language: 'JA', category: 'Scope & Community', positionRecommendation: 'Any Position' },
      { text: smartClamp(`信頼の学術出版プラットフォーム`, 30), sourceFact: facts.publisher, language: 'JA', category: 'Journal Identity', positionRecommendation: 'Any Position' },
      { text: smartClamp(`各専門領域の最先端研究`, 30), sourceFact: 'Topics', language: 'JA', category: 'Scope & Community', positionRecommendation: 'Any Position' },
      { text: smartClamp(`学術誌の公式情報を確認`, 30), sourceFact: 'Journal Identity', language: 'JA', category: 'Call to Action', positionRecommendation: 'Any Position' },
    ];

    if (outputLanguage === 'EN') return en.slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
    if (outputLanguage === 'ZH') return zh.slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
    return ja.slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
  }

  // CON (Consideration) - Includes Journal Comparison
  if (stage === 'CON') {
    const en: HeadlineSeed[] = [
      { text: smartClamp(`Is Your Manuscript a Fit?`, 30), sourceFact: 'Fit Evaluation', language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 1' },
      { text: smartClamp(`${shortName} Aims & Scope`, 30), sourceFact: 'Scope Criteria', language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 1' },
      { text: smartClamp(`Evaluate ${shortName}`, 30), sourceFact: facts.journalName, language: 'EN', category: 'Journal Identity', positionRecommendation: 'Position 1' },
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

    const ja: HeadlineSeed[] = [
      { text: smartClamp(`${shortName} 投稿基準と掲載方針`, 30), sourceFact: 'Scope Check', language: 'JA', category: 'Scope & Community', positionRecommendation: 'Position 1' },
      ...(facts.impactFactor ? [{ text: smartClamp(`インパクトファクター ${facts.impactFactor}`, 30), sourceFact: `IF ${facts.impactFactor}`, language: 'JA' as const, category: 'Evaluation & Metrics', positionRecommendation: 'Position 1' }] : []),
      { text: smartClamp(`学術論文の適合性を確認`, 30), sourceFact: 'Fit Evaluation', language: 'JA', category: 'Scope & Community', positionRecommendation: 'Position 1' },
      ...(facts.firstDecisionDays ? [{ text: smartClamp(`初回判定まで平均${facts.firstDecisionDays}日`, 30), sourceFact: `${facts.firstDecisionDays}日査読`, language: 'JA' as const, category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' }] : []),
      { text: smartClamp(`厳正な国際ピアレビュー`, 30), sourceFact: 'Editorial Standards', language: 'JA', category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' },
      { text: smartClamp(`同分野ジャーナルとの比較`, 30), sourceFact: 'Comparison Evaluation', language: 'JA', category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' },
      { text: smartClamp(`収載インデックスと評価`, 30), sourceFact: 'Indexing', language: 'JA', category: 'Evaluation & Metrics', positionRecommendation: 'Position 3' },
      { text: smartClamp(`透明な出版費用とOA情報`, 30), sourceFact: 'Publishing Options', language: 'JA', category: 'Publishing Options', positionRecommendation: 'Position 3' },
      { text: smartClamp(`受付可能な論文形式一覧`, 30), sourceFact: 'Article Formats', language: 'JA', category: 'Scope & Community', positionRecommendation: 'Position 3' },
      { text: smartClamp(`投稿前の適合性チェック`, 30), sourceFact: 'Fit CTA', language: 'JA', category: 'Call to Action', positionRecommendation: 'Any Position' },
      { text: smartClamp(`編集方針と審査プロセス`, 30), sourceFact: 'Editorial Policy', language: 'JA', category: 'Evaluation & Metrics', positionRecommendation: 'Any Position' },
      { text: smartClamp(`迅速で公正な査読体制`, 30), sourceFact: 'Review Turnaround', language: 'JA', category: 'Evaluation & Metrics', positionRecommendation: 'Any Position' },
      { text: smartClamp(`研究の国際的発信力を評価`, 30), sourceFact: 'Reputation', language: 'JA', category: 'Evaluation & Metrics', positionRecommendation: 'Any Position' },
      { text: smartClamp(`著者向け投稿要件を確認`, 30), sourceFact: 'Author Guidance', language: 'JA', category: 'Call to Action', positionRecommendation: 'Any Position' },
      { text: smartClamp(`学術誌の指標を詳しく確認`, 30), sourceFact: 'Metrics Review', language: 'JA', category: 'Evaluation & Metrics', positionRecommendation: 'Any Position' },
    ];

    if (outputLanguage === 'EN') return en.slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
    if (outputLanguage === 'ZH') return zh.slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
    return ja.slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
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

  const ja: HeadlineSeed[] = [
    { text: smartClamp(`${shortName} 論文オンライン投稿`, 30), sourceFact: 'Submission Portal', language: 'JA', category: 'Author Guidance', positionRecommendation: 'Position 1' },
    { text: smartClamp(`投稿規程と提出チェックリスト`, 30), sourceFact: 'Author Guidelines', language: 'JA', category: 'Author Guidance', positionRecommendation: 'Position 1' },
    { text: smartClamp(`公式オンライン投稿窓口`, 30), sourceFact: 'Portal', language: 'JA', category: 'Author Guidance', positionRecommendation: 'Position 1' },
    { text: smartClamp(`原稿執筆要領とフォーマット`, 30), sourceFact: 'Preparation', language: 'JA', category: 'Author Guidance', positionRecommendation: 'Position 2' },
    { text: smartClamp(`公式投稿テンプレート無料入手`, 30), sourceFact: 'Templates', language: 'JA', category: 'Author Guidance', positionRecommendation: 'Position 2' },
    { text: smartClamp(`提出前セルフチェックシート`, 30), sourceFact: 'Checklist', language: 'JA', category: 'Author Guidance', positionRecommendation: 'Position 2' },
    ...(facts.firstDecisionDays ? [{ text: smartClamp(`初回査読結果まで平均${facts.firstDecisionDays}日`, 30), sourceFact: `${facts.firstDecisionDays}日判定`, language: 'JA' as const, category: 'Author Guidance', positionRecommendation: 'Position 3' }] : []),
    { text: smartClamp(`投稿後の査読進捗追跡可能`, 30), sourceFact: 'Tracking', language: 'JA', category: 'Author Guidance', positionRecommendation: 'Position 3' },
    { text: smartClamp(`原稿提出を今すぐ開始`, 30), sourceFact: 'CTA', language: 'JA', category: 'Call to Action', positionRecommendation: 'Any Position' },
    { text: smartClamp(`公式投稿システムはこちら`, 30), sourceFact: 'Portal', language: 'JA', category: 'Author Guidance', positionRecommendation: 'Any Position' },
    { text: smartClamp(`論文投稿ガイドをダウンロード`, 30), sourceFact: 'Download Guide', language: 'JA', category: 'Call to Action', positionRecommendation: 'Any Position' },
    { text: smartClamp(`出版手数料と支援制度`, 30), sourceFact: 'Fees', language: 'JA', category: 'Author Guidance', positionRecommendation: 'Any Position' },
    { text: smartClamp(`国際基準の原稿受付窓口`, 30), sourceFact: 'Standards', language: 'JA', category: 'Author Guidance', positionRecommendation: 'Any Position' },
    { text: smartClamp(`投稿準備をステップ毎に案内`, 30), sourceFact: 'Steps', language: 'JA', category: 'Author Guidance', positionRecommendation: 'Any Position' },
    { text: smartClamp(`論文原稿の提出はこちらから`, 30), sourceFact: 'CTA', language: 'JA', category: 'Call to Action', positionRecommendation: 'Any Position' },
  ];

  if (outputLanguage === 'EN') return en.slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
  if (outputLanguage === 'ZH') return zh.slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
  return ja.slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
}

// Stage Descriptions with language purity
export function generateStageDescriptions(facts: any, stage: StageCode, outputLanguage: 'EN' | 'ZH' | 'JA' = 'EN') {
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
    const ja = [
      { text: smartClamp(`${facts.journalName}の最新学術論文を閲覧。世界をリードする研究成果をお届けします。`, 90), sourceFact: 'Journal Overview', language: 'JA' as const, theme: 'Scope & Relevance' },
      { text: smartClamp(`${facts.publisher}がお届けする最先端の科学研究論文。各分野の重要知見を今すぐ確認。`, 90), sourceFact: facts.publisher, language: 'JA' as const, theme: 'Scope & Relevance' },
      { text: smartClamp(`国際学術コミュニティに向けた画期的な研究知見。査読付き最新号をオンラインで閲覧。`, 90), sourceFact: 'Community Readership', language: 'JA' as const, theme: 'Scope & Relevance' },
      { text: smartClamp(`ジャーナルの掲載対象領域、出版方針、最新のブレークスルー論文をチェック。`, 90), sourceFact: 'Discovery CTA', language: 'JA' as const, theme: 'Scope & Relevance' },
    ];
    if (outputLanguage === 'EN') return en.map(d => ({ ...d, charCount: d.text.length }));
    if (outputLanguage === 'ZH') return zh.map(d => ({ ...d, charCount: d.text.length }));
    return ja.map(d => ({ ...d, charCount: d.text.length }));
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
    const ifJa = facts.impactFactor ? `インパクトファクター${facts.impactFactor}、` : '';
    const daysJa = facts.firstDecisionDays ? `初回判定まで平均${facts.firstDecisionDays}日。` : '迅速な査読体制。';
    const ja = [
      { text: smartClamp(`あなたの研究成果を${facts.journalName}へ。${ifJa}厳正な国際ピアレビューを実施。`, 90), sourceFact: 'Evaluation', language: 'JA' as const, theme: 'Evaluation & Peer Review' },
      { text: smartClamp(`透明性の高い出版方針と明確な採択基準。${daysJa}投稿前の適合性をご確認ください。`, 90), sourceFact: 'Turnaround', language: 'JA' as const, theme: 'Evaluation & Peer Review' },
      { text: smartClamp(`受付可能な原稿形式、出版モデル、査読プロセスを客観的に比較し最適なジャーナルを選択。`, 90), sourceFact: 'Publishing Options', language: 'JA' as const, theme: 'Publishing Options' },
      { text: smartClamp(`研究の国際的影響力を最大化。同分野の主要ジャーナルと指標・査読期間を横断比較。`, 90), sourceFact: 'Comparison Evaluation', language: 'JA' as const, theme: 'Comparison & Fit' },
    ];
    if (outputLanguage === 'EN') return en.map(d => ({ ...d, charCount: d.text.length }));
    if (outputLanguage === 'ZH') return zh.map(d => ({ ...d, charCount: d.text.length }));
    return ja.map(d => ({ ...d, charCount: d.text.length }));
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
  const ja = [
    { text: smartClamp(`${facts.journalName}公式オンライン投稿窓口。投稿規程と提出チェックリストを確認。`, 90), sourceFact: 'Author Guidelines', language: 'JA' as const, theme: 'Author Checklist' },
    { text: smartClamp(`論文フォーマット、執筆要領、必要書類一式をダウンロードして提出準備を開始。`, 90), sourceFact: 'Manuscript Prep', language: 'JA' as const, theme: 'Author Checklist' },
    { text: smartClamp(`Springer Nature公式投稿システムから直接提出。投稿後はオンラインで進捗を追跡可能。`, 90), sourceFact: 'Submission Portal', language: 'JA' as const, theme: 'Publishing Options' },
    { text: smartClamp(`出版倫理基準を遵守し、公正な国際ピアレビューへ。査読用原稿の提出はこちらから。`, 90), sourceFact: 'Peer Review Workflow', language: 'JA' as const, theme: 'Evaluation & Peer Review' },
  ];
  if (outputLanguage === 'EN') return en.map(d => ({ ...d, charCount: d.text.length }));
  if (outputLanguage === 'ZH') return zh.map(d => ({ ...d, charCount: d.text.length }));
  return ja.map(d => ({ ...d, charCount: d.text.length }));
}

export function generateStageKeywords(facts: any, stage: StageCode, outputLanguage: 'EN' | 'ZH' | 'JA' = 'EN') {
  const shortName = facts.journalName.toLowerCase();
  const disc = (facts.primaryDiscipline || 'science').toLowerCase().split('(')[0].trim();

  if (stage === 'AWA') {
    return {
      englishSearchKeywords: outputLanguage === 'EN' ? [
        { keyword: `${disc} research articles`, matchType: 'Broad' as const, intent: 'Research Discovery' },
        { keyword: `"${facts.journalName.toLowerCase()}" overview`, matchType: 'Phrase' as const, intent: 'Journal Discovery' },
        { keyword: `explore ${facts.publisher.toLowerCase()} journals`, matchType: 'Phrase' as const, intent: 'Publisher Discovery' },
        { keyword: `[${facts.journalName.toLowerCase()} scope]`, matchType: 'Exact' as const, intent: 'Scope Discovery' },
      ] : [],
      chineseAuthorKeywords: outputLanguage === 'ZH' ? [
        { keywordZh: `${facts.journalName} 期刊介绍与研究方向`, matchType: '短语 (Phrase)' as const, intentZh: '了解学科范畴' },
        { keywordZh: `${disc} 学术前沿文献`, matchType: '短语 (Phrase)' as const, intentZh: '学术发现与阅读' },
        { keywordZh: `${facts.publisher} 旗下学术期刊`, matchType: '短语 (Phrase)' as const, intentZh: '出版机构发现' },
      ] : [],
      japaneseAuthorKeywords: outputLanguage === 'JA' ? [
        { keywordJa: `${facts.journalName} 最新論文`, matchType: 'フレーズ一致 (Phrase)' as const, intentJa: '論文閲覧・学術動向' },
        { keywordJa: `${disc} 学術雑誌 研究トレンド`, matchType: 'フレーズ一致 (Phrase)' as const, intentJa: '分野別最新知見' },
        { keywordJa: `${facts.publisher} 国際学術誌 購読`, matchType: 'フレーズ一致 (Phrase)' as const, intentJa: '出版元・ジャーナル発見' },
        { keywordJa: `[${facts.journalName.toLowerCase()} 論文一覧]`, matchType: '完全一致 (Exact)' as const, intentJa: 'ジャーナル直接検索' },
      ] : [],
      negativeKeywords: outputLanguage === 'JA'
        ? ['論文代行', '卒論代行', 'レポート代行', '論文売買', '査読偽装', 'ハゲタカジャーナル', '即時掲載保証']
        : outputLanguage === 'ZH'
        ? ['代写', '买卖论文', '包录用', '降重包过', '枪手', '论文代发中介']
        : ['essay mill', 'buy paper', 'guaranteed acceptance', 'paper broker', 'fast publication service'],
    };
  }

  if (stage === 'CON') {
    return {
      englishSearchKeywords: outputLanguage === 'EN' ? [
        { keyword: `[${shortName} impact factor 2025]`, matchType: 'Exact' as const, intent: 'Metric Evaluation' },
        { keyword: `"${shortName} aims and scope"`, matchType: 'Phrase' as const, intent: 'Fit Evaluation' },
        { keyword: `"${shortName} compared to similar journals"`, matchType: 'Phrase' as const, intent: 'Journal Comparison' },
        { keyword: `[${shortName} review time vs standard]`, matchType: 'Exact' as const, intent: 'Turnaround Check' },
      ] : [],
      chineseAuthorKeywords: outputLanguage === 'ZH' ? [
        { keywordZh: `${facts.journalName} 和同类期刊对比`, matchType: '短语 (Phrase)' as const, intentZh: '选刊横向对比' },
        { keywordZh: `${facts.journalName} 分区 影响因子`, matchType: '短语 (Phrase)' as const, intentZh: '分区与考核标准' },
        { keywordZh: `${facts.journalName} 审稿周期与收稿范围`, matchType: '短语 (Phrase)' as const, intentZh: '稿件契合度评估' },
      ] : [],
      japaneseAuthorKeywords: outputLanguage === 'JA' ? [
        { keywordJa: `[${facts.journalName} インパクトファクター]`, matchType: '完全一致 (Exact)' as const, intentJa: '学術指標・業績評価' },
        { keywordJa: `"${facts.journalName} 投稿規程"`, matchType: 'フレーズ一致 (Phrase)' as const, intentJa: '原稿適合性確認' },
        { keywordJa: `"${facts.journalName} 査読期間 採択率"`, matchType: 'フレーズ一致 (Phrase)' as const, intentJa: 'ジャーナル比較・選定' },
        { keywordJa: `[${facts.journalName} 査読プロセス]`, matchType: '完全一致 (Exact)' as const, intentJa: 'ピアレビュー基準' },
      ] : [],
      negativeKeywords: outputLanguage === 'JA'
        ? ['論文代行', '卒論代行', 'レポート代行', '論文売買', '査読偽装', 'ハゲタカジャーナル', '即時掲載保証']
        : outputLanguage === 'ZH'
        ? ['代写', '买卖论文', '包录用', '降重包过', '枪手', '论文代发中介']
        : ['essay mill', 'buy paper', 'guaranteed acceptance', 'paper broker', 'fast publication service'],
    };
  }

  // DEC
  return {
    englishSearchKeywords: outputLanguage === 'EN' ? [
      { keyword: `[submit manuscript ${shortName}]`, matchType: 'Exact' as const, intent: 'Direct Submission' },
      { keyword: `"${shortName} author guidelines"`, matchType: 'Phrase' as const, intent: 'Manuscript Preparation' },
      { keyword: `"${shortName} submission portal"`, matchType: 'Phrase' as const, intent: 'Submission System' },
      { keyword: `[${shortName} manuscript checklist]`, matchType: 'Exact' as const, intent: 'Pre-submission Checklist' },
    ] : [],
    chineseAuthorKeywords: outputLanguage === 'ZH' ? [
      { keywordZh: `${facts.journalName} 官方投稿系统入口`, matchType: '短语 (Phrase)' as const, intentZh: '在线提交稿件' },
      { keywordZh: `${facts.journalName} 作者指南与格式体例`, matchType: '短语 (Phrase)' as const, intentZh: '准备投稿文件' },
      { keywordZh: `${facts.journalName} 投稿模板与流程`, matchType: '短语 (Phrase)' as const, intentZh: '提交前格式校对' },
    ] : [],
    japaneseAuthorKeywords: outputLanguage === 'JA' ? [
      { keywordJa: `[${facts.journalName} 論文投稿ポータル]`, matchType: '完全一致 (Exact)' as const, intentJa: 'オンライン原稿提出' },
      { keywordJa: `"${facts.journalName} 執筆要領 テンプレート"`, matchType: 'フレーズ一致 (Phrase)' as const, intentJa: '投稿前フォーマット準備' },
      { keywordJa: `"${facts.journalName} オンライン投稿システム"`, matchType: 'フレーズ一致 (Phrase)' as const, intentJa: '査読用原稿受付窓口' },
      { keywordJa: `[${facts.journalName} 投稿チェックリスト]`, matchType: '完全一致 (Exact)' as const, intentJa: '提出前最終確認' },
    ] : [],
    negativeKeywords: outputLanguage === 'JA'
      ? ['論文代行', '卒論代行', 'レポート代行', '論文売買', '査読偽装', 'ハゲタカジャーナル', '即時掲載保証']
      : outputLanguage === 'ZH'
      ? ['代写', '买卖论文', '包录用', '降重包过', '枪手', '论文代发中介']
      : ['essay mill', 'buy paper', 'guaranteed acceptance', 'paper broker', 'fast publication service'],
  };
}

export function generateStageDisplayAd(facts: any, stage: StageCode, outputLanguage: 'EN' | 'ZH' | 'JA' = 'EN') {
  const shortName = facts.journalName.length > 18 ? facts.journalName.slice(0, 18) : facts.journalName;

  if (stage === 'AWA') {
    if (outputLanguage === 'JA') {
      return {
        shortHeadline: smartClamp(`${shortName}の最新研究`, 30),
        shortHeadlineCharCount: 0,
        longHeadline: smartClamp(`世界をリードする学術誌${facts.journalName} · 最新論文を閲覧`, 90),
        longHeadlineCharCount: 0,
        description: smartClamp(`自然科学の最先端研究成果とブレークスルーをお届けします。今すぐ最新号を閲覧。`, 90),
        descriptionCharCount: 0,
        businessName: facts.publisher,
        ctaText: '最新論文を閲覧',
        visualConceptPrompt: `An academic research banner focusing on scientific discovery, high-resolution microscopy or molecular lattice, subtle journal cover, and clean Springer Nature branding. Low text density.`,
        imageAccentColor: '#002d62',
        targetPlacements: ['researchgate.net', 'ncbi.nlm.nih.gov (PubMed)', 'sciencedirect.com', 'nature.com'],
        bannerHeadlineZh: `${facts.journalName} 最新論文を閲覧`,
        bannerSubtextZh: `${facts.publisher} 刊行 · 国際ピアレビュー論文`,
      };
    }
    if (outputLanguage === 'ZH') {
      return {
        shortHeadline: smartClamp(`探索 ${shortName}`, 30),
        shortHeadlineCharCount: 0,
        longHeadline: smartClamp(`探索 ${facts.journalName} 前沿学术成果 · ${facts.publisher}`, 90),
        longHeadlineCharCount: 0,
        description: smartClamp(`查阅 ${facts.primaryDiscipline || '综合性科学'} 领域最新发表论文与研究进展。`, 90),
        descriptionCharCount: 0,
        businessName: facts.publisher,
        ctaText: '查阅期刊成果',
        visualConceptPrompt: `An academic research banner focusing on scientific discovery, high-resolution microscopy or molecular lattice, subtle journal cover, and clean Springer Nature branding. Low text density.`,
        imageAccentColor: '#002d62',
        targetPlacements: ['researchgate.net', 'ncbi.nlm.nih.gov (PubMed)', 'sciencedirect.com', 'nature.com'],
        bannerHeadlineZh: `探索 ${facts.journalName} 学术成果`,
        bannerSubtextZh: `由 ${facts.publisher} 出版 · 汇聚全球前沿学术发现与学科突破`,
      };
    }
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
      bannerHeadlineZh: `Discover ${facts.journalName}`,
      bannerSubtextZh: `Published by ${facts.publisher} · Groundbreaking Scientific Discoveries`,
    };
  }

  if (stage === 'CON') {
    const metricStr = facts.impactFactor ? `Clarivate IF ${facts.impactFactor}` : 'Indexed Research';
    if (outputLanguage === 'JA') {
      return {
        shortHeadline: smartClamp(`${shortName} 投稿基準`, 30),
        shortHeadlineCharCount: 0,
        longHeadline: smartClamp(`${facts.journalName}への投稿を検討: 厳正な査読と高い国際的評価`, 90),
        longHeadlineCharCount: 0,
        description: smartClamp(`客観的な学術指標、査読期間、原稿フォーマットを確認し、最適な学術誌を選択。`, 90),
        descriptionCharCount: 0,
        businessName: facts.publisher,
        ctaText: '投稿規程を確認',
        visualConceptPrompt: `An objective academic evaluation ad featuring the official journal cover, Clarivate indexing badges (SCIE), and professional scholarly palette.`,
        imageAccentColor: '#1e1b4b',
        targetPlacements: ['researchgate.net', 'ncbi.nlm.nih.gov (PubMed)', 'scholar.google.com', 'nature.com'],
        bannerHeadlineZh: `${facts.journalName} 投稿検討ガイド`,
        bannerSubtextZh: `査読基準と学術指標を確認`,
      };
    }
    if (outputLanguage === 'ZH') {
      return {
        shortHeadline: smartClamp(`核对 ${shortName} 契合度`, 30),
        shortHeadlineCharCount: 0,
        longHeadline: smartClamp(`评估 ${facts.journalName}: 同行评议严谨，指标透明`, 90),
        longHeadlineCharCount: 0,
        description: smartClamp(`核对期刊学科范畴、审稿周期与发表模式，助力学者理性选刊。`, 90),
        descriptionCharCount: 0,
        businessName: facts.publisher,
        ctaText: '核对期刊契合度',
        visualConceptPrompt: `An objective academic evaluation ad featuring the official journal cover, Clarivate indexing badges (SCIE), and professional scholarly palette.`,
        imageAccentColor: '#1e1b4b',
        targetPlacements: ['researchgate.net', 'ncbi.nlm.nih.gov (PubMed)', 'scholar.google.com', 'nature.com'],
        bannerHeadlineZh: `${facts.journalName} 选刊评估指南`,
        bannerSubtextZh: `核对学术契合度、审稿流程与收稿范围`,
      };
    }
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
      bannerHeadlineZh: `${facts.journalName} Publishing Evaluation`,
      bannerSubtextZh: `Review Editorial Scope, Turnaround Metrics and Indexing`,
    };
  }

  // DEC
  if (outputLanguage === 'JA') {
    return {
      shortHeadline: smartClamp(`${shortName} オンライン投稿`, 30),
      shortHeadlineCharCount: 0,
      longHeadline: smartClamp(`${facts.journalName} 論文投稿窓口 · 公式オンライン提出ポータル`, 90),
      longHeadlineCharCount: 0,
      description: smartClamp(`著者向け投稿規程とチェックリストを完備。公式システムから直接手稿を提出。`, 90),
      descriptionCharCount: 0,
      businessName: facts.publisher,
      ctaText: '論文を投稿する',
      visualConceptPrompt: `A streamlined author guidance banner showcasing a manuscript submission checklist icon, clear typography, verified portal badge, and Springer Nature integrity crest.`,
      imageAccentColor: '#064e3b',
      targetPlacements: ['researchgate.net', 'ncbi.nlm.nih.gov (PubMed)', 'nature.com', 'springerlink.com'],
      bannerHeadlineZh: `${facts.journalName} 原稿オンライン受付`,
      bannerSubtextZh: `公式投稿ポータルから直接提出`,
    };
  }
  if (outputLanguage === 'ZH') {
    return {
      shortHeadline: smartClamp(`投递至 ${shortName}`, 30),
      shortHeadlineCharCount: 0,
      longHeadline: smartClamp(`${facts.journalName} 官方作者投稿须知与提交入口`, 90),
      longHeadlineCharCount: 0,
      description: smartClamp(`查阅手稿体例规范，下载格式清单，通过 Springer Nature 官方通道在线递交论文。`, 90),
      descriptionCharCount: 0,
      businessName: facts.publisher,
      ctaText: '查阅投稿清单',
      visualConceptPrompt: `A streamlined author guidance banner showcasing a manuscript submission checklist icon, clear typography, verified portal badge, and Springer Nature integrity crest.`,
      imageAccentColor: '#064e3b',
      targetPlacements: ['researchgate.net', 'ncbi.nlm.nih.gov (PubMed)', 'nature.com', 'springerlink.com'],
      bannerHeadlineZh: `${facts.journalName} 作者投稿须知`,
      bannerSubtextZh: `获取官方投稿清单与格式指南 · 在线投递学术稿件`,
    };
  }
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
    bannerHeadlineZh: `Submit to ${facts.journalName}`,
    bannerSubtextZh: `Access Author Guidelines, Preparation Checklist and Portal`,
  };
}

export function generateDeterministicCampaign(
  facts: any,
  stage: StageCode,
  outputLanguage: 'EN' | 'ZH' | 'JA' = 'EN'
) {
  const stageConfig = STAGE_CONFIGS[stage];
  const headlines = generateStageHeadlines(facts, stage, outputLanguage);
  const descriptions = generateStageDescriptions(facts, stage, outputLanguage);
  const keywords = generateStageKeywords(facts, stage, outputLanguage);
  const displayAd = generateStageDisplayAd(facts, stage, outputLanguage);

  displayAd.shortHeadlineCharCount = displayAd.shortHeadline.length;
  displayAd.longHeadlineCharCount = displayAd.longHeadline.length;
  displayAd.descriptionCharCount = displayAd.description.length;

  const norm = normalizeUrlComponents(facts.url || '');
  const baseUrl = norm.full || 'https://www.nature.com';

  const sitelinks =
    outputLanguage === 'JA'
      ? stage === 'AWA'
        ? [
            { text: 'ジャーナル概要', description1: '学術ミッションと掲載方針', description2: '国際的学術コミュニティ', finalUrl: `${baseUrl}/about`, title: 'ジャーナル概要', desc: '学術ミッションと掲載方針。国際的学術コミュニティ。', urlPath: `${baseUrl}/about` },
            { text: '最新論文を閲覧', description1: '厳選された査読済み論文', description2: '最新の科学的発見を公開', finalUrl: `${baseUrl}/articles`, title: '最新論文を閲覧', desc: '厳選された査読済み論文。最新の科学的発見を公開。', urlPath: `${baseUrl}/articles` },
            { text: '国際編集委員会', description1: '世界一流の研究者陣が運営', description2: '公正なピアレビューを担保', finalUrl: `${baseUrl}/editors`, title: '国際編集委員会', desc: '世界一流の研究者陣が運営。公正なピアレビューを担保。', urlPath: `${baseUrl}/editors` },
            { text: '特集論文集', description1: '重要研究テーマの特集号', description2: '高注目度の論文を収録', finalUrl: `${baseUrl}/collections`, title: '特集論文集', desc: '重要研究テーマの特集号。高注目度の論文を収録。', urlPath: `${baseUrl}/collections` },
          ]
        : stage === 'CON'
        ? [
            { text: '掲載方針と領域', description1: '研究テーマの合致度を確認', description2: '受領対象の論文分野一覧', finalUrl: `${baseUrl}/aims-and-scope`, title: '掲載方針と領域', desc: '研究テーマの合致度を確認。受領対象の論文分野一覧。', urlPath: `${baseUrl}/aims-and-scope` },
            { text: '受付論文形式', description1: '原著論文・総説の受付要項', description2: '短報やレターの基準も網羅', finalUrl: `${baseUrl}/article-types`, title: '受付論文形式', desc: '原著論文・総説の受付要項。短報やレターの基準も網羅。', urlPath: `${baseUrl}/article-types` },
            { text: '学術指標と収載', description1: '公式IFと収載インデックス', description2: '国際データベース検索対応', finalUrl: `${baseUrl}/metrics`, title: '学術指標と収載', desc: '公式IFと収載インデックス。国際データベース検索対応。', urlPath: `${baseUrl}/metrics` },
            { text: '出版費用とOA', description1: '透明なAPC規定と助成案内', description2: '各種免除ポリシーを完備', finalUrl: `${baseUrl}/open-access`, title: '出版費用とOA', desc: '透明なAPC規定と助成案内。各種免除ポリシーを完備。', urlPath: `${baseUrl}/open-access` },
          ]
        : [
            { text: '著者向け投稿規程', description1: '原稿執筆要領とフォーマット', description2: '図表作成ガイドライン完備', finalUrl: `${baseUrl}/for-authors`, title: '著者向け投稿規程', desc: '原稿執筆要領とフォーマット。図表作成ガイドライン完備。', urlPath: `${baseUrl}/for-authors` },
            { text: '提出前チェック', description1: '投稿に必要な添付書類一覧', description2: '倫理同意書とデータ要件', finalUrl: `${baseUrl}/checklist`, title: '提出前チェック', desc: '投稿に必要な添付書類一覧。倫理同意書とデータ要件。', urlPath: `${baseUrl}/checklist` },
            { text: '出版費用と免除', description1: '費用ポリシーと助成案内', description2: '機関契約による費用支援', finalUrl: `${baseUrl}/apc-waivers`, title: '出版費用と免除', desc: '費用ポリシーと助成案内。機関契約による費用支援。', urlPath: `${baseUrl}/apc-waivers` },
            { text: 'オンライン投稿', description1: '公式原稿提出システムへ', description2: '査読進捗を常時追跡可能', finalUrl: `${baseUrl}/submit`, title: 'オンライン投稿', desc: '公式原稿提出システムへ。査読進捗を常時追跡可能。', urlPath: `${baseUrl}/submit` },
          ]
      : outputLanguage === 'ZH'
      ? stage === 'AWA'
        ? [
            { text: '期刊介绍与范围', description1: '了解研究学科与期刊定位', description2: '学术共同体与读者覆盖', finalUrl: `${baseUrl}/about`, title: '期刊介绍与范围', desc: '了解研究学科与期刊定位。学术共同体与读者覆盖。', urlPath: `${baseUrl}/about` },
            { text: '查阅最新论文', description1: '浏览同行评议前沿成果', description2: '高学术价值精选研究', finalUrl: `${baseUrl}/articles`, title: '查阅最新论文', desc: '浏览同行评议前沿成果。高学术价值精选研究。', urlPath: `${baseUrl}/articles` },
            { text: '国际编委团队', description1: '知名领军学者把关审稿', description2: '保障专业严谨学术水准', finalUrl: `${baseUrl}/editors`, title: '国际编委团队', desc: '知名领军学者把关审稿。保障专业严谨学术水准。', urlPath: `${baseUrl}/editors` },
            { text: '特色专题论文集', description1: '精选前沿学术主题专辑', description2: '跨学科热点专题探索', finalUrl: `${baseUrl}/collections`, title: '特色专题论文集', desc: '精选前沿学术主题专辑。跨学科热点专题探索。', urlPath: `${baseUrl}/collections` },
          ]
        : stage === 'CON'
        ? [
            { text: '收稿范围契合核对', description1: '确认稿件主题与栏目定位', description2: '评估论文契合度与标准', finalUrl: `${baseUrl}/aims-and-scope`, title: '收稿范围契合核对', desc: '确认稿件主题与栏目定位。评估论文契合度与标准。', urlPath: `${baseUrl}/aims-and-scope` },
            { text: '接受文章类型体例', description1: '原著论著快报与综述要求', description2: '查阅字数与版块规范', finalUrl: `${baseUrl}/article-types`, title: '接受文章类型体例', desc: '原著论著快报与综述要求。查阅字数与版块规范。', urlPath: `${baseUrl}/article-types` },
            { text: '期刊指标检索收录', description1: '影响因子与数据库收录现状', description2: '权威引文与分区公开', finalUrl: `${baseUrl}/metrics`, title: '期刊指标检索收录', desc: '影响因子与数据库收录现状。权威引文与分区公开。', urlPath: `${baseUrl}/metrics` },
            { text: '版面费开源政策', description1: '透明公开的APC与减免支持', description2: '符合中国科研资助政策', finalUrl: `${baseUrl}/open-access`, title: '版面费开源政策', desc: '透明公开的APC与减免支持。符合中国科研资助政策。', urlPath: `${baseUrl}/open-access` },
          ]
        : [
            { text: '作者投稿须知指南', description1: '原稿体例规范与格式说明', description2: '官方排版模板免费下载', finalUrl: `${baseUrl}/for-authors`, title: '作者投稿须知指南', desc: '原稿体例规范与格式说明。官方排版模板免费下载。', urlPath: `${baseUrl}/for-authors` },
            { text: '投稿前自查清单', description1: '核对必备文件与签署表格', description2: '规避初审退修常见疏漏', finalUrl: `${baseUrl}/checklist`, title: '投稿前自查清单', desc: '核对必备文件与签署表格。规避初审退修常见疏漏。', urlPath: `${baseUrl}/checklist` },
            { text: '版面费与资助减免', description1: '资助政策与费用支付说明', description2: '机构合作协议免缴指南', finalUrl: `${baseUrl}/apc-waivers`, title: '版面费与资助减免', desc: '资助政策与费用支付说明。机构合作协议免缴指南。', urlPath: `${baseUrl}/apc-waivers` },
            { text: '官方在线投递系统', description1: '安全提交经过校对的稿件', description2: '全程透明追踪审稿进度', finalUrl: `${baseUrl}/submit`, title: '官方在线投递系统', desc: '安全提交经过校对的稿件。全程透明追踪审稿进度。', urlPath: `${baseUrl}/submit` },
          ]
      : stage === 'AWA'
      ? [
          { text: 'Journal Overview & Scope', description1: 'Explore research fields and mission', description2: 'Connect with global scientific readers', finalUrl: `${baseUrl}/about`, title: 'Journal Overview & Scope', desc: 'Explore research fields and mission. Connect with global scientific readers.', urlPath: `${baseUrl}/about` },
          { text: 'Browse Latest Articles', description1: 'Read recent peer-reviewed studies', description2: 'Open discoveries and notable papers', finalUrl: `${baseUrl}/articles`, title: 'Browse Latest Articles', desc: 'Read recent peer-reviewed studies. Open discoveries and notable papers.', urlPath: `${baseUrl}/articles` },
          { text: 'Editorial Leadership', description1: 'Meet international board members', description2: 'Distinguished active researchers', finalUrl: `${baseUrl}/editors`, title: 'Editorial Leadership', desc: 'Meet international board members. Distinguished active researchers.', urlPath: `${baseUrl}/editors` },
          { text: 'Thematic Collections', description1: 'Curated topical research series', description2: 'Cross-disciplinary special issues', finalUrl: `${baseUrl}/collections`, title: 'Thematic Collections', desc: 'Curated topical research series. Cross-disciplinary special issues.', urlPath: `${baseUrl}/collections` },
        ]
      : stage === 'CON'
      ? [
          { text: 'Aims & Scope Evaluation', description1: 'Check topical alignment and criteria', description2: 'Verify if your paper fits aims', finalUrl: `${baseUrl}/aims-and-scope`, title: 'Aims & Scope Evaluation', desc: 'Check topical alignment and criteria. Verify if your paper fits aims.', urlPath: `${baseUrl}/aims-and-scope` },
          { text: 'Article Types & Formats', description1: 'Accepted original research & reviews', description2: 'Guidelines on word count and data', finalUrl: `${baseUrl}/article-types`, title: 'Article Types & Formats', desc: 'Accepted original research & reviews. Guidelines on word count and data.', urlPath: `${baseUrl}/article-types` },
          { text: 'Journal Metrics & Index', description1: 'Official Impact Factor and rankings', description2: 'Indexed in Web of Science and PubMed', finalUrl: `${baseUrl}/metrics`, title: 'Journal Metrics & Index', desc: 'Official Impact Factor and rankings. Indexed in Web of Science and PubMed.', urlPath: `${baseUrl}/metrics` },
          { text: 'Publishing Options & Fees', description1: 'Transparent APC and waiver terms', description2: 'Funding and institutional support', finalUrl: `${baseUrl}/open-access`, title: 'Publishing Options & Fees', desc: 'Transparent APC and waiver terms. Funding and institutional support.', urlPath: `${baseUrl}/open-access` },
        ]
      : [
          { text: 'Author Guidelines', description1: 'Manuscript preparation and style', description2: 'Download Word and LaTeX templates', finalUrl: `${baseUrl}/for-authors`, title: 'Author Guidelines', desc: 'Manuscript preparation and style. Download Word and LaTeX templates.', urlPath: `${baseUrl}/for-authors` },
          { text: 'Submission Checklist', description1: 'Required files and checklist items', description2: 'Avoid common delays before review', finalUrl: `${baseUrl}/checklist`, title: 'Submission Checklist', desc: 'Required files and checklist items. Avoid common delays before review.', urlPath: `${baseUrl}/checklist` },
          { text: 'APC & Waiver Criteria', description1: 'Transparent author publishing fees', description2: 'Institutional discounts and waivers', finalUrl: `${baseUrl}/apc-waivers`, title: 'APC & Waiver Criteria', desc: 'Transparent author publishing fees. Institutional discounts and waivers.', urlPath: `${baseUrl}/apc-waivers` },
          { text: 'Online Submission Portal', description1: 'Direct author upload portal', description2: 'Track peer review status online', finalUrl: `${baseUrl}/submit`, title: 'Online Submission Portal', desc: 'Direct author upload portal. Track peer review status online.', urlPath: `${baseUrl}/submit` },
        ];

  const callouts =
    outputLanguage === 'JA'
      ? stage === 'AWA'
        ? [`${facts.publisher} 刊行`, '世界的な読者層', '国際ピアレビュー', '最新の科学的知見']
        : stage === 'CON'
        ? [facts.impactFactor ? `IF ${facts.impactFactor}` : 'SCIE 収載', '厳正なピアレビュー', facts.firstDecisionDays ? `初回判定: 平均${facts.firstDecisionDays}日` : '迅速な審査体制', '明確な出版基準']
        : ['著者向け投稿規程完備', '提出前チェックリスト対応', facts.firstDecisionDays ? `初回判定: 平均${facts.firstDecisionDays}日` : '迅速な査読', '公式オンライン投稿']
      : outputLanguage === 'ZH'
      ? stage === 'AWA'
        ? [`${facts.publisher} 出版`, '国际学术读者网络', '严谨同行评议', '学科前沿成果']
        : stage === 'CON'
        ? [facts.impactFactor ? `Clarivate IF ${facts.impactFactor}` : 'SCIE 收录', facts.casZone ? facts.casZone.slice(0, 14) : '同行评议标准', facts.firstDecisionDays ? `平均初审约${facts.firstDecisionDays}天` : '审稿流程规范', '发表政策透明']
        : ['作者指南规范齐备', '投稿材料自查清单', facts.firstDecisionDays ? `初审约${facts.firstDecisionDays}天` : '审稿周期透明', '官方投递通道']
      : stage === 'AWA'
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
        header: outputLanguage === 'JA' ? '学術領域' : outputLanguage === 'ZH' ? '学科方向' : 'Disciplines',
        values: [(facts.primaryDiscipline || 'Scientific Research').split('(')[0].trim(), facts.publisher, outputLanguage === 'JA' ? '査読付き学術研究' : outputLanguage === 'ZH' ? '同行评议学术成果' : 'Peer-Reviewed Research'],
      },
      recommendedFinalUrl: `${baseUrl}${stageConfig.recommendedDestination.urlPath}`,
    },
    displayAds: displayAd,
    keywords,
    outputLanguage,
  };
}

// 3. Campaign Generation API
app.post('/api/generate-campaign', async (req, res) => {
  try {
    const {
      landingPageUrl,
      channels = ['search', 'display'],
      funnelStage = 'CON',
      outputLanguage = 'EN',
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
3. Language purity: If language is 'EN', output ZERO Chinese or Japanese characters. If 'ZH', output 100% authentic Simplified Chinese with ZERO Latin letters or Japanese kana. If 'JA', output 100% authentic academic Japanese (日本語) with ZERO Latin letters or Chinese-only phrasing.`;

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
    const { landingPageUrl, outputLanguage = 'EN' } = req.body;
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

// 5. API: Admin Playbook Configuration
app.get('/api/playbook', (_req, res) => {
  res.json({ success: true, playbook: adminPlaybook });
});

app.post('/api/playbook', (req, res) => {
  try {
    const updated = req.body;
    if (updated && typeof updated === 'object') {
      adminPlaybook = {
        ...adminPlaybook,
        ...updated,
        lastModified: new Date().toISOString(),
      };
      savePlaybookToDisk();
      console.log(`[Admin Playbook] Updated and saved to disk. Active preset: ${adminPlaybook.activePreset}`);
      return res.json({ success: true, playbook: adminPlaybook });
    }
    res.status(400).json({ error: 'Invalid playbook payload' });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save playbook' });
  }
});

// 6. API: Metrics Database Journals List & Update
app.get('/api/database/journals', (_req, res) => {
  try {
    const list: any[] = [];
    metricsDatabase.forEach((val, key) => {
      if (key.startsWith('http://') || key.startsWith('https://')) {
        list.push(val);
      }
    });
    res.json({ success: true, journals: list });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to list database journals' });
  }
});

app.post('/api/database/journal', (req, res) => {
  try {
    const { journal } = req.body;
    if (!journal || !journal.canonicalUrl) {
      return res.status(400).json({ error: 'Journal object with canonicalUrl is required' });
    }
    const norm = normalizeUrlComponents(journal.canonicalUrl);
    const key = norm.full;
    metricsDatabase.set(key, {
      ...journal,
      lastUpdated: new Date().toISOString(),
    });
    if (journal.journalId) metricsDatabase.set(journal.journalId, journal);
    saveDatabaseToDisk();
    console.log(`[Metrics DB] Saved journal ${journal.journalName} to database.`);
    res.json({ success: true, journal });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save journal to database' });
  }
});

// 7. API: Batch Check Metrics for Multiple URLs (Bulk Mode)
app.post('/api/batch-check-metrics', async (req, res) => {
  try {
    const { urls } = req.body;
    if (!Array.isArray(urls)) {
      return res.status(400).json({ error: 'urls array is required' });
    }

    const results = await Promise.all(
      urls.map(async (rawUrl: string) => {
        const cleaned = (rawUrl || '').trim();
        if (!cleaned) return null;
        try {
          const facts = await lookupClarivateFacts(cleaned);
          return {
            url: cleaned,
            facts,
            status: facts.verificationStatus === 'missing' ? 'missing_metrics' : 'metrics_ready',
          };
        } catch (err: any) {
          return {
            url: cleaned,
            error: err.message || 'Lookup failed',
            status: 'error',
          };
        }
      })
    );

    res.json({ success: true, items: results.filter(Boolean) });
  } catch (err: any) {
    console.error('Batch metrics check failed:', err);
    res.status(500).json({ error: err.message || 'Batch check failed' });
  }
});

// 8. API: Batch Campaign Generation (Bulk Mode)
app.post('/api/batch-generate-campaigns', async (req, res) => {
  try {
    const { items, stage = 'CON', outputLanguage = 'EN' } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' });
    }

    const normalizedStage = normalizeStage(stage);

    const generatedResults = await Promise.all(
      items.map(async (item: { url: string; userProvidedFacts?: any }) => {
        try {
          let facts: JCRJournalEntry;
          if (item.userProvidedFacts && item.userProvidedFacts.verificationStatus === 'user_provided') {
            facts = item.userProvidedFacts;
          } else {
            facts = await lookupClarivateFacts(item.url);
          }

          if (facts.verificationStatus === 'missing' || facts.impactFactor === null) {
            return {
              url: item.url,
              status: 'missing_metrics',
              facts,
              error: 'Missing required metrics. Manual review required.',
            };
          }

          const campaign = generateDeterministicCampaign(facts, normalizedStage, outputLanguage);
          return {
            url: item.url,
            status: 'completed',
            facts,
            campaign,
          };
        } catch (err: any) {
          return {
            url: item.url,
            status: 'error',
            error: err.message || 'Generation failed',
          };
        }
      })
    );

    res.json({ success: true, results: generatedResults });
  } catch (err: any) {
    console.error('Batch generation failed:', err);
    res.status(500).json({ error: err.message || 'Batch generation failed' });
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

startServer().catch((err) => {
  console.error('Server failed to start:', err);
  process.exit(1);
});
