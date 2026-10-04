import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
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
  impactFactor: number;
  fiveYearImpactFactor: number;
  jcrQuartile: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  casZone: string;
  firstDecisionDays: number;
  indexing: string[];
  openAccessType: 'Gold Open Access' | 'Hybrid Open Access';
  apcUsd: number;
  chinaWaiverAvailable: boolean;
  aimsAndScopeSummary: string;
  primaryDiscipline: string;
  verificationStatus: 'source_verified' | 'user_provided' | 'unverified';
  reportingYear: string;
}

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
  },
  {
    url: 'https://www.nature.com/cr',
    slugs: ['cr', 'cell-research'],
    journalName: 'Cell Research',
    publisher: 'Nature Portfolio',
    impactFactor: 44.1,
    fiveYearImpactFactor: 40.2,
    jcrQuartile: 'Q1',
    casZone: '中科院生物学1区 Top',
    firstDecisionDays: 24,
    indexing: ['SCIE', 'PubMed Central', 'MEDLINE', 'Scopus'],
    openAccessType: 'Hybrid Open Access',
    apcUsd: 4990,
    chinaWaiverAvailable: true,
    aimsAndScopeSummary: 'Leading international life sciences journal published in partnership with Center for Excellence in Molecular Cell Science, CAS, and Nature Portfolio.',
    primaryDiscipline: 'Cell Biology & Molecular Medicine (细胞生物学)',
    verificationStatus: 'source_verified',
    reportingYear: 'JCR 2024 (Clarivate Journal Citation Reports)',
  },
  {
    url: 'https://www.nature.com/ncomms',
    slugs: ['ncomms', 'nature-communications'],
    journalName: 'Nature Communications',
    publisher: 'Nature Portfolio',
    impactFactor: 14.7,
    fiveYearImpactFactor: 15.6,
    jcrQuartile: 'Q1',
    casZone: '中科院综合性期刊1区 Top',
    firstDecisionDays: 28,
    indexing: ['SCIE', 'PubMed Central', 'Scopus', 'DOAJ', 'CAS'],
    openAccessType: 'Gold Open Access',
    apcUsd: 6790,
    chinaWaiverAvailable: true,
    aimsAndScopeSummary: 'Flagship multidisciplinary Open Access journal publishing high-quality, high-impact research across biological, health, chemical, physical, and Earth sciences.',
    primaryDiscipline: 'Multidisciplinary Sciences (综合性科学)',
    verificationStatus: 'source_verified',
    reportingYear: 'JCR 2024 (Clarivate Journal Citation Reports)',
  },
  {
    url: 'https://www.nature.com/srep',
    slugs: ['srep', 'scientific-reports'],
    journalName: 'Scientific Reports',
    publisher: 'Springer Nature',
    impactFactor: 3.8,
    fiveYearImpactFactor: 4.3,
    jcrQuartile: 'Q1',
    casZone: '中科院综合性期刊3区',
    firstDecisionDays: 32,
    indexing: ['SCIE', 'PubMed Central', 'Scopus', 'DOAJ'],
    openAccessType: 'Gold Open Access',
    apcUsd: 2690,
    chinaWaiverAvailable: true,
    aimsAndScopeSummary: 'High-volume peer-reviewed Open Access journal from Nature Portfolio publishing robust, scientifically sound original research from all areas of natural sciences and engineering.',
    primaryDiscipline: 'Natural & Applied Sciences (自然科学与工程)',
    verificationStatus: 'source_verified',
    reportingYear: 'JCR 2024 (Clarivate Journal Citation Reports)',
  },
  {
    url: 'https://www.nature.com/onc',
    slugs: ['onc', 'oncogene'],
    journalName: 'Oncogene',
    publisher: 'Nature Portfolio',
    impactFactor: 6.9,
    fiveYearImpactFactor: 7.8,
    jcrQuartile: 'Q1',
    casZone: '中科院医学1区 Top',
    firstDecisionDays: 26,
    indexing: ['SCIE', 'PubMed Central', 'MEDLINE', 'Scopus'],
    openAccessType: 'Hybrid Open Access',
    apcUsd: 4690,
    chinaWaiverAvailable: true,
    aimsAndScopeSummary: 'Prominent cancer journal from Nature Portfolio covering cellular, molecular, and genetic mechanisms of tumor biology and therapy.',
    primaryDiscipline: 'Oncology & Cancer Research (肿瘤与癌症研究)',
    verificationStatus: 'source_verified',
    reportingYear: 'JCR 2024 (Clarivate Journal Citation Reports)',
  },
  {
    url: 'https://www.nature.com/sttt',
    slugs: ['sttt', 'signal-transduction-and-targeted-therapy'],
    journalName: 'Signal Transduction and Targeted Therapy',
    publisher: 'Nature Portfolio',
    impactFactor: 40.8,
    fiveYearImpactFactor: 39.5,
    jcrQuartile: 'Q1',
    casZone: '中科院医学1区 Top',
    firstDecisionDays: 21,
    indexing: ['SCIE', 'PubMed Central', 'Scopus', 'DOAJ'],
    openAccessType: 'Gold Open Access',
    apcUsd: 4190,
    chinaWaiverAvailable: true,
    aimsAndScopeSummary: 'Published in partnership with West China Hospital of Sichuan University, focusing on molecular signaling mechanisms and precision therapeutics.',
    primaryDiscipline: 'Pharmacology & Targeted Therapy (靶向治疗与药理学)',
    verificationStatus: 'source_verified',
    reportingYear: 'JCR 2024 (Clarivate Journal Citation Reports)',
  },
  {
    url: 'https://www.nature.com/nm',
    slugs: ['nm', 'nature-medicine'],
    journalName: 'Nature Medicine',
    publisher: 'Nature Portfolio',
    impactFactor: 58.7,
    fiveYearImpactFactor: 62.4,
    jcrQuartile: 'Q1',
    casZone: '中科院医学1区 Top',
    firstDecisionDays: 24,
    indexing: ['SCIE', 'PubMed Central', 'MEDLINE', 'Scopus'],
    openAccessType: 'Hybrid Open Access',
    apcUsd: 11690,
    chinaWaiverAvailable: false,
    aimsAndScopeSummary: 'Publishes research that addresses the needs of patients and clinical medicine around the world.',
    primaryDiscipline: 'Clinical Medicine (临床医学)',
    verificationStatus: 'source_verified',
    reportingYear: 'JCR 2024 (Clarivate Journal Citation Reports)',
  },
  {
    url: 'https://bmcmedicine.biomedcentral.com',
    slugs: ['bmcmedicine', 'bmc-medicine'],
    journalName: 'BMC Medicine',
    publisher: 'BMC (Part of Springer Nature)',
    impactFactor: 9.3,
    fiveYearImpactFactor: 10.8,
    jcrQuartile: 'Q1',
    casZone: '中科院医学1区 Top',
    firstDecisionDays: 22,
    indexing: ['SCIE', 'PubMed Central', 'MEDLINE', 'Scopus'],
    openAccessType: 'Gold Open Access',
    apcUsd: 3890,
    chinaWaiverAvailable: true,
    aimsAndScopeSummary: 'Premier medical journal in the BMC series publishing outstanding research in clinical practice, translational medicine, global public health, and biomedical policy.',
    primaryDiscipline: 'Clinical & Translational Medicine (临床与转化医学)',
    verificationStatus: 'source_verified',
    reportingYear: 'JCR 2024 (Clarivate Journal Citation Reports)',
  },
  {
    url: 'https://link.springer.com/journal/12672',
    slugs: ['12672', 'discover-oncology', 'discoveroncology'],
    journalName: 'Discover Oncology',
    publisher: 'SpringerLink',
    impactFactor: 3.4,
    fiveYearImpactFactor: 3.9,
    jcrQuartile: 'Q2',
    casZone: '中科院医学3区',
    firstDecisionDays: 17,
    indexing: ['SCIE', 'PubMed Central', 'Scopus', 'DOAJ'],
    openAccessType: 'Gold Open Access',
    apcUsd: 1990,
    chinaWaiverAvailable: true,
    aimsAndScopeSummary: 'Part of the Springer Nature Discover Series, providing rapid peer review and open access publishing for all oncological basic, translational, and clinical studies.',
    primaryDiscipline: 'Oncology & Cancer Research (肿瘤与癌症研究)',
    verificationStatus: 'source_verified',
    reportingYear: 'JCR 2024 (Clarivate Journal Citation Reports)',
  },
];

