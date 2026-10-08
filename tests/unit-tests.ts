import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  countCharacterWidth,
  validateLanguagePurity,
  smartClampWithWidth,
  cleanStrayCharacters,
} from '../src/utils/textUtils';
import { loadMetricsCacheFromDisk } from '../src/utils/metricsCache';
import { runComplianceAudit, autoFixComplianceIssues } from '../src/utils/complianceValidator';
import { generateGoogleAdsEditorCsv, deriveDisplayUrl } from '../src/utils/csvExporter';
import { GeneratedAdCampaign, ClarivateJournalMetrics } from '../src/types';

console.log('--- RUNNING ADENGINE UNIT TEST SUITE ---');

// TEST SUITE 1: Character Counting & CJK Double-Width
console.log('\n[Test Suite 1] Character Counting & CJK Double-Width...');
{
  // 1. Pure English
  const enText = 'Nature Research';
  assert.strictEqual(countCharacterWidth(enText), 15, 'English text should count 1 unit per character');

  // 2. Pure Chinese (4 characters = 8 visual width units)
  const zhText = '科学前沿';
  assert.strictEqual(countCharacterWidth(zhText), 8, 'Chinese text should count 2 units per character');

  // 3. Mixed English and Chinese
  // "Nature (自然期刊)" = 6 (Nature) + 1 ( ) + 1 (() + 4*2 (自然期刊) + 1 ()) = 17 width
  const mixedText = 'Nature (自然期刊)';
  assert.strictEqual(countCharacterWidth(mixedText), 17, 'Mixed text should accurately sum 1 per ASCII and 2 per CJK');

  // 4. Clamping to 30 visual width without mid-word bisection
  const longEn = 'Exploring Advanced Multidisciplinary Scientific Breakthroughs';
  const clampedEn = smartClampWithWidth(longEn, 30);
  assert(countCharacterWidth(clampedEn) <= 30, 'Clamped English must be <= 30 visual width');
  assert(!clampedEn.endsWith(' '), 'Clamped English must not have trailing whitespace');
  assert(!/[-,;.]+$/.test(clampedEn), 'Clamped English must clean trailing punctuation');

  const longZh = '探索全球前沿科学突破与跨学科最新研究成果指南';
  const clampedZh = smartClampWithWidth(longZh, 30);
  assert(countCharacterWidth(clampedZh) <= 30, 'Clamped Chinese must be <= 30 visual width (<= 15 CJK chars)');

  console.log('✓ Test Suite 1 Passed: Character widths correctly calculated.');
}

// TEST SUITE 2: Language Purity Verification
console.log('\n[Test Suite 2] Language Purity Verification...');
{
  // 1. Valid EN
  const pureEn = 'Explore peer-reviewed scientific discoveries.';
  const resEn = validateLanguagePurity(pureEn, 'EN');
  assert.strictEqual(resEn.valid, true, 'Pure English should pass EN purity check');
  assert.strictEqual(resEn.strayChars.length, 0);

  // 2. Invalid EN (contains Chinese)
  const contaminatedEn = 'Explore Nature 自然期刊 discoveries.';
  const resContamEn = validateLanguagePurity(contaminatedEn, 'EN');
  assert.strictEqual(resContamEn.valid, false, 'English with Chinese characters must fail EN purity check');
  assert(resContamEn.strayChars.includes('自'), 'Should detect stray character');

  // 3. Clean stray from contaminated EN
  const cleanedEn = cleanStrayCharacters(contaminatedEn, 'EN');
  assert.strictEqual(validateLanguagePurity(cleanedEn, 'EN').valid, true, 'Cleaned text must pass purity');

  // 4. Valid ZH
  const pureZh = '查阅期刊学术定位与论文成果，了解投稿指南。';
  const resZh = validateLanguagePurity(pureZh, 'ZH');
  assert.strictEqual(resZh.valid, true, 'Pure Chinese must pass ZH purity check');

  // 5. Invalid ZH (contains Latin letters)
  const contaminatedZh = '查阅期刊 Scope 与投稿指南。';
  const resContamZh = validateLanguagePurity(contaminatedZh, 'ZH');
  assert.strictEqual(resContamZh.valid, false, 'Chinese with Latin letters must fail ZH purity check');

  console.log('✓ Test Suite 2 Passed: Language purity validation functions as intended.');
}

