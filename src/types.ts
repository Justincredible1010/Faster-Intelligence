export type StageCode = 'AWA' | 'CON' | 'DEC';
// Backwards compatibility alias for existing code
export type FunnelStage = StageCode | 'TOFU' | 'MOFU' | 'BOFU';

export type OutputLanguage = 'all' | 'EN' | 'ZH';

export type FactVerificationStatus =
  | 'user_provided'
  | 'page_sourced'
  | 'clarivate_api'
  | 'catalog_snapshot'
  | 'missing';

/** Where a metric value came from. clarivate_api is trusted only with the Web of Science source. */
export type MetricProvenanceSource =
  | 'user_provided'
  | 'page_sourced'
  | 'clarivate_wos_journals_api'
  | 'catalog_snapshot'
  | 'missing';

export type WorkflowStep = 'builder' | 'library' | 'preview' | 'compliance' | 'export';

export interface ExtractedFactField<T> {
  value: T;
  source: 'Clarivate' | 'LandingPage' | 'UserOverride' | 'Inferred';
  confidence: number; // 0.0 - 1.0 (0.9 = verified/exact, 0.6 = heuristic, 0.0 = missing)
  extractedAt?: string;
  provenanceLabel?: string;
}

/** A concrete feature the journal page states. Not an impact factor or a ranking. */
export interface PageSourcedFeature {
  kind: 'aims_and_audience' | 'article_types' | 'publishing_model' | 'speed' | 'submission';
  label: string;
  text: string;
  provenance: 'page-sourced';
}

/** A number or labelled figure taken from the journal page itself, not from Clarivate or a model guess. */
export interface PageSourcedMetric {
  label: string;
  value: string;
  numericValue?: number | null;
  year?: number | null;
  kind: 'impact_factor' | 'five_year_impact_factor' | 'first_decision_days' | 'downloads' | 'full_text_views' | 'apc' | 'other';
  provenance: 'page-sourced';
}

export interface ExtractedPageFacts {
  journalTitle: ExtractedFactField<string | null>;
  issnPrint: ExtractedFactField<string | null>;
  issnElectronic: ExtractedFactField<string | null>;
  canonicalUrl: ExtractedFactField<string | null>;
  publisherName: ExtractedFactField<string | null>;
  submissionPortalUrl: ExtractedFactField<string | null>;
  authorGuidelinesUrl: ExtractedFactField<string | null>;
  /** Real links found on the page. Empty when the page does not contain that link. */
  aboutUrl: ExtractedFactField<string | null>;
  articlesUrl: ExtractedFactField<string | null>;
  editorsUrl: ExtractedFactField<string | null>;
  collectionsUrl: ExtractedFactField<string | null>;
  aimsUrl: ExtractedFactField<string | null>;
  metricsUrl: ExtractedFactField<string | null>;
  checklistUrl: ExtractedFactField<string | null>;
  aimsAndScopeSummary: ExtractedFactField<string | null>;
  articleProcessingChargeUsd: ExtractedFactField<number | null>;
  /** Link to an APC explainer when the page mentions fees but does not state an amount. */
  apcInfoUrl: ExtractedFactField<string | null>;
  firstDecisionDays: ExtractedFactField<number | null>;
  acceptedArticleTypes: ExtractedFactField<string[]>;
  editorInChief: ExtractedFactField<string | null>;
  peerReviewModel: ExtractedFactField<string | null>;
  openAccessPolicy: ExtractedFactField<string | null>;
  specialIssuesAvailable: ExtractedFactField<boolean>;
  /** Metrics the page itself states. Each item is labelled page-sourced. */
  pageMetrics: PageSourcedMetric[];
  /** Features the visible page or its real links state. Each item is page-sourced. */
  pageFeatures: PageSourcedFeature[];
  layout: 'nature_portfolio' | 'springer_link' | 'unknown';
  rawConfidenceAverage: number;
  extractedDate: string;
}

export interface WosJifRank {
  category?: string;
  /** Category rank as returned by the API, for example "1/140". */
  rank?: string;
  quartile?: string;
  jifPercentile?: string | number;
}