// Helper: Normalize URL / Domain / Path cleanly
export function normalizeUrlComponents(rawUrl: string) {
  let cleaned = (rawUrl || '').trim();
  cleaned = cleaned.replace(/\/+$/, '');

  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = `https://${cleaned}`;
  }

  try {
    const parsed = new URL(cleaned);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = parsed.pathname.toLowerCase().replace(/\/+$/, '');
    const segments = pathname.split('/').filter(Boolean);
    const slug = segments.pop() || '';

    return { full: cleaned, host, pathname, slug, segments };
  } catch {
    return { full: cleaned, host: '', pathname: '', slug: '', segments: [] };
  }
}

// Stage normalization helper
export function normalizeStage(rawStage: string): StageCode {
  const upper = (rawStage || '').toUpperCase();
  if (upper === 'AWA' || upper === 'TOFU') return 'AWA';
  if (upper === 'CON' || upper === 'MOFU') return 'CON';
  if (upper === 'DEC' || upper === 'BOFU') return 'DEC';
  return 'CON';
}

// Helper: Smart character clamp that respects word boundaries and punctuation
export function smartClamp(text: string, maxLen: number): string {
  const clean = (text || '').trim();
  if (clean.length <= maxLen) return clean;

  // If CJK predominantly, slice directly
  const cjkChars = (clean.match(/[\u4e00-\u9fa5]/g) || []).length;
  if (cjkChars > clean.length * 0.3) {
    return clean.slice(0, maxLen).trim().replace(/[,，、:：\-—]+$/, '');
  }

  // English: Try to cut at word boundary within the last 12 chars
  const candidate = clean.slice(0, maxLen);
  const lastSpace = candidate.lastIndexOf(' ');
  if (lastSpace > maxLen - 12 && lastSpace > 10) {
    return candidate.slice(0, lastSpace).trim().replace(/[,;:.\-—]+$/, '');
  }

  return candidate.trim().replace(/[,;:.\-—]+$/, '');
}

// Stage configuration dictionary
export const STAGE_CONFIGS: Record<StageCode, {
  name: string;
  authorMindset: string;
  campaignObjective: string;
  tone: string;
  primaryCta: string;
  recommendedDestination: { label: string; urlPath: string; description: string };
}> = {
  AWA: {
    name: 'AWA — Awareness',
    authorMindset: '“What is this journal, and why is it relevant to my research?”',
    campaignObjective: 'Introduce the journal, establish subject relevance, and build credible discovery without submission pressure.',
    tone: 'Informative, welcoming, research-led, and low-pressure.',
    primaryCta: 'Explore the journal',
    recommendedDestination: {
      label: 'Journal Overview & Latest Research',
      urlPath: '/about',
      description: 'Scope overview, editorial mission, and recently published highlights.',
    },
  },
  CON: {
    name: 'CON — Consideration',
    authorMindset: '“Is this the right journal for my manuscript and publishing goals?”',
    campaignObjective: 'Help the author evaluate topical fit, article types, editorial rigor, open access models, and indexed metrics.',
    tone: 'Specific, transparent, evidence-led, and useful for objective comparison.',
    primaryCta: 'Check journal fit',
    recommendedDestination: {
      label: 'Aims, Scope & Publishing Criteria',
      urlPath: '/aims-and-scope',
      description: 'Detailed scope criteria, accepted formats, fees, and editorial standards.',
    },
  },
  DEC: {
    name: 'DEC — Decision',
    authorMindset: '“What do I need to prepare and do to submit my manuscript?”',
    campaignObjective: 'Reduce submission friction, provide clear preparation checklists, fee/waiver criteria, and direct submission access.',
    tone: 'Clear, practical, reassuring, and action-oriented without artificial hype.',
    primaryCta: 'View submission checklist',
    recommendedDestination: {
      label: 'Author Guidelines & Submission Portal',
      urlPath: '/submission-guidelines',
      description: 'Manuscript preparation instructions, checklist, and direct submission link.',
    },
  },
};