// TEST SUITE 3: Google Ads Policy Compliance Audit
console.log('\n[Test Suite 3] Policy Compliance & Trademark Audit...');
{
  const mockFacts: ClarivateJournalMetrics = {
    url: 'https://www.nature.com/',
    journalName: 'Nature',
    publisher: 'Nature Portfolio',
    impactFactor: 50.5,
    casZone: '中科院1区 Top',
    firstDecisionDays: 32,
    indexing: ['SCIE'],
    sourceAttribution: 'Manually supplied by user',
    verificationStatus: 'user_provided',
  };

  const testCampaign: GeneratedAdCampaign = {
    funnelStage: 'CON',
    clarivateFacts: mockFacts,
    funnelStrategyNote: 'Test',
    primaryCta: 'Check journal fit',
    recommendedDestination: {
      label: 'Scope',
      url: 'https://www.nature.com/about',
      description: 'About',
    },
    generationSource: 'template_fallback',
    searchAds: {
      headlines: [
        { text: 'Discover Nature', charCount: 15, sourceFact: 'Fact', language: 'EN' },
        { text: 'The Best Journal Worldwide', charCount: 26, sourceFact: 'Superlative', language: 'EN' }, // Superlative error!
        { text: 'Submit to Cell Alternative', charCount: 26, sourceFact: 'Competitor', language: 'EN' }, // Competitor trademark!
      ],
      descriptions: [
        { text: 'Your paper will be published in 10 days guaranteed.', charCount: 52, sourceFact: 'Misleading', language: 'EN' }, // Misleading claim!
      ],
      sitelinks: [],
      callouts: [],
    },
    keywords: {
      englishSearchKeywords: [{ keyword: 'cell journal comparison', matchType: 'Exact', intent: 'Comp' }],
      chineseAuthorKeywords: [],
      negativeKeywords: [],
    },
  };

  const audit = runComplianceAudit(testCampaign, mockFacts);
  assert(audit.errorsCount >= 2, 'Should flag superlative and misleading acceptance claims as errors');
  assert(audit.warningsCount >= 1, 'Should flag competitor trademark as warning');

  // Test Auto-fix
  const fixed = autoFixComplianceIssues(testCampaign);
  const fixedAudit = runComplianceAudit(fixed, mockFacts);
  assert.strictEqual(fixedAudit.errorsCount, 0, 'Auto-fix must resolve policy errors');

  console.log('✓ Test Suite 3 Passed: Compliance audit successfully flags and auto-fixes violations.');
}

