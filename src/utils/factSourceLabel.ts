import { ClarivateJournalMetrics } from '../types';
import { formatJifClaim, impactFactorMayEnterCopy, metricFieldIsTrusted } from './metricClaims';

/** Plain-language source of the figures on screen. The claim guard decides what may enter an ad. */
export type FactSourceKind = 'clarivate' | 'website' | 'entered' | 'sample' | 'missing';

export interface FactSourceCopy {
  badge: string;
  detail: string;
  /** Other trusted figures on this record may be cited. A sample list may not. */
  usedInAds: boolean;
  /** An impact factor is a Clarivate figure only when the Journals API supplied it. */
  impactFactorIsClarivate: boolean;
}

type Facts = Partial<ClarivateJournalMetrics> | null | undefined;

function fieldSource(facts: Facts, field: string): string | undefined {
  return facts?.provenanceMap?.[field]?.source;
}

export function factSourceKind(facts: Facts): FactSourceKind {
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
          'An impact factor from Clarivate can appear in the ads only with its JCR year, for example JIF 56.1 (Clarivate JCR 2025). Other Clarivate figures can appear in the ads with that source.',
        usedInAds: true,
        impactFactorIsClarivate: true,
      };
    case 'website':
      return {
        badge: 'From the journal website',
        detail:
          'Fees, decision time, and open access from the journal website can appear in the ads with that source. An impact factor from the website stays on this panel and is not used in the ads.',
        usedInAds: true,
        impactFactorIsClarivate: false,
      };
    case 'entered':
      return {
        badge: 'You entered these',
        detail:
          'Fees, decision time, and open access you typed can appear in the ads. An impact factor you typed stays on this panel and is not used in the ads.',
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
  if (field === 'impact') {
    if (copy.impactFactorIsClarivate) return 'From Clarivate, with the JCR year. Can be used in the ads.';
    return 'Shown here only. Not used in the ads.';
  }
  if (!copy.usedInAds) return 'Sample only. Left out of the ads.';
  if (kind === 'website') return 'From the journal website. Can be used in the ads.';
  if (kind === 'entered') return 'You entered this. Can be used in the ads.';
  return 'From Clarivate. Can be used in the ads.';
}

export function shownFigure(value: number | null | undefined, kind: FactSourceKind): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return kind === 'sample' ? 'Not in this sample' : 'Not available';
}

export interface ImpactPanelCopy {
  valueText: string;
  caption: string;
  fromClarivate: boolean;
}

/** The on-screen impact factor. Clarivate copy keeps the JCR year. A website figure is not offered for the ads. */
export function impactPanel(facts: Facts): ImpactPanelCopy {
  const claim = formatJifClaim(facts);
  if (claim && impactFactorMayEnterCopy(facts, 'impactFactor')) {
    return {
      valueText: claim,
      caption: 'Can be used in the ads. Keep the JCR year in the line.',
      fromClarivate: true,
    };
  }
  const kind = factSourceKind(facts);
  const valueText = shownFigure(facts?.impactFactor, kind);
  const source = fieldSource(facts, 'impactFactor') || facts?.provenanceSource;
  if (source === 'page_sourced' || source === 'landing_page' || facts?.verificationStatus === 'page_sourced') {
    return {
      valueText,
      caption: 'From the journal website. Shown here only. Not used in the ads.',
      fromClarivate: false,
    };
  }
  if (source === 'user_provided' || facts?.verificationStatus === 'user_provided') {
    return {
      valueText,
      caption: 'You entered this. Shown here only. Not used in the ads.',
      fromClarivate: false,
    };
  }
  if (source === 'clarivate_wos_journals_api' || facts?.verificationStatus === 'clarivate_api') {
    return {
      valueText,
      caption: 'From Clarivate, but the JCR year is missing. Shown here only. Not used in the ads.',
      fromClarivate: false,
    };
  }
  return {
    valueText,
    caption: 'Sample only. Left out of the ads.',
    fromClarivate: false,
  };
}

export function fiveYearPanel(facts: Facts): ImpactPanelCopy {
  const value = facts?.fiveYearImpactFactor;
  const year = facts?.jcrYear;
  if (
    impactFactorMayEnterCopy(facts, 'fiveYearImpactFactor') &&
    typeof value === 'number' &&
    Number.isFinite(value) &&
    typeof year === 'number'
  ) {
    return {
      valueText: String(value),
      caption: `5-year IF ${value} (Clarivate JCR ${year}). Can be used in the ads.`,
      fromClarivate: true,
    };
  }
  const panel = impactPanel({ ...facts, impactFactor: value ?? null });
  return {
    valueText: shownFigure(value, factSourceKind(facts)),
    caption: panel.fromClarivate ? panel.caption : panel.caption,
    fromClarivate: false,
  };
}

/** APC, decision time, open access, and similar fields. An impact factor does not use this. */
export function otherFactCaption(facts: Facts, field: string): string {
  if (!facts || !metricFieldIsTrusted(facts, field)) return 'Sample only. Left out of the ads.';
  const source = fieldSource(facts, field) || facts.provenanceSource;
  const year = facts.provenanceMap?.[field]?.year;
  if (source === 'page_sourced' || source === 'landing_page') {
    return 'From the journal website. Can be used in the ads.';
  }
  if (source === 'user_provided') return 'You entered this. Can be used in the ads.';
  if (source === 'clarivate_wos_journals_api') {
    return year != null
      ? `From Clarivate, JCR ${year}. Can be used in the ads.`
      : 'From Clarivate. Can be used in the ads.';
  }
  return 'Can be used in the ads.';
}

export function plainSourceLabel(source: string | undefined, field?: string, year?: number): string {
  if (
    (field === 'impactFactor' || field === 'fiveYearImpactFactor') &&
    (source === 'page_sourced' || source === 'landing_page')
  ) {
    return 'From the journal website. Not used in the ads';
  }
  if (source === 'page_sourced' || source === 'landing_page') return 'From the journal website';
  if (source === 'catalog_snapshot') return 'Sample list. Not used in the ads';
  if (source === 'user_provided') return 'You entered this';
  if (source === 'clarivate_wos_journals_api') {
    return year != null ? `Clarivate JCR ${year}` : 'From Clarivate';
  }
  return '';
}

export function factCacheLine(facts: Facts): string {
  const kind = factSourceKind(facts);
  if (kind === 'entered') return 'You entered these figures.';
  if (kind === 'missing') return 'No figures saved for this page.';
  if (kind === 'sample') {
    return facts?.catalogDataYear
      ? `Sample list from ${facts.catalogDataYear}. This is not a live lookup.`
      : 'Sample list. This is not a live lookup.';
  }
  if (facts?.isFromCache) return 'Using a saved copy. Choose Look up again for a fresh read.';
  if (kind === 'clarivate') {
    return facts?.jcrYear ? `Read from Clarivate, JCR ${facts.jcrYear}.` : 'Read from Clarivate just now.';
  }
  if (kind === 'website') return 'Read from the journal page just now.';
  return 'Looked up just now.';
}