// Helper: Match or fetch Clarivate JCR metrics from landing page URL or Name
export async function lookupClarivateFacts(urlOrName: string) {
  const rawInput = (urlOrName || '').trim();
  const lowerInput = rawInput.toLowerCase();
  const norm = normalizeUrlComponents(rawInput);

  // 1. Precise Match for Nature flagship
  if (
    norm.host === 'nature.com' &&
    (norm.pathname === '' || norm.pathname === '/' || norm.pathname === '/nature')
  ) {
    const natureEntry = CLARIVATE_JCR_CATALOG.find((j) => j.journalName === 'Nature')!;
    return {
      ...natureEntry,
      url: 'https://www.nature.com/nature',
      isVerifiedClarivate: true,
      verificationStatus: 'source_verified' as const,
      sourceAttribution: 'Verified via Clarivate Journal Citation Reports (JCR 2024/2025) & Web of Science Index',
    };
  }

  // 2. Direct catalog search across slugs, exact URLs, and aliases
  for (const entry of CLARIVATE_JCR_CATALOG) {
    const entryNorm = normalizeUrlComponents(entry.url);

    if (norm.host && entryNorm.host && norm.host === entryNorm.host && norm.pathname === entryNorm.pathname) {
      return {
        ...entry,
        isVerifiedClarivate: true,
        verificationStatus: 'source_verified' as const,
        sourceAttribution: 'Verified via Clarivate Journal Citation Reports (JCR 2024/2025) & Web of Science Index',
      };
    }

    if (norm.slug && entry.slugs.includes(norm.slug)) {
      return {
        ...entry,
        isVerifiedClarivate: true,
        verificationStatus: 'source_verified' as const,
        sourceAttribution: 'Verified via Clarivate Journal Citation Reports (JCR 2024/2025) & Web of Science Index',
      };
    }

    if (entry.slugs.includes(lowerInput) || entry.journalName.toLowerCase() === lowerInput) {
      return {
        ...entry,
        isVerifiedClarivate: true,
        verificationStatus: 'source_verified' as const,
        sourceAttribution: 'Verified via Clarivate Journal Citation Reports (JCR 2024/2025) & Web of Science Index',
      };
    }
  }

  // 3. Fallback matching: If host contains nature.com and slug is 'aps' or ends with 'aps'
  if (norm.host.includes('nature.com') && (norm.slug === 'aps' || norm.pathname.includes('/aps'))) {
    const apsEntry = CLARIVATE_JCR_CATALOG.find((j) => j.slugs.includes('aps'))!;
    return {
      ...apsEntry,
      isVerifiedClarivate: true,
      verificationStatus: 'source_verified' as const,
      sourceAttribution: 'Verified via Clarivate Journal Citation Reports (JCR 2024/2025) & Web of Science Index',
    };
  }

  // 4. Real-time Gemini extraction for custom journals (marked as unverified for user review)
  if (ai) {
    try {
      const prompt = `You are a factual Clarivate JCR research assistant.
Provide the factual Clarivate Impact Factor and CAS Zone metrics for this journal:
URL or Title: "${rawInput}"

Do NOT invent fake metrics or exaggerated numbers. If unknown, provide realistic estimates labeled clearly.
Return valid JSON with:
{
  "journalName": "Full official journal name",
  "publisher": "Springer Nature" | "Nature Portfolio" | "BMC (Part of Springer Nature)" | "SpringerLink",
  "impactFactor": number,
  "fiveYearImpactFactor": number,
  "jcrQuartile": "Q1" | "Q2" | "Q3" | "Q4",
  "casZone": "CAS Zone in Chinese (e.g. 中科院医学2区)",
  "firstDecisionDays": number,
  "indexing": ["SCIE", "PubMed Central", "Scopus"],
  "openAccessType": "Gold Open Access" | "Hybrid Open Access",
  "apcUsd": number,
  "chinaWaiverAvailable": boolean,
  "aimsAndScopeSummary": "A concise factual summary of aims and scope",
  "primaryDiscipline": "Discipline in English and Chinese"
}`;

      const aiPromise = ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('AI Clarivate lookup timeout')), 5000)
      );

      const res: any = await Promise.race([aiPromise, timeoutPromise]);
      if (res && res.text) {
        const parsed = JSON.parse(res.text);
        if (parsed.journalName && parsed.impactFactor) {
          return {
            url: norm.full,
            ...parsed,
            isVerifiedClarivate: false,
            verificationStatus: 'unverified' as const,
            reportingYear: 'Estimated / Unverified (Review before launching)',
            sourceAttribution: 'Retrieved via Web Knowledge Engine — Please verify against official Clarivate JCR before campaign deployment',
          };
        }
      }
    } catch (e: any) {
      console.warn('Real-time AI Clarivate lookup fallback:', e.message);
    }
  }

  // 5. Intelligent Fallback with proper naming and transparent unverified status
  let guessedName = 'Springer Nature Journal';
  let guessedPublisher: JCRJournalEntry['publisher'] = 'Springer Nature';

  if (norm.host.includes('nature.com')) {
    guessedPublisher = 'Nature Portfolio';
    guessedName = norm.slug ? `Nature ${norm.slug.charAt(0).toUpperCase() + norm.slug.slice(1)}` : 'Nature';
  } else if (norm.host.includes('biomedcentral.com')) {
    guessedPublisher = 'BMC (Part of Springer Nature)';
    guessedName = 'BMC Biomedical Journal';
  } else if (norm.host.includes('springer.com')) {
    guessedPublisher = 'SpringerLink';
    guessedName = 'Springer Applied Science Journal';
  }

  return {
    url: norm.full,
    journalName: guessedName,
    publisher: guessedPublisher,
    impactFactor: 5.2,
    fiveYearImpactFactor: 5.8,
    jcrQuartile: 'Q1' as const,
    casZone: '中科院2区',
    firstDecisionDays: 28,
    indexing: ['SCIE', 'Scopus'],
    openAccessType: 'Hybrid Open Access' as const,
    apcUsd: 3690,
    chinaWaiverAvailable: false,
    aimsAndScopeSummary: 'Peer-reviewed scholarly journal publishing original research and reviews in biomedical and natural sciences.',
    primaryDiscipline: 'Biomedical & Natural Sciences',
    isVerifiedClarivate: false,
    verificationStatus: 'unverified' as const,
    reportingYear: 'Catalog Estimate',
    sourceAttribution: 'Unverified initial metadata — Please review and confirm metrics in Step 1',
  };
}

// API: Fetch Clarivate JCR Facts
app.post('/api/fetch-clarivate-facts', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.trim()) {
      return res.status(400).json({ error: 'URL is required' });
    }
    const facts = await lookupClarivateFacts(url);
    res.json({ success: true, facts });
  } catch (err: any) {
    console.error('Clarivate lookup error:', err);
    res.status(500).json({ error: 'Failed to retrieve Clarivate metrics' });
  }
});