// TEST SUITE 4: Google Ads Editor CSV Schema & URL Derivation
console.log('\n[Test Suite 4] Google Ads Editor CSV Schema...');
{
  const mockFacts: ClarivateJournalMetrics = {
    url: 'https://www.nature.com/aps',
    journalName: 'Acta Pharmacologica Sinica',
    publisher: 'Nature Portfolio',
    impactFactor: 6.9,
    casZone: '中科院医学1区 Top',
    firstDecisionDays: 23,
    indexing: ['SCIE'],
    sourceAttribution: 'Manually supplied by user',
    verificationStatus: 'user_provided',
  };

  const testCampaign: GeneratedAdCampaign = {
    funnelStage: 'AWA',
    clarivateFacts: mockFacts,
    funnelStrategyNote: 'Awareness',
    primaryCta: 'Explore the journal',
    recommendedDestination: {
      label: 'Overview',
      url: 'https://www.nature.com/aps/about',
      description: 'Scope',
    },
    generationSource: 'template_fallback',
    searchAds: {
      headlines: [
        { text: 'Discover Acta Pharmacologica', charCount: 28, sourceFact: 'Name', language: 'EN' },
        { text: 'Pharmacology Research', charCount: 21, sourceFact: 'Scope', language: 'EN' },
        { text: 'Explore the Journal', charCount: 19, sourceFact: 'CTA', language: 'EN' },
      ],
      descriptions: [
        { text: 'Read high-impact pharmacology discoveries.', charCount: 42, sourceFact: 'Scope', language: 'EN' },
        { text: 'Published by Nature Portfolio. Global community.', charCount: 48, sourceFact: 'Publisher', language: 'EN' },
      ],
      sitelinks: [],
      callouts: [],
    },
    keywords: {
      englishSearchKeywords: [
        { keyword: 'pharmacology research articles', matchType: 'Broad', intent: 'Discovery' },
        { keyword: '[acta pharmacologica sinica]', matchType: 'Exact', intent: 'Identity' },
      ],
      chineseAuthorKeywords: [
        { keywordZh: '药理学前沿期刊', matchType: '短语 (Phrase)', intentZh: '阅读' },
      ],
      negativeKeywords: ['代写'],
    },
  };

  const csv = generateGoogleAdsEditorCsv(testCampaign);
  const lines = csv.split('\n').filter(Boolean);

  // Check required headers (Google Ads Editor columns plus provenance fields)
  const expectedHeader = 'Campaign,Ad Group,Keyword,Match Type,Max CPC,Headline 1,Headline 2,Headline 3,Description 1,Description 2,Final URL,Display URL,Fact Provenance,Confidence,Quality Notes';
  assert.strictEqual(lines[0], expectedHeader, 'CSV header must include the 12 editor columns plus Fact Provenance, Confidence, and Quality Notes');
  assert.strictEqual(lines[0].split(',').length, 15, 'CSV header must have 15 columns');

  // user_provided rows cite the number without calling it a Clarivate result
  assert(lines[1].includes('IF 6.9 (user_provided)'), 'Fact Provenance should cite the impact factor and verification status');
  assert(!lines[1].includes('Clarivate'), 'A user-provided impact factor must not be labeled Clarivate');
  assert(lines[1].includes('"0.85"'), 'user_provided confidence should be 0.85');
  assert(lines[1].includes('User-provided metrics; verify before scale'), 'Quality Notes should describe user-provided metrics');

  // Check row count (2 English + 1 Chinese keywords = 3 data rows)
  assert.strictEqual(lines.length, 4, 'CSV must contain 1 header line and 3 keyword rows');

  // Check derived display URL
  const displayUrl = deriveDisplayUrl('https://www.nature.com/aps/about');
  assert.strictEqual(displayUrl, 'nature.com/aps/about', 'Display URL should derive domain and first 2 path segments');

  const homepageDisplayUrl = deriveDisplayUrl('https://www.nature.com/');
  assert.strictEqual(homepageDisplayUrl, 'nature.com', 'A URL with no path segment should display the bare domain');

  console.log('✓ Test Suite 4 Passed: Google Ads Editor CSV format matches exact specifications.');
}

// TEST SUITE 5: Metrics cache loading
console.log('\n[Test Suite 5] Metrics cache loading...');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'metrics-cache-'));
  const originalLog = console.log;
  const originalWarn = console.warn;
  const logs: string[] = [];
  const warns: string[] = [];

  const capture = (run: () => void) => {
    logs.length = 0;
    warns.length = 0;
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(' '));
    };
    console.warn = (...args: unknown[]) => {
      warns.push(args.map((arg) => String(arg)).join(' '));
    };
    try {
      run();
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
    }
  };

  try {
    const missingPath = path.join(dir, 'does-not-exist.json');
    capture(() => {
      const loaded = loadMetricsCacheFromDisk(missingPath);
      assert.strictEqual(loaded.size, 0, 'A missing cache file should load as an empty map');
    });
    assert(logs.some((line) => line.includes('No metrics-cache.json found')), 'Missing file should be logged');
    assert.strictEqual(warns.length, 0, 'A missing file is not a warning');

    const invalidPath = path.join(dir, 'invalid.json');
    fs.writeFileSync(invalidPath, '{not json');
    capture(() => {
      const loaded = loadMetricsCacheFromDisk(invalidPath);
      assert.strictEqual(loaded.size, 0, 'Invalid JSON should load as an empty map');
    });
    assert(warns.some((line) => line.includes('Failed to load cache file')), 'Invalid JSON should be warned and ignored');

    const nonObjects: Array<{ name: string; body: string }> = [
      { name: 'array', body: '[]' },
      { name: 'null', body: 'null' },
      { name: 'string', body: '"paper"' },
      { name: 'number', body: '42' },
    ];
    for (const sample of nonObjects) {
      const samplePath = path.join(dir, `${sample.name}.json`);
      fs.writeFileSync(samplePath, sample.body);
      capture(() => {
        const loaded = loadMetricsCacheFromDisk(samplePath);
        assert.strictEqual(loaded.size, 0, `${sample.name} top level should load as an empty map`);
      });
      assert(
        warns.some((line) => line.includes('not a journal map')),
        `${sample.name} top level should be rejected as a non-object journal map`
      );
    }

    const validPath = path.join(dir, 'valid.json');
    fs.writeFileSync(
      validPath,
      JSON.stringify({
        nature: { journalName: 'Nature' },
        paper: { journalName: 'Example Journal' },
      })
    );
    capture(() => {
      const loaded = loadMetricsCacheFromDisk<{ journalName: string }>(validPath);
      assert.strictEqual(loaded.size, 2, 'A journal map should load every entry');
      assert.strictEqual(loaded.get('nature')?.journalName, 'Nature');
      assert.strictEqual(loaded.get('paper')?.journalName, 'Example Journal');
    });
    assert(logs.some((line) => line.includes('Loaded 2 cached journals')), 'A valid cache file should report how many journals loaded');
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    fs.rmSync(dir, { recursive: true, force: true });
  }

  console.log('✓ Test Suite 5 Passed: Cache loader handles missing, invalid, and non-object files.');
}

