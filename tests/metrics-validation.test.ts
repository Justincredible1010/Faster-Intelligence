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
    sourceAttribution: 'Manually supplied by user (User Verified)',
    verificationStatus: 'user_provided',
    reportingYear: 'User Provided (2025/2026)',
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
    assert.equal('verificationStatus' in facts, false);
    assert.equal('isVerifiedClarivate' in facts, false);
  });

  it('rejects unknown fields, prototype keys, and wrong types', () => {
    expectReject({ facts: validFacts({ evil: true }) }, /Unknown journal metric fields: evil/);
    expectReject({ facts: validFacts(), extra: true }, /only a facts object/);
    expectReject({ facts: validFacts({ impactFactor: '4.2' }) }, /impactFactor must be a finite number/);
    expectReject({ facts: validFacts({ impactFactor: 900 }) }, /out of range/);
    expectReject({ facts: validFacts({ firstDecisionDays: 1.5 }) }, /integer/);
    expectReject({ facts: validFacts({ chinaWaiverAvailable: 'yes' }) }, /boolean/);
    expectReject({ facts: validFacts({ verificationStatus: 'source_verified' }) }, /verificationStatus/);
    expectReject({ facts: validFacts({ isVerifiedClarivate: true }) }, /isVerifiedClarivate/);
    expectReject({ facts: validFacts({ url: 'javascript:alert(1)' }) }, /http/);
    expectReject({ facts: validFacts({ journalName: '' }) }, /journalName/);
    expectReject(
      { facts: { ...validFacts(), constructor: { prototype: { admin: true } } } },
      /Unknown journal metric fields/
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
