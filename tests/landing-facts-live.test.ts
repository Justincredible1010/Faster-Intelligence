import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  cleanFinalUrl, extractLandingPageFacts, fetchLandingPage, indexedIn, prioritiseIndexing,
} from '../src/utils/landingPage';
import { checkFaithfulness } from '../src/utils/faithfulness';
import { guardAdCopy } from '../src/utils/metricClaims';

const dir = join(process.cwd(), 'tests/fixtures/landing-pages/live-2026-11');
const page = (name: string) => readFileSync(join(dir, `${name}.html`), 'utf8');

describe('live Springer/BMC fixtures (captured 2026-11)', () => {
  it('extracts the indexing list with high-value databases first', () => {
    const list = indexedIn(page('bmcmedicine_biomedcentral_com_'));
    assert.ok(list.length > 10, `got ${list.length}`);
    assert.ok(list.some((x) => /Science Citation Index Expanded|SCIE/i.test(x)));
    assert.ok(list.some((x) => /Scopus/i.test(x)));
    const sci = list.findIndex((x) => /Science Citation Index Expanded|SCIE/i.test(x));
    assert.ok(sci >= 0 && sci < 3, 'SCIE should be near the front');
  });

  it('prioritiseIndexing orders SCIE before Scopus before the rest', () => {
    assert.deepEqual(prioritiseIndexing(['Zoo Index', 'Scopus', 'Science Citation Index Expanded (SCIE)']).slice(0, 2),
      ['Science Citation Index Expanded (SCIE)', 'Scopus']);
  });

  it('extracts days, provenance and skips "View all" article-type junk', () => {
    const url = 'https://link.springer.com/journal/12916?error=cookies_not_supported&code=REDACTED';
    const facts = extractLandingPageFacts(page('bmcmedicine_biomedcentral_com_'), url) as any;
    assert.equal(facts.firstDecisionDays?.value, 3);
    assert.equal(facts.firstDecisionDays?.sourceUrl, 'https://link.springer.com/journal/12916');
    assert.ok(facts.firstDecisionDays?.evidence, 'evidence snippet');
    const types: string[] = facts.articleTypes?.value || [];
    assert.ok(!types.some((t) => /view all|^articles$/i.test(t)), types.join(','));
    assert.ok((facts.indexedIn?.value || []).length > 10);
  });

  for (const [name, days] of [['www_springer_com_journal_10551', 19], ['link_springer_com_journal_11192', 26], ['bmcpublichealth_biomedcentral_com_', 5], ['www_springer_com_journal_10845', 8]] as const) {
    it(`reads first-decision days from ${name}`, () => {
      const facts = extractLandingPageFacts(page(name), 'https://link.springer.com/journal/x') as any;
      assert.equal(facts.firstDecisionDays?.value, days);
    });
  }

  it('cleanFinalUrl strips cookie-handshake and tracking params only', () => {
    assert.equal(cleanFinalUrl('https://link.springer.com/journal/12916?error=cookies_not_supported&code=abc'), 'https://link.springer.com/journal/12916');
    assert.equal(cleanFinalUrl('https://x.org/j?utm_source=a&id=3#top'), 'https://x.org/j?id=3');
    assert.equal(cleanFinalUrl('https://x.org/j?error=other&code=1'), 'https://x.org/j?error=other&code=1');
  });
});

describe('cookie handshake redirects', () => {
  it('follows idp round-trip back to the same URL once cookies are set', async () => {
    const start = 'https://link.springer.com/journal/12916';
    const calls: string[] = [];
    const httpGet = async (url: URL, _t: number, _ip?: string, _s?: AbortSignal, cookie?: string) => {
      calls.push(`${url.href}|${cookie || ''}`);
      if (url.hostname === 'link.springer.com' && !cookie) {
        return { status: 303, headers: { location: 'https://idp.springer.com/authorize?redirect_uri=x' }, body: '' };
      }
      if (url.hostname === 'idp.springer.com') {
        return { status: 302, headers: { location: start, 'set-cookie': ['sid=1; Domain=.springer.com; Path=/'] }, body: '' };
      }
      return { status: 200, headers: { 'content-type': 'text/html' }, body: '<html><title>ok</title></html>' };
    };
    const res = await fetchLandingPage(start, { httpGet, resolveHost: async () => ['93.184.216.34'] });
    assert.equal(res.finalUrl, start);
    assert.match(res.html, /ok/);
    assert.equal(calls.length, 3);
  });
});

describe('checkFaithfulness', () => {
  const facts: any = {
    journalName: 'BMC Medicine', aimsAndScopeSummary: 'Outstanding research in medicine.',
    indexing: ['Scopus'], firstDecisionDays: 3, verificationStatus: 'page_sourced', jcrQuartile: 'Q2',
  };
  it('accepts wording grounded in the record', () => {
    assert.equal(checkFaithfulness('BMC Medicine: indexed in Scopus', facts).ok, true);
    assert.equal(checkFaithfulness('Median 3 Days to 1st Decision', facts).ok, true);
  });
  it('rejects invented numbers, indexing, superlatives and publishers (EN/ZH/JA)', () => {
    assert.equal(checkFaithfulness('Decision in 14 days', facts).ok, false);
    assert.equal(checkFaithfulness('SCIE-indexed journal', facts).ok, false);
    assert.equal(checkFaithfulness('The world\'s leading medical journal', facts).ok, false);
    assert.equal(checkFaithfulness('顶级期刊，SCI收录', facts).ok, false);
    assert.equal(checkFaithfulness('審査期間は１４日', facts).ok, false);
    assert.equal(checkFaithfulness('Better than Elsevier titles', facts).ok, false);
    assert.equal(checkFaithfulness('JCR Q1 journal', facts).ok, false);
  });
  it('guardAdCopy drops a drifted headline instead of truncating it', () => {
    const out: any = guardAdCopy({ searchAds: { headlines: [{ text: 'BMC Medicine Research' }, { text: 'The best journal of 2019' }] } } as any, facts);
    const text = JSON.stringify(out.searchAds.headlines);
    assert.ok(out.metricClaimFlags.length > 0);
    assert.match(text, /BMC Medicine Research/);
    assert.doesNotMatch(text, /best journal/);
  });
});
