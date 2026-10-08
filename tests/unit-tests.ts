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
import { runLandingPageTests } from './landing-page';

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
    url: 'https://www.nature.com/nature',
    journalName: 'Nature',
    publisher: 'Nature Portfolio',
    impactFactor: 50.5,
    casZone: '中科院1区 Top',
    firstDecisionDays: 32,
    indexing: ['SCIE'],
    sourceAttribution: 'Clarivate JCR',
    verificationStatus: 'source_verified',
  };

  const testCampaign: GeneratedAdCampaign = {
    funnelStage: 'CON',
    clarivateFacts: mockFacts,
    funnelStrategyNote: 'Test',
    primaryCta: 'Check journal fit',
    recommendedDestination: {
      label: 'Scope',
      url: 'https://www.nature.com/nature/about',
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
    sourceAttribution: 'Clarivate JCR',
    verificationStatus: 'source_verified',
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

  // source_verified rows record Clarivate provenance, confidence 0.95, and quality notes
  assert(lines[1].includes('Clarivate IF 6.9 (2024, source_verified)'), 'Fact Provenance should cite the impact factor and verification status');
  assert(lines[1].includes('"0.95"'), 'source_verified confidence should be 0.95');
  assert(lines[1].includes('Source-grounded via Clarivate JCR & Web of Science'), 'Quality Notes should describe source-verified metrics');

  // Check row count (2 English + 1 Chinese keywords = 3 data rows)
  assert.strictEqual(lines.length, 4, 'CSV must contain 1 header line and 3 keyword rows');

  // Check derived display URL
  const displayUrl = deriveDisplayUrl('https://www.nature.com/aps/about');
  assert.strictEqual(displayUrl, 'nature.com/aps/about', 'Display URL should derive domain and first 2 path segments');

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

await runLandingPageTests();

console.log('\n=======================================');
console.log('ALL TEST SUITES PASSED WITHOUT ERRORS');
console.log('=======================================\n');