export interface ClarivateJournalMetrics {
  url?: string;
  journalName: string;
  publisher: 'Springer Nature' | 'Nature Portfolio' | 'BMC (Part of Springer Nature)' | 'SpringerLink' | string;
  impactFactor: number | null;
  fiveYearImpactFactor?: number | null;
  jcrQuartile?: 'Q1' | 'Q2' | 'Q3' | 'Q4' | string | null;
  casZone?: string | null; // e.g. "中科院综合性期刊1区 Top", "中科院医学1区"
  firstDecisionDays?: number | null;
  indexing?: string[]; // e.g. ["SCIE", "PubMed Central", "Scopus", "DOAJ"]
  openAccessType?: 'Gold Open Access' | 'Hybrid Open Access' | string | null;
  apcUsd?: number | null;
  /** Article downloads stated by the journal page. Not a date, and not Clarivate retrievedAt. */
  articleDownloads?: number | null;
  /** Full-text views or a similar usage count stated by the journal page. */
  fullTextViews?: number | null;
  chinaWaiverAvailable?: boolean;
  aimsAndScopeSummary?: string;
  primaryDiscipline?: string;
  sourceAttribution: string;
  /**
   * Provenance id. Clarivate attribution is allowed only for
   * 'clarivate_wos_journals_api', which is the Web of Science Journals API.
   */
  provenanceSource?: MetricProvenanceSource;
  /** True only when provenanceSource is clarivate_wos_journals_api. */
  isVerifiedClarivate?: boolean;
  verificationStatus: FactVerificationStatus;
  reportingYear?: string;
  /** JCR edition year. Required when a person enters metrics by hand. */
  jcrYear?: number;
  /** ISO time the Web of Science Journals API response was retrieved. */
  retrievedAt?: string;
  /** Web of Science journal id, for example NATURE. */
  wosJournalId?: string;
  issn?: string;
  eIssn?: string;
  /** ranks.jif[] from the year report. */
  jifRanks?: WosJifRank[];
  immediacyIndex?: number | null;
  journalCitationIndicator?: number | null;
  /** Year of an in-repo catalog snapshot. Not a Clarivate release date. */
  catalogDataYear?: number;
  missingFields?: string[];
  isFromCache?: boolean;
  cachedAt?: string;
  cacheExpiresAt?: string;
  submissionPortalUrl?: string | null;
  authorGuidelinesUrl?: string | null;
  /** Page-sourced features for Google, Weibo, and WeChat copy. Empty when the page did not state them. */
  pageFeatures?: PageSourcedFeature[];
  extractedFacts?: ExtractedPageFacts;
  provenanceMap?: Record<string, { source: string; confidence: number; year?: number; note?: string }>;
}

export interface CachedMetricEntry {
  metric: string;              // e.g., 'impactFactor', 'casZone', 'reviewTime', 'apc'
  value: number | string | null;
  year: number;
  source: string;              // e.g., 'Clarivate JCR', 'user_provided', 'Web Lookup'
  cachedAt: string;
  expireAt: string;
}

export interface CachedJournal {
  journalId: string;           // ISSN or domain slug
  journalName: string;
  publisher: string;
  metrics: Record<string, CachedMetricEntry>;
  lastAccess: string;
  fullFacts?: ClarivateJournalMetrics;
  extractedFacts?: ExtractedPageFacts;
  extractedExpireAt?: string;  // 30 days
}

export interface StageStrategyDefinition {
  code: StageCode;
  legacyCode: 'TOFU' | 'MOFU' | 'BOFU';
  name: string; // "AWA — Awareness", "CON — Consideration", "DEC — Decision"
  shortLabel: string;
  authorMindset: string; // "What is this journal, and why is it relevant to me?"
  campaignObjective: string; // "Introduce the journal and establish relevance and credible interest"
  tone: string; // "Informative, welcoming, research-led, low-pressure"
  primaryCta: string;
  messagingPriorities: string[];
  thingsToAvoid: string[];
  exampleCtas: string[];
  recommendedDestination: {
    label: string;
    pathSuffix: string;
    purpose: string;
  };
}

export interface GoogleSearchHeadline {
  text: string;
  charCount: number;
  charWidth?: number;
  sourceFact: string;
  language: 'EN' | 'ZH';
  category?: 'Journal Identity' | 'Scope & Community' | 'Evaluation & Metrics' | 'Author Guidance' | 'Call to Action' | string;
  positionRecommendation?: string; // e.g. 'Position 1', 'Position 2', 'Any Position'
  strayChars?: string[];
  isPurityValid?: boolean;
}

