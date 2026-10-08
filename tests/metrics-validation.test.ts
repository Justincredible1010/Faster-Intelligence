import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MetricsValidationError, validateJournalMetricsUpdate } from '../src/server/metricsValidation';

function validFacts(overrides: Record<string, unknown> = {}) {
  return {
    url: 'https://www.nature.com/example-journal',
    journalName: 'Example Journal',
    publisher: 'Nature Portfolio',
    impactFactor: 4.2,
    fiveYearImpactFactor: 4.5,
    jcrQuartile: 'Q1',
    casZone: '中科院1区',
    firstDecisionDays: 28,
    indexing: ['SCIE', 'Scopus'],
    openAccessType: 'Hybrid Open Access',
    apcUsd: 3200,
    chinaWaiverAvailable: false,
    aimsAndScopeSummary: 'Peer-reviewed research.',
    primaryDiscipline: 'Biology',
    sourceAttribution: 'editor@springernature.com',
    verificationStatus: 'user_provided',
    reportingYear: 'User Provided (2025/2026)',
    jcrYear: 2024,
    isVerifiedClarivate: false,
    missingFields: [],
    ...overrides,
  };
}

function expectReject(body: unknown, pattern: RegExp): void {
  assert.throws(() => validateJournalMetricsUpdate(body), (err: unknown) => {
    assert.ok(err instanceof MetricsValidationError);
    assert.match(err.message, pattern);
    return true;
  });
}

describe('journal metrics schema', () => {
  it('accepts the manual-journal payload and drops client verification flags from the stored shape', () => {
    const facts = validateJournalMetricsUpdate({ facts: validFacts() });
    assert.equal(facts.journalName, 'Example Journal');
    assert.equal(facts.impactFactor, 4.2);
    assert.equal(facts.casZone, '中科院1区');
    assert.deepEqual(facts.indexing, ['SCIE', 'Scopus']);
    assert.equal(facts.verificationStatus, 'user_provided');
    assert.equal(facts.provenanceSource, 'user_provided');
    assert.equal(facts.isVerifiedClarivate, false);
    assert.equal(facts.jcrYear, 2024);
    assert.equal(facts.sourceAttribution, 'Manually entered (unverified)');
    assert.equal(facts.reportingYear, 'JCR 2024');
    assert.equal(facts.sourceAttribution.includes('@'), false);
  });

  it('rejects unknown fields, prototype keys, and wrong types', () => {
    expectReject({ facts: validFacts({ evil: true }) }, /Unknown journal metric fields: evil/);
    expectReject({ facts: validFacts(), extra: true }, /only a facts object/);
    expectReject({ facts: validFacts({ impactFactor: '4.2' }) }, /impactFactor must be a finite number/);
    expectReject({ facts: validFacts({ impactFactor: 900 }) }, /out of range/);
    expectReject({ facts: validFacts({ firstDecisionDays: 1.5 }) }, /integer/);
    expectReject({ facts: validFacts({ chinaWaiverAvailable: 'yes' }) }, /boolean/);
    expectReject({ facts: validFacts({ verificationStatus: 'source_verified' }) }, /verificationStatus/);
    expectReject({ facts: validFacts({ provenanceSource: 'invented' }) }, /provenanceSource/);
    expectReject({ facts: validFacts({ isVerifiedClarivate: 'yes' }) }, /isVerifiedClarivate/);
    expectReject({ facts: validFacts({ url: 'javascript:alert(1)' }) }, /http/);
    expectReject({ facts: validFacts({ journalName: '' }) }, /journalName/);
    expectReject({ facts: validFacts({ jcrYear: undefined }) }, /jcrYear/);
    expectReject({ facts: validFacts({ jcrYear: '2024' }) }, /jcrYear/);
    expectReject({ facts: validFacts({ jcrYear: 24 }) }, /jcrYear/);
    expectReject({ facts: validFacts({ jcrYear: 1899 }) }, /jcrYear/);
    expectReject({ facts: validFacts({ jcrYear: 10000 }) }, /jcrYear/);
    expectReject({ facts: validFacts({ jcrYear: 2024.5 }) }, /jcrYear/);
    expectReject(
      { facts: { ...validFacts(), constructor: { prototype: { admin: true } } } },
      /Unknown journal metric fields/
    );
  });

  it('forces user-entered provenance when the client sends a Clarivate label', () => {
    const facts = validateJournalMetricsUpdate({
      facts: validFacts({
        verificationStatus: 'clarivate_api',
        provenanceSource: 'clarivate_wos_journals_api',
        isVerifiedClarivate: true,
        retrievedAt: '2024-06-01T00:00:00.000Z',
        wosJournalId: 'NATURE',
        issn: '0028-0836',
        catalogDataYear: 2024,
        jifRanks: [{ category: 'Multidisciplinary', quartile: 'Q1' }],
      }),
    });
    assert.equal(facts.verificationStatus, 'user_provided');
    assert.equal(facts.provenanceSource, 'user_provided');
    assert.equal(facts.isVerifiedClarivate, false);
    assert.equal(facts.issn, '0028-0836');
    assert.equal('retrievedAt' in facts, false);
    assert.equal('wosJournalId' in facts, false);
    assert.equal(facts.sourceAttribution, 'Manually entered (unverified)');
  });

  it('drops known read-only server fields and still rejects unknown ones', () => {
    const facts = validateJournalMetricsUpdate({
      facts: validFacts({
        slugs: ['nature'],
        isFromCache: true,
        cachedAt: '2026-01-01T00:00:00.000Z',
        cacheExpiresAt: '2026-04-01T00:00:00.000Z',
        extractedFacts: { rawConfidenceAverage: 1 },
        provenanceMap: { impactFactor: { source: 'server', confidence: 1 } },
        submissionPortalUrl: 'https://www.nature.com/submit',
        authorGuidelinesUrl: 'https://www.nature.com/guide',
        articleDownloads: 349945839,
        fullTextViews: 1200,
        retrievedAt: '2024-06-01T00:00:00.000Z',
      }),
    });
    assert.equal(facts.journalName, 'Example Journal');
    assert.equal(facts.jcrYear, 2024);
    assert.equal('slugs' in facts, false);
    assert.equal('isFromCache' in facts, false);
    assert.equal('cachedAt' in facts, false);
    assert.equal('cacheExpiresAt' in facts, false);
    assert.equal('extractedFacts' in facts, false);
    assert.equal('articleDownloads' in facts, false);
    assert.equal('fullTextViews' in facts, false);
    assert.equal('retrievedAt' in facts, false);
    expectReject({ facts: validFacts({ downloadDate: '2025-01-01' }) }, /Unknown journal metric fields: downloadDate/);
    expectReject(
      { facts: validFacts({ slugs: ['nature'], cacheExpiresAt: '2026-01-01', notAField: true }) },
      /Unknown journal metric fields: notAField/
    );
  });

  it('allows null metrics but not strings that only look numeric', () => {
    const facts = validateJournalMetricsUpdate({
      facts: validFacts({ impactFactor: null, apcUsd: null, casZone: null }),
    });
    assert.equal(facts.impactFactor, null);
    assert.equal(facts.apcUsd, null);
    assert.equal(facts.casZone, null);
  });
});
