import { ClarivateJournalMetrics } from '../types';

/** Plain-language source of the figures on screen. Does not decide what the ads may claim. */
export type FactSourceKind = 'clarivate' | 'website' | 'entered' | 'sample' | 'missing';

export interface FactSourceCopy {
  badge: string;
  detail: string;
  /** Sample-list figures are shown and left out of the ads. */
  usedInAds: boolean;
  /** An impact factor is described as Clarivate only when Clarivate supplied it. */
  impactFactorIsClarivate: boolean;
}

export function factSourceKind(
  facts: Partial<ClarivateJournalMetrics> | null | undefined,
): FactSourceKind {
  if (!facts || facts.verificationStatus === 'missing' || facts.provenanceSource === 'missing') {
    return 'missing';
  }
  if (
    facts.provenanceSource === 'clarivate_wos_journals_api' ||
    facts.verificationStatus === 'clarivate_api'
  ) {
    return 'clarivate';
  }
  if (facts.provenanceSource === 'page_sourced' || facts.verificationStatus === 'page_sourced') {
    return 'website';
  }
  if (facts.provenanceSource === 'user_provided' || facts.verificationStatus === 'user_provided') {
    return 'entered';
  }
  return 'sample';
}

export function factSourceCopy(kind: FactSourceKind): FactSourceCopy {
  switch (kind) {
    case 'clarivate':
      return {
        badge: 'From Clarivate',
        detail:
          'These figures came from Clarivate. They can appear in the ads, and the impact factor can be named as a Clarivate figure.',
        usedInAds: true,
        impactFactorIsClarivate: true,
      };
    case 'website':
      return {
        badge: 'From the journal website',
        detail:
          'These figures were read from the journal page. They can appear in the ads. The impact factor is not described as a Clarivate figure.',
        usedInAds: true,
        impactFactorIsClarivate: false,
      };
    case 'entered':
      return {
        badge: 'You entered these',
        detail:
          'These are the figures you typed. They can appear in the ads. They are not described as Clarivate figures.',
        usedInAds: true,
        impactFactorIsClarivate: false,
      };
    case 'sample':
      return {
        badge: 'Sample figures',
        detail:
          'These numbers are from a saved sample list. They are not from Clarivate or the journal page, and they are left out of the ads.',
        usedInAds: false,
        impactFactorIsClarivate: false,
      };
    default:
      return {
        badge: 'Figures missing',
        detail: 'This page has no saved figures. Enter them before generating ads.',
        usedInAds: false,
        impactFactorIsClarivate: false,
      };
  }
}

export function metricCaption(kind: FactSourceKind, field: 'impact' | 'other'): string {
  const copy = factSourceCopy(kind);
  if (!copy.usedInAds) return 'Sample only. Left out of the ads.';
  if (field === 'impact') {
    if (copy.impactFactorIsClarivate) return 'From Clarivate. Can be used in the ads.';
    if (kind === 'website') return 'From the journal website. Not described as Clarivate.';
    return 'You entered this. Not described as Clarivate.';
  }
  if (kind === 'website') return 'From the journal website. Can be used in the ads.';
  if (kind === 'entered') return 'You entered this. Can be used in the ads.';
  return 'From Clarivate. Can be used in the ads.';
}

export function shownFigure(
  value: number | null | undefined,
  kind: FactSourceKind,
): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return kind === 'sample' ? 'Not in this sample' : 'Not available';
}

export function factCacheLine(facts: Partial<ClarivateJournalMetrics> | null | undefined): string {
  const kind = factSourceKind(facts);
  if (kind === 'entered') return 'You entered these figures.';
  if (kind === 'missing') return 'No figures saved for this page.';
  if (kind === 'sample') {
    return facts?.catalogDataYear
      ? `Sample list from ${facts.catalogDataYear}. This is not a live lookup.`
      : 'Sample list. This is not a live lookup.';
  }
  if (facts?.isFromCache) return 'Using a saved copy. Choose Look up again for a fresh read.';
  if (kind === 'clarivate') return 'Read from Clarivate just now.';
  if (kind === 'website') return 'Read from the journal page just now.';
  return 'Looked up just now.';
}