export interface GoogleSearchDescription {
  text: string;
  charCount: number;
  charWidth?: number;
  sourceFact: string;
  language: 'EN' | 'ZH';
  theme?: 'Scope & Relevance' | 'Evaluation & Peer Review' | 'Author Checklist' | 'Publishing Options' | string;
  strayChars?: string[];
  isPurityValid?: boolean;
}

export interface GoogleSearchAds {
  headlines: GoogleSearchHeadline[];
  descriptions: GoogleSearchDescription[];
  sitelinks: { title: string; desc: string; urlPath?: string }[];
  callouts?: string[];
  structuredSnippet?: { header: string; values: string[] };
  recommendedFinalUrl?: string;
}

export interface GoogleDisplayAd {
  shortHeadline: string;
  shortHeadlineCharCount: number;
  shortHeadlineCharWidth?: number;
  longHeadline: string;
  longHeadlineCharCount: number;
  longHeadlineCharWidth?: number;
  description: string;
  descriptionCharCount: number;
  descriptionCharWidth?: number;
  businessName: string;
  ctaText: string;
  visualConceptPrompt: string;
  imageAccentColor: string;
  targetPlacements: string[];
  bannerHeadlineZh: string;
  bannerSubtextZh: string;
  customBannerImage?: string;
  recommendedFinalUrl?: string;
}

export interface AcademicKeywordItem {
  keyword: string;
  matchType: 'Exact' | 'Phrase' | 'Broad';
  intent: string;
}

export interface ChineseKeywordItem {
  keywordZh: string;
  matchType: '精确 (Exact)' | '短语 (Phrase)';
  intentZh: string;
}

export interface AcademicKeywordsPack {
  englishSearchKeywords: AcademicKeywordItem[];
  chineseAuthorKeywords: ChineseKeywordItem[];
  negativeKeywords: string[];
}

export interface ComplianceIssue {
  id: string;
  type: 'error' | 'warning';
  category: 'trademark' | 'superlative' | 'misleading_claim' | 'funding_claim' | 'char_limit' | 'missing_fact' | 'stale_fact' | 'source_mismatch';
  message: string;
  targetText: string;
  suggestedFix?: string;
  fieldLocation: string; // e.g. 'Headline 3', 'Display Long Headline', 'Keyword 2'
}

export interface ComplianceValidationReport {
  status: 'clean' | 'has_warnings' | 'has_errors';
  errorsCount: number;
  warningsCount: number;
  issues: ComplianceIssue[];
  checkedAt: string;
}

export interface GenerationFactProvenanceItem {
  field: string;
  value: any;
  source: string;
  year?: number;
  confidence?: number;
  provenanceString: string;
}

export interface AssetValidationReport {
  status: 'OK' | 'Warnings' | 'Errors';
  usedFacts: GenerationFactProvenanceItem[];
  missingFacts: string[];
  warnings: string[];
  issues: Array<{ field: string; message: string; severity: 'error' | 'warning' | 'info' }>;
}

export interface AssetGenerationContext {
  facts: ClarivateJournalMetrics;
  stage: StageCode;
  outputLanguage: OutputLanguage;
  customPlaybook?: string;
  aiModel?: 'gemini' | null;
}

export interface GeneratedAdCampaign {
  funnelStage: StageCode;
  legacyStage?: 'TOFU' | 'MOFU' | 'BOFU';
  clarivateFacts: ClarivateJournalMetrics;
  searchAds?: GoogleSearchAds;
  displayAds?: GoogleDisplayAd;
  keywords: AcademicKeywordsPack;
  funnelStrategyNote: string;
  primaryCta: string;
  recommendedDestination: {
    label: string;
    url: string;
    description: string;
  };
  generationSource: 'ai_grounded' | 'template_fallback';
  appliedPlaybookRules?: string[];
  outputLanguage?: OutputLanguage;
  generatedAt?: string;
  complianceReport?: ComplianceValidationReport;
  assetValidationReport?: AssetValidationReport;
}