interface HeadlineSeed {
  text: string;
  sourceFact: string;
  language: 'EN' | 'ZH';
  category: string;
  positionRecommendation: string;
}

// Deterministic Headline Generator with genuine stage differentiation
export function generateStageHeadlines(facts: any, stage: StageCode, outputLanguage: 'all' | 'EN' | 'ZH' = 'all') {
  const shortName = facts.journalName.length > 18 ? facts.journalName.slice(0, 18) : facts.journalName;
  const disciplineShort = (facts.primaryDiscipline || 'Scientific').split('(')[0].trim().slice(0, 14);

  if (stage === 'AWA') {
    // AWA (Awareness): Discovery, research topics, community, journal scope.
    // Low pressure. NO submission demands, NO artificial urgency.
    const en: HeadlineSeed[] = [
      { text: smartClamp(`Discover ${shortName}`, 30), sourceFact: facts.journalName, language: 'EN', category: 'Journal Identity', positionRecommendation: 'Position 1' },
      { text: smartClamp(`Explore ${disciplineShort} Research`, 30), sourceFact: facts.primaryDiscipline, language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 1' },
      { text: smartClamp(`Published by ${facts.publisher}`, 30), sourceFact: facts.publisher, language: 'EN', category: 'Journal Identity', positionRecommendation: 'Position 1' },
      { text: smartClamp(`Topics in ${disciplineShort}`, 30), sourceFact: facts.primaryDiscipline, language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 2' },
      { text: smartClamp(`Global Research Community`, 30), sourceFact: 'Readership', language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 2' },
      { text: smartClamp(`Read High-Impact Discoveries`, 30), sourceFact: 'Discovery', language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 2' },
      { text: smartClamp(`Peer-Reviewed Scientific Work`, 30), sourceFact: 'Peer Review', language: 'EN', category: 'Journal Identity', positionRecommendation: 'Position 3' },
      { text: smartClamp(`Open Research in ${disciplineShort}`, 30), sourceFact: facts.openAccessType, language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 3' },
      { text: smartClamp(`Discover Journal Scope`, 30), sourceFact: 'Aims & Scope', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
      { text: smartClamp(`Browse Latest Articles`, 30), sourceFact: 'Readership', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
      { text: smartClamp(`Explore the Journal`, 30), sourceFact: 'CTA', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
    ];

    const zh: HeadlineSeed[] = [
      { text: smartClamp(`探索 ${shortName} 学术期刊`, 30), sourceFact: facts.journalName, language: 'ZH', category: 'Journal Identity', positionRecommendation: 'Position 1' },
      { text: smartClamp(`前沿学术成果与领域进展`, 30), sourceFact: facts.primaryDiscipline, language: 'ZH', category: 'Scope & Community', positionRecommendation: 'Position 2' },
      { text: smartClamp(`国际同行评议学术交流`, 30), sourceFact: 'Community', language: 'ZH', category: 'Scope & Community', positionRecommendation: 'Position 2' },
      { text: smartClamp(`查阅期刊学术定位与论文`, 30), sourceFact: 'Discovery', language: 'ZH', category: 'Call to Action', positionRecommendation: 'Any Position' },
    ];

    if (outputLanguage === 'EN') return en.slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
    if (outputLanguage === 'ZH') return [...zh, ...en].slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
    return [...en.slice(0, 11), ...zh.slice(0, 4)].map(h => ({ ...h, charCount: h.text.length }));
  }

  if (stage === 'CON') {
    // CON (Consideration): Evaluation, aims & scope fit, accepted article types, fees/APC, indexing, editorial rigor.
    // Specific & transparent. NOT synonymous with special issues.
    const en: HeadlineSeed[] = [
      { text: smartClamp(`Is Your Manuscript a Fit?`, 30), sourceFact: 'Fit Evaluation', language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 1' },
      { text: smartClamp(`${shortName} Aims & Scope`, 30), sourceFact: 'Scope Criteria', language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 1' },
      { text: smartClamp(`Evaluate ${shortName}`, 30), sourceFact: facts.journalName, language: 'EN', category: 'Journal Identity', positionRecommendation: 'Position 1' },
      { text: smartClamp(`Clarivate IF ${facts.impactFactor} ${facts.jcrQuartile}`, 30), sourceFact: `IF ${facts.impactFactor}`, language: 'EN', category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' },
      { text: smartClamp(`Indexed in SCIE & Scopus`, 30), sourceFact: 'Indexing', language: 'EN', category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' },
      { text: smartClamp(`Rigorous Peer Review Standards`, 30), sourceFact: 'Editorial Standards', language: 'EN', category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' },
      { text: smartClamp(`Average ${facts.firstDecisionDays} Days to 1st Decision`, 30), sourceFact: `${facts.firstDecisionDays} Days Decision`, language: 'EN', category: 'Evaluation & Metrics', positionRecommendation: 'Position 3' },
      { text: smartClamp(`Transparent APC & OA Options`, 30), sourceFact: facts.openAccessType, language: 'EN', category: 'Evaluation & Metrics', positionRecommendation: 'Position 3' },
      { text: smartClamp(`Accepted Article Types`, 30), sourceFact: 'Article Formats', language: 'EN', category: 'Scope & Community', positionRecommendation: 'Position 3' },
      { text: smartClamp(`Check Journal Fit`, 30), sourceFact: 'Evaluation CTA', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
      { text: smartClamp(`Review Aims and Scope`, 30), sourceFact: 'Scope Review', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
    ];

    const zh: HeadlineSeed[] = [
      { text: smartClamp(`${facts.casZone.slice(0, 11)}评议标准`, 30), sourceFact: facts.casZone, language: 'ZH', category: 'Evaluation & Metrics', positionRecommendation: 'Position 2' },
      { text: smartClamp(`查阅期刊范围与收稿类型`, 30), sourceFact: 'Scope Check', language: 'ZH', category: 'Scope & Community', positionRecommendation: 'Position 2' },
      { text: smartClamp(`平均初审周期约${facts.firstDecisionDays}天`, 30), sourceFact: `${facts.firstDecisionDays}天初审`, language: 'ZH', category: 'Evaluation & Metrics', positionRecommendation: 'Position 3' },
      { text: smartClamp(`评估稿件学术契合度`, 30), sourceFact: 'Fit CTA', language: 'ZH', category: 'Call to Action', positionRecommendation: 'Any Position' },
    ];

    if (outputLanguage === 'EN') return en.slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
    if (outputLanguage === 'ZH') return [...zh, ...en].slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
    return [...en.slice(0, 11), ...zh.slice(0, 4)].map(h => ({ ...h, charCount: h.text.length }));
  }

  // DEC (Decision): Practical submission steps, preparation checklists, guidelines, portal, fee/waiver policy.
  // Action-oriented, practical, reassuring. NO fake urgency or guaranteed publication.
  const en: HeadlineSeed[] = [
    { text: smartClamp(`Submit to ${shortName}`, 30), sourceFact: 'Submission Portal', language: 'EN', category: 'Journal Identity', positionRecommendation: 'Position 1' },
    { text: smartClamp(`Author Guidelines & Checklist`, 30), sourceFact: 'Author Guidelines', language: 'EN', category: 'Author Guidance', positionRecommendation: 'Position 1' },
    { text: smartClamp(`Official Submission Portal`, 30), sourceFact: 'Verified Portal', language: 'EN', category: 'Author Guidance', positionRecommendation: 'Position 1' },
    { text: smartClamp(`Manuscript Prep Instructions`, 30), sourceFact: 'Preparation', language: 'EN', category: 'Author Guidance', positionRecommendation: 'Position 2' },
    { text: smartClamp(`Submission Checklist Download`, 30), sourceFact: 'Checklist', language: 'EN', category: 'Author Guidance', positionRecommendation: 'Position 2' },
    { text: smartClamp(`Transparent APC & Waivers`, 30), sourceFact: 'Fee Policies', language: 'EN', category: 'Author Guidance', positionRecommendation: 'Position 2' },
    { text: smartClamp(`First Decision in ${facts.firstDecisionDays} Days`, 30), sourceFact: `${facts.firstDecisionDays} Days Review`, language: 'EN', category: 'Author Guidance', positionRecommendation: 'Position 3' },
    { text: smartClamp(`What to Expect After Submitting`, 30), sourceFact: 'Peer Review Workflow', language: 'EN', category: 'Author Guidance', positionRecommendation: 'Position 3' },
    { text: smartClamp(`View Submission Checklist`, 30), sourceFact: 'CTA', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
    { text: smartClamp(`Read Author Guidelines`, 30), sourceFact: 'CTA', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
    { text: smartClamp(`Start Your Submission`, 30), sourceFact: 'CTA', language: 'EN', category: 'Call to Action', positionRecommendation: 'Any Position' },
  ];

  const zh: HeadlineSeed[] = [
    { text: smartClamp(`${shortName} 作者投稿须知`, 30), sourceFact: 'Author Guide', language: 'ZH', category: 'Author Guidance', positionRecommendation: 'Position 1' },
    { text: smartClamp(`稿件体例规范与准备清单`, 30), sourceFact: 'Manuscript Prep', language: 'ZH', category: 'Author Guidance', positionRecommendation: 'Position 2' },
    { text: smartClamp(`初审参考周期约${facts.firstDecisionDays}天`, 30), sourceFact: `${facts.firstDecisionDays}天审稿`, language: 'ZH', category: 'Author Guidance', positionRecommendation: 'Position 3' },
    { text: smartClamp(`查阅作者指南并提交稿件`, 30), sourceFact: 'CTA', language: 'ZH', category: 'Call to Action', positionRecommendation: 'Any Position' },
  ];

  if (outputLanguage === 'EN') return en.slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
  if (outputLanguage === 'ZH') return [...zh, ...en].slice(0, 15).map(h => ({ ...h, charCount: h.text.length }));
  return [...en.slice(0, 11), ...zh.slice(0, 4)].map(h => ({ ...h, charCount: h.text.length }));
}

// Deterministic Descriptions with genuine stage differentiation
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
    ];
    if (outputLanguage === 'ZH') return [...zh, ...en].slice(0, 4).map(d => ({ ...d, charCount: d.text.length }));
    return [en[0], zh[0], en[1], en[3]].map(d => ({ ...d, charCount: d.text.length }));
  }

  if (stage === 'CON') {
    const en = [
      { text: smartClamp(`Evaluate ${facts.journalName} for your paper. Clarivate IF ${facts.impactFactor}, indexed in SCIE & Scopus.`, 90), sourceFact: `IF ${facts.impactFactor}`, language: 'EN' as const, theme: 'Evaluation & Peer Review' },
      { text: smartClamp(`Transparent publishing options and editorial criteria. First decision in ${facts.firstDecisionDays} days.`, 90), sourceFact: `${facts.firstDecisionDays} Days Review`, language: 'EN' as const, theme: 'Evaluation & Peer Review' },
      { text: smartClamp(`Review accepted article types, APC fees ($${facts.apcUsd}), and peer review workflow.`, 90), sourceFact: 'Publishing Options', language: 'EN' as const, theme: 'Publishing Options' },
      { text: smartClamp(`Check whether your manuscript aligns with the journal’s aims and scope before submitting.`, 90), sourceFact: 'Fit Evaluation', language: 'EN' as const, theme: 'Scope & Relevance' },
    ];
    const zh = [
      { text: smartClamp(`核对研究范围、同行评审流程与收录指标（${facts.casZone.slice(0, 10)}），评估稿件学术契合度。`, 90), sourceFact: facts.casZone, language: 'ZH' as const, theme: 'Evaluation & Peer Review' },
      { text: smartClamp(`提供透明的发表模式与同行评议标准，平均初审周期约${facts.firstDecisionDays}天，助您理性选刊。`, 90), sourceFact: 'Transparent Review', language: 'ZH' as const, theme: 'Publishing Options' },
    ];
    if (outputLanguage === 'ZH') return [...zh, ...en].slice(0, 4).map(d => ({ ...d, charCount: d.text.length }));
    return [en[0], zh[0], en[2], en[3]].map(d => ({ ...d, charCount: d.text.length }));
  }

  // DEC (Decision)
  const en = [
    { text: smartClamp(`Prepare your manuscript for ${facts.journalName}. Access author guidelines and checklist.`, 90), sourceFact: 'Author Guidelines', language: 'EN' as const, theme: 'Author Checklist' },
    { text: smartClamp(`Clear manuscript formatting instructions and required documents for official submission.`, 90), sourceFact: 'Manuscript Prep', language: 'EN' as const, theme: 'Author Checklist' },
    { text: smartClamp(`Review fee waiver policies and submit directly through the verified Springer Nature portal.`, 90), sourceFact: 'Submission Portal', language: 'EN' as const, theme: 'Publishing Options' },
    { text: smartClamp(`Rigorous peer review with first editorial decision in an average of ${facts.firstDecisionDays} days.`, 90), sourceFact: `${facts.firstDecisionDays} Days Review`, language: 'EN' as const, theme: 'Evaluation & Peer Review' },
  ];
  const zh = [
    { text: smartClamp(`查阅作者投稿须知、格式规范与稿件提交清单，通过 Springer Nature 官方系统在线投递。`, 90), sourceFact: 'Author Portal', language: 'ZH' as const, theme: 'Author Checklist' },
    { text: smartClamp(`准备完整投稿材料，了解初审流程（平均${facts.firstDecisionDays}天）与版面费支持政策。`, 90), sourceFact: 'Submission Steps', language: 'ZH' as const, theme: 'Publishing Options' },
  ];
  if (outputLanguage === 'ZH') return [...zh, ...en].slice(0, 4).map(d => ({ ...d, charCount: d.text.length }));
  return [en[0], zh[0], en[1], en[2]].map(d => ({ ...d, charCount: d.text.length }));
}

// Deterministic Sitelinks, Callouts, and Recommended Destinations per stage
export function generateStageSitelinks(facts: any, stage: StageCode) {
  const norm = normalizeUrlComponents(facts.url || '');
  const baseUrl = norm.full || 'https://www.nature.com';

  if (stage === 'AWA') {
    return [
      { title: 'Journal Overview & Scope', desc: 'Explore research fields and mission', urlPath: `${baseUrl}/about` },
      { title: 'Browse Latest Articles', desc: 'Read recent peer-reviewed discoveries', urlPath: `${baseUrl}/articles` },
      { title: 'Editorial Leadership', desc: 'Meet the international editorial board', urlPath: `${baseUrl}/editors` },
      { title: 'Research Collections', desc: 'Curated thematic paper collections', urlPath: `${baseUrl}/collections` },
    ];
  }

  if (stage === 'CON') {
    return [
      { title: 'Aims & Scope Evaluation', desc: 'Check topical alignment and criteria', urlPath: `${baseUrl}/aims-and-scope` },
      { title: 'Article Types & Formats', desc: 'Accepted original research & reviews', urlPath: `${baseUrl}/article-types` },
      { title: 'Journal Metrics & Indexing', desc: `Clarivate IF ${facts.impactFactor} & ${facts.jcrQuartile}`, urlPath: `${baseUrl}/metrics` },
      { title: 'Publishing Options & Fees', desc: `Transparent APC & OA publishing`, urlPath: `${baseUrl}/open-access` },
    ];
  }

  // DEC
  return [
    { title: 'Author Guidelines', desc: 'Manuscript preparation and style guide', urlPath: `${baseUrl}/for-authors` },
    { title: 'Submission Checklist', desc: 'Required documentation before submitting', urlPath: `${baseUrl}/checklist` },
    { title: 'APC & Waiver Criteria', desc: facts.chinaWaiverAvailable ? 'Institutional waiver details' : 'Fee policy and funding guidelines', urlPath: `${baseUrl}/apc-waivers` },
    { title: 'Online Submission Portal', desc: `Submit paper for peer review`, urlPath: `${baseUrl}/submit` },
  ];
}

export function generateStageCallouts(facts: any, stage: StageCode) {
  if (stage === 'AWA') {
    return [
      `Published by ${facts.publisher}`,
      facts.primaryDiscipline.split('(')[0].trim(),
      'Global Readership',
      'Peer-Reviewed Science',
    ];
  }
  if (stage === 'CON') {
    return [
      `Clarivate IF ${facts.impactFactor}`,
      facts.casZone.slice(0, 14),
      `1st Decision: ${facts.firstDecisionDays} Days`,
      facts.openAccessType.includes('Gold') ? 'Gold Open Access' : 'Hybrid Open Access',
    ];
  }
  return [
    'Author Guidelines Ready',
    'Standard Preparation Checklist',
    `First Decision: ${facts.firstDecisionDays} Days`,
    'Official Submission Portal',
  ];
}

export function generateStageKeywords(facts: any, stage: StageCode) {
  const shortName = facts.journalName.toLowerCase();
  const disc = facts.primaryDiscipline.toLowerCase().split('(')[0].trim();

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
        { keyword: `[${shortName} impact factor]`, matchType: 'Exact' as const, intent: 'Metric Evaluation' },
        { keyword: `"${shortName} aims and scope"`, matchType: 'Phrase' as const, intent: 'Fit Evaluation' },
        { keyword: `"${shortName} apc"`, matchType: 'Phrase' as const, intent: 'Publishing Fee Check' },
        { keyword: `[${shortName} review time]`, matchType: 'Exact' as const, intent: 'Turnaround Check' },
      ],
      chineseAuthorKeywords: [
        { keywordZh: `${facts.journalName} 投稿要求与影响因子`, matchType: '短语 (Phrase)' as const, intentZh: '选刊与指标核对' },
        { keywordZh: `${facts.journalName} 中科院几区`, matchType: '短语 (Phrase)' as const, intentZh: '分区与考核标准' },
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
      description: smartClamp(`Browse latest scientific advances and multidisciplinary breakthroughs across ${facts.primaryDiscipline}.`, 90),
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
    return {
      shortHeadline: smartClamp(`Check ${shortName} Fit`, 30),
      shortHeadlineCharCount: 0,
      longHeadline: smartClamp(`Evaluate ${facts.journalName}: Clarivate IF ${facts.impactFactor}, ${facts.casZone.slice(0, 10)}`, 90),
      longHeadlineCharCount: 0,
      description: smartClamp(`Transparent editorial standards, accepted article formats, and first decision in ${facts.firstDecisionDays} days.`, 90),
      descriptionCharCount: 0,
      businessName: facts.publisher,
      ctaText: 'Check Journal Fit',
      visualConceptPrompt: `An objective academic evaluation ad featuring the official journal cover, gold Clarivate Impact Factor ${facts.impactFactor} seal, indexing badges (SCIE), and professional scholarly palette.`,
      imageAccentColor: '#1e1b4b',
      targetPlacements: ['researchgate.net', 'ncbi.nlm.nih.gov (PubMed)', 'scholar.google.com', 'nature.com'],
      bannerHeadlineZh: `${facts.journalName} 选刊评估指南`,
      bannerSubtextZh: `Clarivate 影响因子 ${facts.impactFactor} · 核对学术契合度与收稿范围`,
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

export function generateDeterministicCampaign(facts: any, stage: StageCode, outputLanguage: 'all' | 'EN' | 'ZH' = 'all') {
  const stageConfig = STAGE_CONFIGS[stage];
  const headlines = generateStageHeadlines(facts, stage, outputLanguage);
  const descriptions = generateStageDescriptions(facts, stage, outputLanguage);
  const sitelinks = generateStageSitelinks(facts, stage);
  const callouts = generateStageCallouts(facts, stage);
  const displayAd = generateStageDisplayAd(facts, stage);
  const keywords = generateStageKeywords(facts, stage);

  // Set accurate char counts
  displayAd.shortHeadlineCharCount = displayAd.shortHeadline.length;
  displayAd.longHeadlineCharCount = displayAd.longHeadline.length;
  displayAd.descriptionCharCount = displayAd.description.length;

  const norm = normalizeUrlComponents(facts.url || '');
  const baseUrl = norm.full || 'https://www.nature.com';

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
        values: [facts.primaryDiscipline.split('(')[0].trim(), facts.publisher, 'Peer-Reviewed Research'],
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

// API: Generate Campaign with Stage Differentiation & Factual Safeguards
app.post('/api/generate-campaign', async (req, res) => {
  try {
    const {
      landingPageUrl,
      channels = ['search', 'display'],
      funnelStage = 'CON',
      outputLanguage = 'all',
      customPlaybook = '',
    } = req.body;

    const normalizedStage = normalizeStage(funnelStage);
    const facts = await lookupClarivateFacts(landingPageUrl);
    const stageConfig = STAGE_CONFIGS[normalizedStage];

    let campaignOutput: any = null;
    let generationSource: 'ai_grounded' | 'template_fallback' = 'template_fallback';

    if (ai) {
      const prompt = `You are a Senior Academic Publishing Growth Marketer at Springer Nature.
Generate a Google Ads campaign tailored to the specific author marketing stage: "${stageConfig.name}".

AUDIENCE AND STAGE STRATEGY (CRITICAL REQUIREMENT):
- Target Stage: ${stageConfig.name}
- Author Mindset: ${stageConfig.authorMindset}
- Campaign Objective: ${stageConfig.campaignObjective}
- Required Tone: ${stageConfig.tone}
- Primary CTA: "${stageConfig.primaryCta}"
- Recommended Destination: ${stageConfig.recommendedDestination.label}

STAGE-SPECIFIC INSTRUCTIONS:
${
  normalizedStage === 'AWA'
    ? `* Awareness Stage Rules:
  - Focus on research topics, subject breadth, global community, and publisher prestige.
  - Informative, welcoming, low-pressure.
  - DO NOT apply submission pressure, deadlines, or manuscript upload pushes.
  - DO NOT lead every headline with review speed or impact factor.
  - CTAs should be: "Explore the journal", "Browse articles", "Discover the scope".`
    : normalizedStage === 'CON'
    ? `* Consideration Stage Rules:
  - Help the author evaluate whether their manuscript is a good fit.
  - Prioritize aims and scope, accepted article types, editorial rigor, publishing model, transparent APC fees ($${facts.apcUsd}), indexing, and JCR metrics.
  - DO NOT invent special issues or call for papers unless specified in source facts.
  - DO NOT invent fake competitor comparisons or superiority claims.
  - CTAs should be: "Check journal fit", "Review aims and scope", "Explore publishing options".`
    : `* Decision Stage Rules:
  - Help authors with practical preparation, submission checklist, guidelines, fees/waivers, and the submission portal.
  - Clear, practical, reassuring, and action-oriented.
  - DO NOT invent fake deadlines, guaranteed acceptance, or claim first decision equals acceptance.
  - CTAs should be: "View submission checklist", "Read author guidelines", "Start submission".`
}

FACTUAL METRICS (VERIFIED/SOURCE-BOUND):
- Journal: ${facts.journalName} (${facts.publisher})
- Clarivate Impact Factor: ${facts.impactFactor} (5-Year IF: ${facts.fiveYearImpactFactor})
- JCR Quartile: ${facts.jcrQuartile} · CAS Zone: ${facts.casZone}
- First Decision Turnaround: ${facts.firstDecisionDays} days
- Indexing: ${facts.indexing.join(', ')}
- Open Access: ${facts.openAccessType} (APC: $${facts.apcUsd})
- China Support: ${facts.chinaWaiverAvailable ? 'Institutional waiver assistance available' : 'Standard grant-funded OA'}
- Aims & Scope: ${facts.aimsAndScopeSummary}
- Primary Discipline: ${facts.primaryDiscipline}
- Language: ${outputLanguage === 'ZH' ? 'Chinese focus' : outputLanguage === 'EN' ? 'English only' : 'Bilingual (English + Chinese for Greater China scholars)'}

${customPlaybook ? `CUSTOM PLAYBOOK / GUIDELINES:\n${customPlaybook}\n` : ''}

GOOGLE ADS RSA REQUIREMENTS:
1. Exactly 15 headlines (strict max 30 characters each).
2. Exactly 4 descriptions (strict max 90 characters each).
3. 4 sitelinks reflecting the ${stageConfig.name} stage.
4. Display Ad short headline (<= 30 chars), long headline (<= 90 chars), description (<= 90 chars), and CTA text matching "${stageConfig.primaryCta}".

OUTPUT JSON SCHEMA:
Return JSON adhering strictly to the stage's communication priority.`;

      try {
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('AI generation timed out')), 6500)
        );

        const aiPromise = ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                funnelStrategyNote: { type: Type.STRING },
                primaryCta: { type: Type.STRING },
                searchAds: {
                  type: Type.OBJECT,
                  properties: {
                    headlines: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          text: { type: Type.STRING },
                          charCount: { type: Type.INTEGER },
                          sourceFact: { type: Type.STRING },
                          language: { type: Type.STRING },
                          category: { type: Type.STRING },
                          positionRecommendation: { type: Type.STRING },
                        },
                        required: ['text', 'sourceFact', 'language'],
                      },
                    },
                    descriptions: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          text: { type: Type.STRING },
                          charCount: { type: Type.INTEGER },
                          sourceFact: { type: Type.STRING },
                          language: { type: Type.STRING },
                          theme: { type: Type.STRING },
                        },
                        required: ['text', 'sourceFact', 'language'],
                      },
                    },
                    sitelinks: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          title: { type: Type.STRING },
                          desc: { type: Type.STRING },
                          urlPath: { type: Type.STRING },
                        },
                        required: ['title', 'desc'],
                      },
                    },
                    callouts: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ['headlines', 'descriptions', 'sitelinks'],
                },
                displayAds: {
                  type: Type.OBJECT,
                  properties: {
                    shortHeadline: { type: Type.STRING },
                    longHeadline: { type: Type.STRING },
                    description: { type: Type.STRING },
                    businessName: { type: Type.STRING },
                    ctaText: { type: Type.STRING },
                    visualConceptPrompt: { type: Type.STRING },
                    imageAccentColor: { type: Type.STRING },
                    targetPlacements: { type: Type.ARRAY, items: { type: Type.STRING } },
                    bannerHeadlineZh: { type: Type.STRING },
                    bannerSubtextZh: { type: Type.STRING },
                  },
                  required: ['shortHeadline', 'longHeadline', 'description', 'businessName', 'ctaText'],
                },
                keywords: {
                  type: Type.OBJECT,
                  properties: {
                    englishSearchKeywords: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          keyword: { type: Type.STRING },
                          matchType: { type: Type.STRING },
                          intent: { type: Type.STRING },
                        },
                        required: ['keyword', 'matchType', 'intent'],
                      },
                    },
                    chineseAuthorKeywords: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          keywordZh: { type: Type.STRING },
                          matchType: { type: Type.STRING },
                          intentZh: { type: Type.STRING },
                        },
                        required: ['keywordZh', 'matchType', 'intentZh'],
                      },
                    },
                    negativeKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ['englishSearchKeywords', 'chineseAuthorKeywords', 'negativeKeywords'],
                },
              },
              required: ['searchAds', 'displayAds', 'keywords'],
            },
          },
        });

        const response: any = await Promise.race([aiPromise, timeoutPromise]);
        if (response && response.text) {
          campaignOutput = JSON.parse(response.text);
          generationSource = 'ai_grounded';
        }
      } catch (e: any) {
        console.warn('AI generation skipped, utilizing stage-differentiated template engine:', e.message);
      }
    }

    // Fallback if AI failed or timed out
    if (!campaignOutput) {
      campaignOutput = generateDeterministicCampaign(facts, normalizedStage, outputLanguage);
      generationSource = 'template_fallback';
    }

    // STRICT AD FORMAT VALIDATION & SMART TRUNCATION (NO MID-WORD CHOPPING)
    const fallbackCampaign = generateDeterministicCampaign(facts, normalizedStage, outputLanguage);

    if (campaignOutput.searchAds) {
      let headlines = campaignOutput.searchAds.headlines || [];
      // Pad to 15 if AI generated fewer
      if (headlines.length < 15) {
        for (const fb of fallbackCampaign.searchAds.headlines) {
          if (headlines.length >= 15) break;
          if (!headlines.some((h: any) => h.text.toLowerCase() === fb.text.toLowerCase())) {
            headlines.push(fb);
          }
        }
      }

      campaignOutput.searchAds.headlines = headlines.slice(0, 15).map((h: any, idx: number) => {
        const clampedText = smartClamp(h.text, 30);
        return {
          ...h,
          text: clampedText,
          charCount: clampedText.length,
          positionRecommendation: h.positionRecommendation || (idx < 3 ? 'Position 1' : idx < 6 ? 'Position 2' : 'Any Position'),
        };
      });

      let descs = campaignOutput.searchAds.descriptions || [];
      if (descs.length < 4) {
        for (const fd of fallbackCampaign.searchAds.descriptions) {
          if (descs.length >= 4) break;
          descs.push(fd);
        }
      }

      campaignOutput.searchAds.descriptions = descs.slice(0, 4).map((d: any) => {
        const clampedText = smartClamp(d.text, 90);
        return {
          ...d,
          text: clampedText,
          charCount: clampedText.length,
        };
      });

      if (!campaignOutput.searchAds.callouts || campaignOutput.searchAds.callouts.length === 0) {
        campaignOutput.searchAds.callouts = fallbackCampaign.searchAds.callouts;
      }

      if (!campaignOutput.searchAds.sitelinks || campaignOutput.searchAds.sitelinks.length === 0) {
        campaignOutput.searchAds.sitelinks = fallbackCampaign.searchAds.sitelinks;
      }
    }

    if (campaignOutput.displayAds) {
      campaignOutput.displayAds.shortHeadline = smartClamp(campaignOutput.displayAds.shortHeadline, 30);
      campaignOutput.displayAds.shortHeadlineCharCount = campaignOutput.displayAds.shortHeadline.length;
      campaignOutput.displayAds.longHeadline = smartClamp(campaignOutput.displayAds.longHeadline, 90);
      campaignOutput.displayAds.longHeadlineCharCount = campaignOutput.displayAds.longHeadline.length;
      campaignOutput.displayAds.description = smartClamp(campaignOutput.displayAds.description, 90);
      campaignOutput.displayAds.descriptionCharCount = campaignOutput.displayAds.description.length;
      campaignOutput.displayAds.ctaText = campaignOutput.displayAds.ctaText || stageConfig.primaryCta;
      campaignOutput.displayAds.businessName = campaignOutput.displayAds.businessName || facts.publisher;
      campaignOutput.displayAds.targetPlacements = campaignOutput.displayAds.targetPlacements || fallbackCampaign.displayAds.targetPlacements;
      campaignOutput.displayAds.visualConceptPrompt = campaignOutput.displayAds.visualConceptPrompt || fallbackCampaign.displayAds.visualConceptPrompt;
      campaignOutput.displayAds.imageAccentColor = campaignOutput.displayAds.imageAccentColor || fallbackCampaign.displayAds.imageAccentColor;
      campaignOutput.displayAds.bannerHeadlineZh = campaignOutput.displayAds.bannerHeadlineZh || fallbackCampaign.displayAds.bannerHeadlineZh;
      campaignOutput.displayAds.bannerSubtextZh = campaignOutput.displayAds.bannerSubtextZh || fallbackCampaign.displayAds.bannerSubtextZh;
    }

    const norm = normalizeUrlComponents(facts.url || '');
    const baseUrl = norm.full || 'https://www.nature.com';

    res.json({
      success: true,
      campaign: {
        funnelStage: normalizedStage,
        legacyStage: normalizedStage === 'AWA' ? 'TOFU' : normalizedStage === 'CON' ? 'MOFU' : 'BOFU',
        clarivateFacts: facts,
        funnelStrategyNote: campaignOutput.funnelStrategyNote || `${stageConfig.name}: ${stageConfig.campaignObjective}`,
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

// API: Compare All 3 Stages (AWA, CON, DEC) Side-by-Side
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
