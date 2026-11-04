import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bestJifRank, displayCategory, formatQuartileClaim, quartileCategory } from '../src/utils/jcrQuartile';
import { guardMetricClaims, metricPromptSection, trustedQuartileClaim } from '../src/utils/metricClaims';
import { checkFaithfulness } from '../src/utils/faithfulness';
import { lookupMetricsByIssn } from '../src/utils/metricSources';

const ranks = [
  { category: 'COMPUTER SCIENCE, INTERDISCIPLINARY APPLICATIONS', rank: '60/170', quartile: 'Q2', jifPercentile: 65 },
  { category: 'INFORMATION SCIENCE & LIBRARY SCIENCE', rank: '20/160', quartile: 'Q1', jifPercentile: 87.8 },
];
const facts: any = {
  journalName: 'Scientometrics', publisher: 'Springer Nature', impactFactor: 3.8, jcrYear: 2025,
  jcrQuartile: 'Q1', jcrQuartileCategory: 'INFORMATION SCIENCE & LIBRARY SCIENCE', jifRanks: ranks,
  verificationStatus: 'clarivate_api', provenanceSource: 'clarivate_wos_journals_api', isVerifiedClarivate: true,
  aimsAndScopeSummary: 'Quantitative studies of science.', indexing: ['SCIE'],
};

describe('best-category JCR quartile', () => {
  it('picks the lowest quartile and its category; ties go to higher percentile', () => {
    assert.deepEqual(bestJifRank(ranks), { quartile: 'Q1', category: 'INFORMATION SCIENCE & LIBRARY SCIENCE', rank: '20/160' });
    const tie = bestJifRank([{ category: 'A', quartile: 'Q1', jifPercentile: 80 }, { category: 'B', quartile: 'Q1', jifPercentile: 95 }]);
    assert.equal(tie?.category, 'B');
    assert.equal(bestJifRank([{ quartile: 'Q1' }]), null);
    assert.equal(bestJifRank([]), null);
  });

  it('formats the claim with the category and source', () => {
    assert.equal(formatQuartileClaim(facts), 'Q1 in Information Science & Library Science (Clarivate JCR 2025)');
    assert.equal(trustedQuartileClaim(facts), 'Q1 in Information Science & Library Science (Clarivate JCR 2025)');
    const legacy = { ...facts, jcrQuartileCategory: undefined };
    assert.equal(quartileCategory(legacy), 'INFORMATION SCIENCE & LIBRARY SCIENCE');
    assert.equal(formatQuartileClaim({ jcrQuartile: 'Q1' }), null);
  });

  it('title-cases capitalised Clarivate category names', () => {
    assert.equal(displayCategory('MEDICINE, GENERAL & INTERNAL'), 'Medicine, General & Internal');
    assert.equal(displayCategory('COMPUTER SCIENCE, INTERDISCIPLINARY APPLICATIONS'), 'Computer Science, Interdisciplinary Applications');
    assert.equal(displayCategory('GENETICS & HEREDITY'), 'Genetics & Heredity');
    assert.equal(displayCategory('Multidisciplinary Sciences'), 'Multidisciplinary Sciences');
  });

  it('prompt names the category and forbids a bare quartile', () => {
    const p = metricPromptSection(facts);
    assert.match(p, /Cite the quartile exactly as: Q1 in Information Science & Library Science \(Clarivate JCR 2025\)/);
    assert.match(p, /Never write Q1 without naming this category/);
    const noCat = metricPromptSection({ ...facts, jcrQuartileCategory: null, jifRanks: [] });
    assert.match(noCat, /Do not state a JCR quartile/);
  });

  it('guard strips a bare Q1 and keeps a Q1 that names its category', () => {
    const bare = guardMetricClaims('Scientometrics Q1 journal', facts);
    assert.doesNotMatch(bare.text, /Q1/);
    assert.ok(bare.flags.some((f) => /without its JCR category/.test(f)));
    const named = guardMetricClaims('Q1 in Information Science & Library Science (Clarivate JCR 2025)', facts);
    assert.match(named.text, /Q1 in Information Science & Library Science/);
    const zh = guardMetricClaims('JCR Q1（INFORMATION SCIENCE & LIBRARY SCIENCE，Clarivate JCR 2025）期刊', facts);
    assert.match(zh.text, /Q1/);
    assert.doesNotMatch(guardMetricClaims('Q2 in Information Science & Library Science', facts).text, /Q2/);
  });

  it('faithfulness requires the category next to the quartile', () => {
    assert.ok(checkFaithfulness('Q1 in Information Science & Library Science (Clarivate JCR 2025)', facts).ok);
    const bare = checkFaithfulness('A Q1 journal', facts);
    assert.ok(!bare.ok && bare.problems.some((p) => /must name its JCR category/.test(p)), bare.problems.join('|'));
  });

  it('Clarivate lookup stores the best quartile and its category', async () => {
    const client: any = {
      searchByIssn: async () => ({ hits: [{ id: 'X1' }] }),
      getJournal: async () => ({ id: 'X1', title: 'Scientometrics', issn: '0138-9130', categories: [], categoryEditions: ['SCIE'], journalCitationReports: [{ year: 2025 }] }),
      getYearReport: async () => ({ metrics: { impactMetrics: { jif: '3.8', jif5Years: '4.4' } }, ranks: { jif: ranks } }),
    };
    const out: any = await lookupMetricsByIssn('0138-9130', client, new Date('2026-01-01T00:00:00Z'));
    assert.equal(out?.jcrQuartile, 'Q1');
    assert.equal(out?.jcrQuartileCategory, 'INFORMATION SCIENCE & LIBRARY SCIENCE');
  });
});

