import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkFaithfulness } from '../src/utils/faithfulness';
import { decisionDaysFromLandingPage, guardAdCopy } from '../src/utils/metricClaims';
import { qaCampaignCopy } from '../src/utils/adCopyQa';
import { CookieJar, isPublicSuffixDomain } from '../src/utils/landingPage';
import { localizedCallouts } from '../src/server/localizedCopy';

const facts: any = {
  journalName: 'BMC Medicine', aimsAndScopeSummary: 'Research in medicine.',
  indexing: ['Scopus'], firstDecisionDays: 3, verificationStatus: 'page_sourced',
};

describe('PR #11 review fixes', () => {
  it('replaces a line the guard would cut ("First Decision in") with a complete faithful line', () => {
    const out: any = guardAdCopy({ searchAds: { headlines: [{ text: 'First Decision in 14 Days' }, { text: 'BMC Medicine Research' }, { text: 'Read the Latest Articles' }] } } as any, facts);
    const texts = out.searchAds.headlines.map((h: any) => h.text);
    assert.equal(texts.length, 3);
    assert.ok(!texts.some((t: string) => /Decision in$|^First Decision/.test(t)), texts.join('|'));
    for (const t of texts) assert.ok(checkFaithfulness(t, facts).ok, t);
    assert.ok(out.metricClaimFlags.some((f: string) => /Replaced with/.test(f)));
  });

  it('replacement keeps the language of the dropped line (ZH/JA)', () => {
    const out: any = guardAdCopy({ outputLanguage: 'ZH', searchAds: { headlines: [{ text: '初审仅需14天' }], descriptions: [{ text: '最权威的医学期刊' }] } } as any, facts);
    for (const h of out.searchAds.headlines) assert.match(h.text, /[\u4e00-\u9fa5]|BMC Medicine/);
    assert.ok(out.searchAds.headlines.length >= 3);
    assert.ok(out.searchAds.descriptions.length >= 2);
    const ja: any = guardAdCopy({ searchAds: { headlines: [{ text: '最速の審査で掲載' }] } } as any, facts);
    assert.match(ja.searchAds.headlines[0].text, /[\u3040-\u30ff]|BMC Medicine/);
  });

  it('(1) "3 million" does not pass on an allowed bare 3', () => {
    assert.equal(checkFaithfulness('3 Days to First Decision', facts).ok, true);
    assert.equal(checkFaithfulness('3 million downloads', facts).ok, false);
    assert.equal(checkFaithfulness('3万次下载', facts).ok, false);
  });

  it('(2) keywords skip superlative and publisher checks, ad lines do not', () => {
    const out: any = guardAdCopy({
      searchAds: { headlines: [{ text: 'The best medical journal' }] },
      keywords: { englishSearchKeywords: [{ keyword: 'best medical journals' }, { keyword: 'elsevier vs springer medicine' }], chineseAuthorKeywords: [{ keywordZh: '顶级期刊' }] },
    } as any, facts);
    assert.deepEqual(out.keywords.englishSearchKeywords.map((k: any) => k.keyword), ['best medical journals', 'elsevier vs springer medicine']);
    assert.deepEqual(out.keywords.chineseAuthorKeywords.map((k: any) => k.keywordZh), ['顶级期刊']);
    assert.ok(!out.searchAds.headlines.some((h: any) => /best/i.test(h.text)));
    // Keywords still lose untrusted numbers and indexing claims.
    assert.equal(checkFaithfulness('SCIE medicine journal', facts, { keyword: true }).ok, false);
  });

  it('(3) backfills display fields, replaces sitelink pairs, keeps Google minimums', () => {
    const out: any = guardAdCopy({
      searchAds: {
        headlines: [{ text: 'Q1 leading journal' }], descriptions: [{ text: 'Ranked #1 by Elsevier' }],
        sitelinks: [{ title: 'Submit', desc: 'Decision in 40 days' }, { title: 'Scope', desc: 'Topics we publish' }],
      },
      displayAds: { shortHeadline: 'World-class journal', longHeadline: 'Impact factor 99.9 journal', description: 'Top-ranked research', bannerHeadlineZh: '顶级期刊', bannerSubtextZh: 'SCI收录' },
    } as any, facts);
    assert.ok(out.searchAds.headlines.length >= 3);
    assert.ok(out.searchAds.descriptions.length >= 2);
    for (const link of out.searchAds.sitelinks) assert.ok(link.title && link.desc, JSON.stringify(link));
    assert.equal(out.searchAds.sitelinks[1].title, 'Scope');
    for (const k of ['shortHeadline', 'longHeadline', 'description', 'bannerHeadlineZh', 'bannerSubtextZh']) assert.ok(out.displayAds[k], k);
    assert.match(out.displayAds.bannerHeadlineZh, /[\u4e00-\u9fa5]/);
  });

  it('(3) visible not-ready warning when fewer than 3 headlines / 2 descriptions survive', () => {
    const out: any = qaCampaignCopy({ outputLanguage: 'EN', searchAds: { headlines: [{ text: 'BMC Medicine' }], descriptions: [{ text: 'Read recent research.' }] } });
    assert.equal(out.copyQa.ready, false);
    assert.ok(out.copyQa.issues.some((i: any) => i.field === 'searchAds.headlines' && i.issues.includes('too_few_assets')));
    assert.ok(out.copyQa.issues.some((i: any) => i.field === 'searchAds.descriptions' && i.issues.includes('too_few_assets')));
  });

  it('(4) quartile / CAS zone need trusted metrics', () => {
    const snapshot = { ...facts, verificationStatus: 'catalog_snapshot', jcrQuartile: 'Q1', casZone: '1区' };
    assert.equal(checkFaithfulness('JCR Q1 journal', snapshot).ok, false);
    assert.equal(checkFaithfulness('中科院1区期刊', snapshot).ok, false);
    const api = { ...snapshot, verificationStatus: 'clarivate_api' };
    assert.equal(checkFaithfulness('JCR Q1 journal', api).ok, true);
    assert.equal(checkFaithfulness('中科院1区期刊', api).ok, true);
  });

  it('(5) bare SCI is an indexing claim', () => {
    assert.equal(checkFaithfulness('SCI收录期刊', facts).ok, false);
    assert.equal(checkFaithfulness('SCI期刊 医学', facts).ok, false);
    assert.equal(checkFaithfulness('SCI收录期刊', { ...facts, indexing: ['Science Citation Index Expanded (SCIE)'] }).ok, true);
    assert.equal(checkFaithfulness('Social Science Citation Index journal', { ...facts, indexing: ['SSCI'] }).ok, true);
  });

  it('(6) "median" only for landing-page decision days', () => {
    const page = { ...facts, extractedFacts: { pageMetrics: [{ kind: 'first_decision_days', numericValue: 3 }] } };
    assert.equal(decisionDaysFromLandingPage(page), true);
    assert.equal(decisionDaysFromLandingPage({ ...facts, provenanceMap: { firstDecisionDays: { source: 'page_sourced', confidence: 1 } } }), true);
    assert.equal(decisionDaysFromLandingPage({ ...facts, provenanceMap: { firstDecisionDays: { source: 'clarivate_api', confidence: 1 } } }), false);
    assert.equal(decisionDaysFromLandingPage({ ...facts, verificationStatus: 'user_provided' }), false);
    const neutral = localizedCallouts('CON', 'JA', {}, { jifClaim: null, firstDecisionDays: 3 }).join('|');
    assert.match(neutral, /約3日/);
    assert.doesNotMatch(neutral, /中央値/);
    assert.match(localizedCallouts('CON', 'JA', {}, { jifClaim: null, firstDecisionDays: 3, decisionDaysIsMedian: true }).join('|'), /中央値3日/);
  });

  it('(7) cookie jar rejects public-suffix / bare-TLD Domain attributes', () => {
    assert.equal(isPublicSuffixDomain('com'), true);
    assert.equal(isPublicSuffixDomain('co.uk'), true);
    assert.equal(isPublicSuffixDomain('springer.com'), false);
    const jar = new CookieJar();
    jar.store(new URL('https://idp.springer.com/x'), ['a=1; Domain=.com', 'b=2; Domain=springer.com', 'c=3; Domain=evil.org']);
    jar.store(new URL('https://journal.example.co.uk/x'), ['d=4; Domain=co.uk']);
    assert.equal(jar.header(new URL('https://other.com/')), undefined);
    assert.equal(jar.header(new URL('https://link.springer.com/')), 'b=2');
    assert.equal(jar.header(new URL('https://evil.org/')), undefined);
    assert.equal(jar.header(new URL('https://bbc.co.uk/')), undefined);
  });
});
