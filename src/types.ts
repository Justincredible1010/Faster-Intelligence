export type FunnelStage = 'TOFU' | 'MOFU' | 'BOFU';

export interface ClarivateJournalMetrics {
  url?: string;
  journalName: string;
  publisher: 'Springer Nature' | 'Nature Portfolio' | 'BMC (Part of Springer Nature)' | 'SpringerLink';
  impactFactor: number;
  fiveYearImpactFactor: number;
  jcrQuartile: 'Q1' | 'Q2';
  casZone: string; // e.g. "中科院1区 Top", "中科院2区"
  firstDecisionDays: number;
  indexing: string[]; // e.g. ["SCIE", "PubMed Central", "Scopus", "DOAJ"]
  openAccessType: 'Gold Open Access' | 'Hybrid Open Access';
  apcUsd: number;
  chinaWaiverAvailable: boolean;
  aimsAndScopeSummary: string;
  primaryDiscipline: string;
  sourceAttribution: string;
  isVerifiedClarivate?: boolean;
}

export interface GoogleSearchHeadline {
  text: string;
  charCount: number;
  sourceFact: string;
  language: 'EN' | 'ZH';
  category?: 'Brand & Title' | 'Clarivate IF & Rank' | 'Turnaround & Speed' | 'Scope & Special Issue' | 'Call to Action';
  positionRecommendation?: string; // e.g. 'Position 1', 'Position 2', 'Any Position'
}

export interface GoogleSearchDescription {
  text: string;
  charCount: number;
  sourceFact: string;
  language: 'EN' | 'ZH';
  theme?: 'Prestige & Metrics' | 'Fast Turnaround' | 'China Author Support & APC' | 'Urgent Submission';
}

export interface GoogleSearchAds {
  // Google Official Best Practice for Responsive Search Ads (RSA):
  // Maximum of 15 headlines (<= 30 chars each) and 4 descriptions (<= 90 chars each)
  headlines: GoogleSearchHeadline[];
  descriptions: GoogleSearchDescription[];
  sitelinks: { title: string; desc: string }[];
  callouts?: string[];
  structuredSnippet?: { header: string; values: string[] };
}

export interface GoogleDisplayAd {
  shortHeadline: string;
  shortHeadlineCharCount: number;
  longHeadline: string;
  longHeadlineCharCount: number;
  description: string;
  descriptionCharCount: number;
  businessName: string;
  ctaText: string;
  visualConceptPrompt: string;
  imageAccentColor: string;
  targetPlacements: string[];
  bannerHeadlineZh: string;
  bannerSubtextZh: string;
  customBannerImage?: string; // Base64 or URL from uploaded stock / PPT
}

export interface AcademicKeywordsPack {
  englishSearchKeywords: { keyword: string; matchType: 'Exact' | 'Phrase' | 'Broad'; intent: string }[];
  chineseAuthorKeywords: { keywordZh: string; matchType: '精确 (Exact)' | '短语 (Phrase)'; intentZh: string }[];
  negativeKeywords: string[]; // Crucial against paper mills
}

export interface GeneratedAdCampaign {
  funnelStage: FunnelStage;
  clarivateFacts: ClarivateJournalMetrics;
  searchAds?: GoogleSearchAds;
  displayAds?: GoogleDisplayAd;
  keywords: AcademicKeywordsPack;
  funnelStrategyNote: string;
  appliedPlaybookRules?: string[];
}