import { refineQuartileCategory, subjectMatchScore } from '../src/utils/jcrQuartile';
import { zhQuartileLine } from '../server';

describe('subject-aware tie-break', () => {
  const oncogeneRanks = [
    { category: 'CELL BIOLOGY', quartile: 'Q1', jifPercentile: 84.3, rank: '33/207' },
    { category: 'GENETICS & HEREDITY', quartile: 'Q1', jifPercentile: 94.5, rank: '11/192' },
    { category: 'ONCOLOGY', quartile: 'Q1', jifPercentile: 88.8, rank: '38/334' },
    { category: 'BIOCHEMISTRY & MOLECULAR BIOLOGY', quartile: 'Q1', jifPercentile: 90.7, rank: '31/328' },
  ];
  it('Oncogene picks Oncology from its title', () => {
    assert.equal(bestJifRank(oncogeneRanks, { titles: ['ONCOGENE'] })?.category, 'ONCOLOGY');
  });
  it('falls back to highest percentile when nothing matches', () => {
    assert.equal(bestJifRank(oncogeneRanks, { titles: ['Journal X'] })?.category, 'GENETICS & HEREDITY');
    assert.equal(bestJifRank(oncogeneRanks)?.category, 'GENETICS & HEREDITY');
  });
  it('a better quartile still beats a subject match', () => {
    const r = bestJifRank([{ category: 'ONCOLOGY', quartile: 'Q2', jifPercentile: 70 }, { category: 'CELL BIOLOGY', quartile: 'Q1', jifPercentile: 80 }], { titles: ['Oncology Reports'] });
    assert.equal(r?.category, 'CELL BIOLOGY');
  });
  it('uses landing-page scope when the title says nothing', () => {
    const r = bestJifRank([{ category: 'CELL BIOLOGY', quartile: 'Q1', jifPercentile: 95 }, { category: 'ONCOLOGY', quartile: 'Q1', jifPercentile: 80 }], { titles: ['Journal X'], scope: ['Publishes research on cancer and tumour biology.'] });
    assert.equal(r?.category, 'ONCOLOGY');
    assert.ok(subjectMatchScore('ONCOLOGY', { scope: ['cancer'] }) > 0);
  });
  it('refines a stored category with page facts but keeps a user category not in the ranks', () => {
    const base: any = { journalName: 'Journal X', aimsAndScopeSummary: 'Cancer research', jcrQuartile: 'Q1', jcrQuartileCategory: 'GENETICS & HEREDITY', jifRanks: oncogeneRanks };
    assert.equal(refineQuartileCategory(base).jcrQuartileCategory, 'ONCOLOGY');
    assert.equal(quartileCategory(base), 'ONCOLOGY');
    assert.equal(refineQuartileCategory({ ...base, jcrQuartileCategory: 'My Field' }).jcrQuartileCategory, 'My Field');
  });
});

describe('Chinese quartile line', () => {
  const zhFacts: any = { ...facts };
  it('names the English category, fits, never truncates', () => {
    const facts = zhFacts;
    const line = zhQuartileLine(facts, 90);
    assert.equal(line, '据 Clarivate JCR 2025，本刊位列 Information Science & Library Science 学科 Q1 分区。');
    const short = zhQuartileLine(facts, 30);
    assert.ok(short === null || short.length <= 30);
    assert.equal(zhQuartileLine({ ...facts, jcrQuartileCategory: 'X'.repeat(200), jifRanks: [] }, 30), null);
  });
});
