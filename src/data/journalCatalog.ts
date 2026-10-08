import { ClarivateJournalMetrics } from '../types';
import { normalizeJournalUrl } from '../utils/journalUrl';

/** Year printed on this in-repo snapshot. It is not a Clarivate API retrieval. */
export const CATALOG_DATA_YEAR = 2024;

export interface CatalogJournal extends ClarivateJournalMetrics {
  url: string;
  slugs: string[];
  catalogDataYear: number;
}

interface CatalogSeed extends Omit<CatalogJournal, 'url' | 'verificationStatus' | 'isVerifiedClarivate' | 'catalogDataYear' | 'reportingYear' | 'sourceAttribution'> {
  url: string;
}

function snapshot(seed: CatalogSeed): CatalogJournal {
  return {
    ...seed,
    url: normalizeJournalUrl(seed.url).canonical,
    verificationStatus: 'catalog_snapshot',
    provenanceSource: 'catalog_snapshot',
    isVerifiedClarivate: false,
    catalogDataYear: CATALOG_DATA_YEAR,
    reportingYear: `Catalog snapshot ${CATALOG_DATA_YEAR}`,
    sourceAttribution: `Catalog snapshot (data year ${CATALOG_DATA_YEAR}). Not retrieved from the Clarivate API.`,
  };
}

/**
 * In-repo journal snapshot. URLs are canonical. Numbers are historical snapshot
 * values and must not be cited in ads until a trusted source confirms them.
 */
export const JOURNAL_CATALOG: CatalogJournal[] = [
  snapshot({
    url: 'https://www.nature.com',
    slugs: ['flagship', 'default'],
    journalName: 'Nature',
    publisher: 'Nature Portfolio',
    // No impact factor is stored for Nature. A JCR value has to come from the Web of Science Journals API.
    impactFactor: null,
    fiveYearImpactFactor: null,
    jcrQuartile: 'Q1',
    casZone: '中科院综合性期刊1区 Top',
    firstDecisionDays: 32,
    indexing: ['SCIE', 'PubMed Central', 'MEDLINE', 'Scopus'],
    openAccessType: 'Hybrid Open Access',
    apcUsd: 11690,
    chinaWaiverAvailable: false,
    aimsAndScopeSummary:
      'The world’s premier multidisciplinary science journal publishing the finest peer-reviewed research across all areas of science and technology.',
    primaryDiscipline: 'Multidisciplinary Sciences (综合性科学)',
  }),
  snapshot({
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
    aimsAndScopeSummary:
      'Multidisciplinary open access journal dedicated to publishing high-quality research in natural sciences, biology, physics, and chemistry.',
    primaryDiscipline: 'Multidisciplinary Sciences (综合性科学)',
  }),
  snapshot({
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
    aimsAndScopeSummary:
      'Official journal of the Chinese Pharmacological Society and Shanghai Institute of Materia Medica, CAS, published with Nature Portfolio, covering all aspects of pharmacology and pharmaceutical sciences.',
    primaryDiscipline: 'Pharmacology & Pharmacy (药理学与药物科学)',
  }),
  snapshot({
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
    aimsAndScopeSummary:
      'Co-published by CAS and Nature Portfolio, focusing on molecular and cell biology, cancer, and immunology.',
    primaryDiscipline: 'Cell Biology (细胞生物学)',
  }),
  snapshot({
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
    aimsAndScopeSummary:
      'An open access journal publishing scientifically valid, primary research from across all disciplines of natural and clinical sciences.',
    primaryDiscipline: 'Multidisciplinary Sciences (综合性科学)',
  }),
  snapshot({
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
    aimsAndScopeSummary:
      'Leading international cancer research journal publishing molecular pathways of disease, metastasis, and targeted therapies.',
    primaryDiscipline: 'Oncology (肿瘤学)',
  }),
  snapshot({
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
    aimsAndScopeSummary:
      'Flagship biology journal of BMC, publishing research of broad interest across all areas of biological science.',
    primaryDiscipline: 'Biological Sciences (生物科学)',
  }),
];
