import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSitelinks, japaneseHeadlines, localizedCallouts, SITELINK_DESC_MAX, SITELINK_TEXT_MAX, CALLOUT_MAX } from '../src/server/localizedCopy';
import { applyDatabaseUpdate, sanitizeDatabaseRecord, withClarivateMetrics, MetricsDatabaseError } from '../src/server/metricsDatabase';
import { applyPlaybookUpdate, defaultPlaybook, PlaybookValidationError } from '../src/server/playbook';
import { resolveBuildInfo } from '../src/utils/buildInfo';
import { versionLabel } from '../src/components/VersionBadge';
import { countCharacterWidth, JAPANESE_KANA_REGEX } from '../src/utils/textUtils';
import { generateBulkGoogleAdsEditorCsv } from '../src/utils/csvExporter';

delete process.env.CLARIVATE_API_KEY;
delete process.env.GEMINI_API_KEY;

const STAGES = ['AWA', 'CON', 'DEC'] as const;
const facts = { journalName: 'Nature Communications', publisher: 'Nature Portfolio', primaryDiscipline: 'Multidisciplinary' };

describe('AI Studio port: sitelinks', () => {
  for (const language of ['EN', 'ZH', 'JA', 'all'] as const) {
    it(`keeps ${language} sitelinks within Google limits and uses only resolved URLs`, () => {
      for (const stage of STAGES) {
        const links = buildSitelinks(stage, language, (role) => `https://www.nature.com/ncomms#${role}`);
        assert.ok(links.length > 0 && links.length <= 4);
        for (const l of links) {
          assert.ok(countCharacterWidth(l.text) <= SITELINK_TEXT_MAX, l.text);
          assert.ok(countCharacterWidth(l.description1) <= SITELINK_DESC_MAX, l.description1);
          assert.ok(countCharacterWidth(l.description2) <= SITELINK_DESC_MAX, l.description2);
          assert.match(l.finalUrl, /^https:\/\/www\.nature\.com\/ncomms#/);
          assert.equal(l.urlPath, l.finalUrl);
        }
      }
    });
  }
});

describe('AI Studio port: Japanese and Chinese copy', () => {
  it('writes Japanese headlines with kana, within 30 width, without unverified metrics', () => {
    for (const stage of STAGES) {
      const hs = japaneseHeadlines(facts, stage, { jifClaim: null, firstDecisionDays: null });
      assert.equal(hs.length, 15);
      for (const h of hs) assert.ok(countCharacterWidth(h.text) <= 30, h.text);
      const kana = hs.filter((h) => (h.text.match(JAPANESE_KANA_REGEX) || []).length > 0);
      assert.ok(kana.length >= 10, `${stage} should be mostly kana-bearing Japanese`);
      assert.doesNotMatch(hs.map((h) => h.text).join(' '), /IF|インパクトファクター\s*\d|日以内|最速|世界最高/);
    }
  });

  it('cites an impact factor or decision time only when a trusted value is passed', () => {
    const none = japaneseHeadlines(facts, 'CON', { jifClaim: null, firstDecisionDays: null }).map((h) => h.text).join('|');
    assert.doesNotMatch(none, /(?:平均|中央値)\d+日/);
    const some = japaneseHeadlines(facts, 'CON', { jifClaim: 'JCR 2024 IF 15.7', firstDecisionDays: 9 }).map((h) => h.text).join('|');
    assert.match(some, /JCR 2024 IF 15\.7/);
    // Neutral wording unless the figure is the landing page's reported median.
    assert.match(some, /約9日/);
    assert.doesNotMatch(some, /中央値/);
    const median = japaneseHeadlines(facts, 'CON', { jifClaim: null, firstDecisionDays: 9, decisionDaysIsMedian: true }).map((h) => h.text).join('|');
    assert.match(median, /中央値9日/);
  });

  it('keeps localized callouts within 25 width and adds no fallback claims', () => {
    for (const language of ['ZH', 'JA'] as const) {
      for (const stage of STAGES) {
        const cs = localizedCallouts(stage, language, facts, { jifClaim: null, firstDecisionDays: null });
        assert.ok(cs.length > 0);
        for (const c of cs) assert.ok(countCharacterWidth(c) <= CALLOUT_MAX, c);
        assert.doesNotMatch(cs.join('|'), /SCIE|迅速|Q1|IF/);
      }
    }
  });
});

describe('AI Studio port: metrics database model', () => {
  const raw = {
    journalId: 'nature',
    journalName: 'Nature',
    publisher: 'Nature Portfolio',
    canonicalUrl: 'https://www.nature.com',
    metrics: {
      impactFactor: { value: 56.1, source: 'Clarivate Journal Citation Reports API', status: 'verified' },
      jcrQuartile: { value: 'Q1', source: 'Clarivate', status: 'verified' },
      apcUsd: { value: 11690, source: 'APC schedule', status: 'verified' },
      casZone: { value: '1区', status: 'verified' },
    },
  };

  it('drops hand-entered Clarivate values and downgrades supplementary ones', () => {
    const r = sanitizeDatabaseRecord(raw)!;
    assert.equal(r.metrics.impactFactor.value, null);
    assert.equal(r.metrics.jcrQuartile.value, null);
    assert.equal(r.metrics.apcUsd.value, 11690);
    assert.notEqual(r.metrics.apcUsd.status, 'verified');
    assert.equal(r.metrics.casZone.value, null, 'a value without a source is dropped');
  });

  it('fills IF and quartile only from a Clarivate API record', () => {
    const r = sanitizeDatabaseRecord(raw)!;
    const merged = withClarivateMetrics(r, { impactFactor: 48.5, jcrQuartile: 'Q1', jcrYear: 2024 } as any, '2026-07-01T00:00:00Z');
    assert.equal(merged.metrics.impactFactor.value, 48.5);
    assert.equal(merged.metrics.impactFactor.status, 'verified');
    assert.match(merged.metrics.impactFactor.source, /Clarivate/);
    assert.equal(withClarivateMetrics(r, null).metrics.impactFactor.value, null);
  });

  it('rejects edits to Clarivate-only fields', () => {
    assert.throws(() => applyDatabaseUpdate(null, { canonicalUrl: 'https://www.nature.com', metrics: { impactFactor: { value: 1 } } }, 'a@springernature.com'), MetricsDatabaseError);
    assert.throws(() => applyDatabaseUpdate(null, { canonicalUrl: 'http://www.nature.com' }, 'a@springernature.com'), MetricsDatabaseError);
  });
});

describe('AI Studio port: playbook', () => {
  it('validates input and sets the editor on the server', () => {
    const next = applyPlaybookUpdate(defaultPlaybook(), { customPromptInstructions: 'x', modifiedBy: 'spoof', evil: 1 }, 'me@springernature.com', new Date('2026-11-03T00:00:00Z'));
    assert.equal(next.modifiedBy, 'me@springernature.com');
    assert.equal(next.lastModified, '2026-11-03T00:00:00.000Z');
    assert.equal((next as any).evil, undefined);
    assert.throws(() => applyPlaybookUpdate(defaultPlaybook(), { brandRules: 'x' }, 'me'), PlaybookValidationError);
    assert.throws(() => applyPlaybookUpdate(defaultPlaybook(), [], 'me'), PlaybookValidationError);
  });
});

describe('footer version badge', () => {
  it('uses env SHA, falls back to git, then unknown', () => {
    const now = new Date('2026-11-03T12:00:00Z');
    assert.deepEqual(resolveBuildInfo({ APP_COMMIT_SHA: 'ABCDEF1234567' }, now, () => null), { commit: 'abcdef1', buildDate: '2026-11-03' });
    assert.equal(resolveBuildInfo({}, now, () => '0123456789abcdef').commit, '0123456');
    assert.equal(resolveBuildInfo({}, now, () => null).commit, 'unknown');
    assert.match(versionLabel('abcdef1', '2026-11-03'), /abcdef1/);
  });
});

describe('bulk CSV', () => {
  it('returns one header for an empty list', () => {
    const csv = generateBulkGoogleAdsEditorCsv([]);
    assert.equal(csv.split('\n').length <= 1, true);
  });
});