export const STAGE_CONFIGS: Record<StageCode, StageStrategyDefinition> = {
  AWA: {
    code: 'AWA',
    legacyCode: 'TOFU',
    name: 'AWA — Awareness',
    shortLabel: 'Awareness',
    authorMindset: '“What is this journal, and why is it relevant to my research?”',
    campaignObjective: 'Introduce the journal, establish subject relevance, and build credible discovery without submission pressure.',
    tone: 'Informative, welcoming, research-led, and low-pressure.',
    primaryCta: 'Explore the journal',
    messagingPriorities: [
      'Research topics and journal scope',
      'The scientific community the journal serves',
      'Relevant published work and discoveries',
      'Publisher identity and supported credibility signals',
    ],
    thingsToAvoid: [
      'Submission pressure or immediate upload CTAs',
      'Deadlines or artificial urgency',
      'Leading every ad asset with impact factor or review speed',
      'Vague hype or unverified citation claims',
    ],
    exampleCtas: ['Explore the journal', 'Browse articles', 'Discover the scope', 'Explore latest research'],
    recommendedDestination: {
      label: 'Journal Overview & Latest Articles',
      pathSuffix: '',
      purpose: 'The journal landing page, or an about/articles link extracted from that page.',
    },
  },
  CON: {
    code: 'CON',
    legacyCode: 'MOFU',
    name: 'CON — Consideration',
    shortLabel: 'Consideration',
    authorMindset: '“Is this journal better suited for my manuscript than other publishing options?”',
    campaignObjective: 'Help the author evaluate topical fit, article types, editorial rigor, open access models, and objective comparisons with other journals.',
    tone: 'Specific, transparent, evidence-led, and useful for objective comparison.',
    primaryCta: 'Check journal fit',
    messagingPriorities: [
      'Specific aims and scope & accepted article types',
      'Editorial board expertise and peer review process',
      'Publishing model, APC fees, and institutional options',
      'Supported indexing (SCIE, Scopus) and official JCR metrics',
      'Objective comparison facts (metrics year, turnaround days, indexing) without unverified claims',
    ],
    thingsToAvoid: [
      'Treating Consideration as synonymous with Special Issues or CFP',
      'Inventing competitor claims, unverified comparisons, or superiority claims',
      'Conflating open access with free publishing',
      'Hiding author requirements or fee transparency',
    ],
    exampleCtas: ['Check journal fit', 'Review aims and scope', 'Compare publishing options', 'View indexing & metrics'],
    recommendedDestination: {
      label: 'Aims, Scope & Publishing Criteria',
      pathSuffix: '',
      purpose: 'The journal landing page, or an aims link extracted from that page.',
    },
  },
  DEC: {
    code: 'DEC',
    legacyCode: 'BOFU',
    name: 'DEC — Decision',
    shortLabel: 'Decision',
    authorMindset: '“What do I need to prepare and do to submit my manuscript?”',
    campaignObjective: 'Reduce submission friction, provide clear preparation checklists, fee/waiver criteria, and direct submission access.',
    tone: 'Clear, practical, reassuring, and action-oriented without artificial hype.',
    primaryCta: 'View submission checklist',
    messagingPriorities: [
      'Author guidelines and manuscript preparation requirements',
      'Required documentation, formatting checklists, and templates',
      'Applicable fees, waiver criteria, and institutional agreements',
      'The verified online submission portal and editorial workflow',
    ],
    thingsToAvoid: [
      'Invented deadlines or fake expiration dates',
      'Guaranteed acceptance or fast-track promises',
      'Treating first decision time as acceptance or publication time',
      'Hidden fees or unverified funding compliance claims',
    ],
    exampleCtas: ['View submission checklist', 'Read author guidelines', 'Start submission', 'Prepare your manuscript'],
    recommendedDestination: {
      label: 'Author Guidelines & Submission Portal',
      pathSuffix: '',
      purpose: 'An extracted author-guidelines or submission link, otherwise the journal landing page.',
    },
  },
};

export function normalizeStage(stage: string): StageCode {
  const upper = (stage || '').toUpperCase();
  if (upper === 'AWA' || upper === 'TOFU') return 'AWA';
  if (upper === 'CON' || upper === 'MOFU') return 'CON';
  if (upper === 'DEC' || upper === 'BOFU') return 'DEC';
  return 'CON'; // Default
}