// TEST SUITE 6: Canonical URLs, trusted metrics, and claim guard
console.log('\n[Test Suite 6] Canonical URLs and untrusted metric claims...');
{
  const { JOURNAL_CATALOG, CATALOG_DATA_YEAR } = await import('../src/data/journalCatalog.ts');
  const {
    NATURE_HOMEPAGE_URL,
    joinJournalUrl,
    journalUrlsMatch,
    normalizeJournalUrl,
  } = await import('../src/utils/journalUrl.ts');
  const {
    factsForCopy,
    guardAdCopy,
    guardMetricClaims,
    metricPromptSection,
    metricsAreTrusted,
  } = await import('../src/utils/metricClaims.ts');
  const { lookupMetricsByIssn, pageFacts } = await import('../src/utils/metricSources.ts');
  const { generateDeterministicCampaign, lookupClarivateFacts } = await import('../server.ts');

  const homepage = normalizeJournalUrl('https://www.nature.com/');
  const apex = normalizeJournalUrl('nature.com');
  const staleSlug = normalizeJournalUrl('https://www.nature.com/nature');
  assert.strictEqual(homepage.canonical, NATURE_HOMEPAGE_URL);
  assert.strictEqual(homepage.canonical, 'https://www.nature.com');
  assert.strictEqual(homepage.cacheKey, 'host:nature.com');
  assert.strictEqual(apex.cacheKey, homepage.cacheKey);
  assert.strictEqual(journalUrlsMatch(homepage, apex), true);
  assert.strictEqual(staleSlug.cacheKey, 'nature');
  assert.notStrictEqual(staleSlug.cacheKey, homepage.cacheKey);
  assert.strictEqual(journalUrlsMatch(homepage, staleSlug), false);
  assert.strictEqual(
    normalizeJournalUrl('https://example.com/host:nature.com').cacheKey,
    'path:host:nature.com'
  );
  assert.strictEqual(joinJournalUrl('https://www.nature.com/', '/about'), 'https://www.nature.com/about');
  assert.strictEqual(joinJournalUrl('https://www.nature.com/nature', '/about'), 'https://www.nature.com/nature/about');

  const nature = JOURNAL_CATALOG.find((entry) => entry.journalName === 'Nature');
  assert(nature, 'Catalog should include Nature');
  assert.strictEqual(nature.url, 'https://www.nature.com');
  assert.strictEqual(journalUrlsMatch(normalizeJournalUrl(nature.url), staleSlug), false);
  const cacheKeys = JOURNAL_CATALOG.map((entry) => normalizeJournalUrl(entry.url).cacheKey);
  assert.strictEqual(new Set(cacheKeys).size, cacheKeys.length, 'Catalog cache keys must not collide');
  for (const entry of JOURNAL_CATALOG) {
    assert.strictEqual(entry.verificationStatus, 'catalog_snapshot');
    assert.strictEqual(entry.isVerifiedClarivate, false);
    assert.strictEqual(entry.catalogDataYear, CATALOG_DATA_YEAR);
    assert(!/verified via clarivate/i.test(entry.sourceAttribution));
    assert(!entry.url.includes('/nature/nature'));
  }
  assert(!JOURNAL_CATALOG.some((entry) => entry.url.endsWith('/nature')));

  assert.strictEqual(metricsAreTrusted({ verificationStatus: 'catalog_snapshot', journalName: 'Nature', publisher: 'Nature Portfolio', impactFactor: 50.5, sourceAttribution: '' }), false);
  assert.strictEqual(metricsAreTrusted({ verificationStatus: 'missing', journalName: 'Unknown journal', publisher: 'Unknown publisher', impactFactor: null, sourceAttribution: '' }), false);
  assert.strictEqual(metricsAreTrusted({ verificationStatus: 'user_provided', journalName: 'Nature', publisher: 'Nature Portfolio', impactFactor: 6.9, sourceAttribution: '' }), true);
  assert.strictEqual(metricsAreTrusted({ verificationStatus: 'page_sourced', journalName: 'Nature', publisher: 'Nature Portfolio', impactFactor: 6.9, sourceAttribution: '' }), true);
  assert.strictEqual(metricsAreTrusted({ verificationStatus: 'clarivate_api', journalName: 'Nature', publisher: 'Nature Portfolio', impactFactor: 6.9, sourceAttribution: '' }), true);

  const snapshotFacts = factsForCopy(nature);
  assert.strictEqual(snapshotFacts.impactFactor, null);
  assert.strictEqual(snapshotFacts.jcrQuartile, null);
  assert.strictEqual(snapshotFacts.casZone, null);
  assert.strictEqual(snapshotFacts.firstDecisionDays, null);
  assert.deepStrictEqual(snapshotFacts.indexing, []);
  assert.strictEqual(snapshotFacts.journalName, 'Nature');

  const prompt = metricPromptSection(nature);
  assert(!prompt.includes('50.5'));
  assert(!prompt.includes('Clarivate API'));
  assert(prompt.includes('Do not mention Clarivate'));

  const poisoned = guardMetricClaims(
    'Clarivate IF 50.5. Fast 23-Day First Decision. Q1. 中科院1区 Top. APC $11690. Impact factor of 54.3.',
    nature
  );
  assert(!poisoned.text.includes('50.5'));
  assert(!poisoned.text.includes('54.3'));
  assert(!poisoned.text.includes('23'));
  assert(!/Q1/i.test(poisoned.text), `leftover: ${JSON.stringify(poisoned)}`);
  assert(!poisoned.text.includes('1区'));
  assert(!poisoned.text.includes('11690'));
  assert(!/clarivate/i.test(poisoned.text));
  assert(poisoned.flags.length >= 4, 'Each stripped claim should be flagged');

  const trusted = {
    ...nature,
    verificationStatus: 'user_provided' as const,
    isVerifiedClarivate: false,
    impactFactor: 6.9,
    fiveYearImpactFactor: null,
    jcrQuartile: 'Q1',
    casZone: null,
    firstDecisionDays: 23,
    apcUsd: null,
    sourceAttribution: 'Manually supplied by user',
  };
  const kept = guardMetricClaims('IF 6.9 and First Decision in 23 Days. Q1. Clarivate IF 50.5.', trusted);
  assert(kept.text.includes('IF 6.9'));
  assert(kept.text.includes('23 Days'));
  assert(kept.text.includes('Q1'));
  assert(!kept.text.includes('50.5'));
  assert(!/clarivate/i.test(kept.text));

  const snapshotCampaign = generateDeterministicCampaign(nature, 'CON', 'EN');
  const snapshotLines = [
    ...(snapshotCampaign.searchAds?.headlines || []).map((item) => item.text),
    ...(snapshotCampaign.searchAds?.descriptions || []).map((item) => item.text),
    ...(snapshotCampaign.searchAds?.callouts || []),
    snapshotCampaign.displayAds?.shortHeadline,
    snapshotCampaign.displayAds?.longHeadline,
    snapshotCampaign.displayAds?.description,
    snapshotCampaign.displayAds?.bannerHeadlineZh,
    snapshotCampaign.displayAds?.bannerSubtextZh,
    snapshotCampaign.recommendedDestination.url,
  ].join('\n');
  assert.strictEqual(snapshotCampaign.recommendedDestination.url, 'https://www.nature.com/aims-and-scope');
  assert(!snapshotLines.includes('/nature/'));
  assert(!snapshotLines.includes('50.5'));
  assert(!snapshotLines.includes('32'));
  assert(!snapshotLines.includes('11690'));
  assert(!/Q1/.test(snapshotLines));
  assert(!snapshotLines.includes('1区'));
  assert(!/clarivate/i.test(snapshotLines));
  assert(!snapshotLines.includes('SCIE'));

  const trustedCampaign = generateDeterministicCampaign(trusted, 'CON', 'EN');
  const trustedCopy = JSON.stringify(trustedCampaign.searchAds);
  assert(trustedCopy.includes('6.9'));
  assert(trustedCopy.includes('23'));
  assert(!/clarivate/i.test(trustedCopy));

  const guardedAi = guardAdCopy(
    {
      searchAds: {
        headlines: [{ text: 'Clarivate IF 50.5 today' }],
        descriptions: [{ text: 'Fast 23-Day First Decision' }],
        callouts: ['Q1 Top'],
      },
      displayAds: {
        shortHeadline: 'IF 50.5',
        longHeadline: '中科院1区 Top',
        description: 'APC $11690',
        bannerHeadlineZh: '影响因子50.5',
        bannerSubtextZh: '',
      },
      metricClaimFlags: [] as string[],
    },
    nature
  );
  const guardedText = [
    ...(guardedAi.searchAds?.headlines || []).map((item) => item.text),
    ...(guardedAi.searchAds?.descriptions || []).map((item) => item.text),
    ...(guardedAi.searchAds?.callouts || []),
    guardedAi.displayAds?.shortHeadline,
    guardedAi.displayAds?.longHeadline,
    guardedAi.displayAds?.description,
    guardedAi.displayAds?.bannerHeadlineZh,
    guardedAi.displayAds?.bannerSubtextZh,
  ].join('\n');
  assert(!guardedText.includes('50.5'), guardedText);
  assert(!guardedText.includes('23'), guardedText);
  assert(!guardedText.includes('11690'), guardedText);
  assert(!guardedText.includes('1区'), guardedText);
  assert(!/clarivate/i.test(guardedText), guardedText);
  assert((guardedAi.metricClaimFlags || []).length > 0);

  const homeFacts = await lookupClarivateFacts('https://www.nature.com/', true);
  assert.strictEqual(homeFacts.journalName, 'Nature');
  assert.strictEqual(homeFacts.url, 'https://www.nature.com');
  assert.strictEqual(homeFacts.verificationStatus, 'catalog_snapshot');
  assert.strictEqual(normalizeJournalUrl(homeFacts.url).cacheKey, 'host:nature.com');

  const slugFacts = await lookupClarivateFacts('https://www.nature.com/nature', true);
  assert.strictEqual(slugFacts.verificationStatus, 'missing');
  assert.strictEqual(slugFacts.impactFactor, null);
  assert.notStrictEqual(slugFacts.journalName, 'Nature');

  assert.strictEqual(nature.impactFactor, null);
  assert.strictEqual(nature.fiveYearImpactFactor, null);
  const previousClarivateKey = process.env.CLARIVATE_API_KEY;
  delete process.env.CLARIVATE_API_KEY;
  assert.strictEqual(await lookupMetricsByIssn('0028-0836'), null);
  if (previousClarivateKey) process.env.CLARIVATE_API_KEY = previousClarivateKey;
  assert.strictEqual(await pageFacts.extractFromPage('https://www.nature.com'), null);

  const retrievedAt = new Date('2026-10-08T00:00:00.000Z');
  const fromApi = await lookupMetricsByIssn('0028-0836', {
    async searchByIssn(query) {
      assert.strictEqual(query, '0028-0836');
      return { hits: [{ id: 'NATURE' }] };
    },
    async getJournal(id) {
      assert.strictEqual(id, 'NATURE');
      return {
        issn: '0028-0836',
        eIssn: '1476-4687',
        publisher: 'NATURE PORTFOLIO',
        categories: ['Multidisciplinary Sciences'],
        journalCitationReports: [{ year: 2024 }, { year: 2025 }],
      };
    },
    async getYearReport(id, year) {
      assert.strictEqual(id, 'NATURE');
      assert.strictEqual(year, 2025);
      return {
        metrics: {
          impactMetrics: {
            jif: '56.1',
            jif5Years: '60.2',
            immediacyIndex: '11.4',
            jci: '3.2',
          },
        },
        ranks: {
          jif: [{ category: 'Multidisciplinary Sciences', rank: '1/140', quartile: 'Q1', jifPercentile: '99.64' }],
        },
      };
    },
  }, retrievedAt);
  assert(fromApi, 'A Journals API payload should map to metrics');
  assert.strictEqual(fromApi.impactFactor, 56.1);
  assert.strictEqual(fromApi.fiveYearImpactFactor, 60.2);
  assert.strictEqual(fromApi.provenanceSource, 'clarivate_wos_journals_api');
  assert.strictEqual(fromApi.verificationStatus, 'clarivate_api');
  assert.strictEqual(fromApi.isVerifiedClarivate, true);
  assert.strictEqual(fromApi.jcrYear, 2025);
  assert.strictEqual(fromApi.retrievedAt, retrievedAt.toISOString());
  assert.strictEqual(fromApi.wosJournalId, 'NATURE');
  assert.strictEqual(fromApi.jcrQuartile, 'Q1');
  assert.strictEqual(fromApi.jifRanks?.[0]?.rank, '1/140');
  assert.notStrictEqual(fromApi.impactFactor, 50.5);

  const wosCopy = guardMetricClaims('Clarivate IF 56.1. JCR quartile Q1.', fromApi);
  assert(wosCopy.text.includes('56.1'));
  assert(wosCopy.text.includes('Q1'));
  assert(/clarivate/i.test(wosCopy.text));

  const serverSource = fs.readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  assert(!serverSource.includes('academic publishing metrics database'));
  assert(!serverSource.includes('www.nature.com/nature'));
  assert(!serverSource.includes('https://www.nature.com/${'));
  assert(!serverSource.includes('50.5'));

  const srcDir = new URL('../src/', import.meta.url);
  const stack = [srcDir];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = new URL(entry.name + (entry.isDirectory() ? '/' : ''), current);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(ts|tsx)$/.test(entry.name)) {
        const body = fs.readFileSync(full, 'utf8');
        assert(!body.includes('50.5'), `${full.pathname} must not hardcode the stale Nature JIF 50.5`);
      }
    }
  }

  const aps = JOURNAL_CATALOG.find((entry) => entry.journalName === 'Acta Pharmacologica Sinica');
  assert(aps, 'Catalog should include Acta Pharmacologica Sinica');
  const snapshotCsv = generateGoogleAdsEditorCsv({
    funnelStage: 'AWA',
    clarivateFacts: aps,
    funnelStrategyNote: 'Awareness',
    primaryCta: 'Explore the journal',
    recommendedDestination: {
      label: 'Overview',
      url: 'https://www.nature.com/aps/about',
      description: 'Scope',
    },
    generationSource: 'template_fallback',
    searchAds: {
      headlines: [{ text: 'Discover Acta Pharmacologica', charCount: 28, sourceFact: 'Name', language: 'EN' }],
      descriptions: [{ text: 'Read pharmacology research.', charCount: 28, sourceFact: 'Scope', language: 'EN' }],
      sitelinks: [],
      callouts: [],
    },
    keywords: {
      englishSearchKeywords: [{ keyword: 'pharmacology research', matchType: 'Broad', intent: 'Discovery' }],
      chineseAuthorKeywords: [],
      negativeKeywords: [],
    },
  });
  assert(snapshotCsv.includes('No trusted impact factor'));
  assert(!snapshotCsv.includes('6.9'));
  assert(!snapshotCsv.includes('50.5'));
  assert(!/clarivate/i.test(snapshotCsv));

  console.log('✓ Test Suite 6 Passed: URLs stay canonical and untrusted figures stay out of copy.');
}

console.log('\n=======================================');
console.log('ALL 6 TEST SUITES PASSED WITHOUT ERRORS');
console.log('=======================================\n');
