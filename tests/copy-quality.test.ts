import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  balanceBrackets,
  brandTermsFor,
  cleanStrayCharacters,
  countCharacterWidth,
  safeShorten,
  shortenName,
  unbalancedMarks,
  validateLanguagePurity,
} from '../src/utils/textUtils';
import { checkAdText, finalizeAdText, qaCampaignCopy } from '../src/utils/adCopyQa';
import { buildStructuredSnippet } from '../src/server/localizedCopy';
import { plainKeyword } from '../src/utils/csvExporter';
import { formatLandingPagePromptSection } from '../src/utils/landingPage';
import { getVerifiedPageFacts, sanitizeVerifiedKinds, setPageFactVerified } from '../src/utils/verifiedPageFacts';

describe('review fixes', () => {
  it('JA purity keeps Latin journal names and brand terms', () => {
    const terms = brandTermsFor({ journalName: 'Scientific Reports', publisher: 'Springer Nature' });
    const text = 'Scientific Reports は Springer Nature の査読付き誌、APC あり';
    assert.equal(validateLanguagePurity(text, 'JA', terms).valid, true);
    assert.equal(cleanStrayCharacters(text, 'JA', terms), text);
    const stray = 'Scientific Reports で submit しよう';
    assert.equal(validateLanguagePurity(stray, 'JA', terms).valid, false);
    assert.equal(cleanStrayCharacters(stray, 'JA', terms), 'Scientific Reports で しよう');
  });

  it('JA/ZH clean does not leave half brackets', () => {
    const out = cleanStrayCharacters('「Open Access」論文', 'JA', brandTermsFor(null));
    assert.deepEqual(unbalancedMarks(out), []);
  });

  it('keywords CSV strips brackets and quotes in every language', () => {
    assert.equal(plainKeyword('[nature communications]'), 'nature communications');
    assert.equal(plainKeyword('"nature 投稿"'), 'nature 投稿');
    assert.equal(plainKeyword('「ネイチャー 投稿」'), 'ネイチャー 投稿');
    assert.equal(plainKeyword('［自然通讯］'), '自然通讯');
  });

  it('ZH/JA structured snippets have >= 3 values, and too few values omit the snippet', () => {
    for (const lang of ['ZH', 'JA'] as const) {
      const s = buildStructuredSnippet({ primaryDiscipline: 'Biology', publisher: 'Springer Nature' }, lang)!;
      assert.ok(s.values.length >= 3);
      for (const v of s.values) assert.equal(/[a-zA-Z]/.test(v), false, v);
    }
    assert.equal(buildStructuredSnippet({ primaryDiscipline: '', publisher: '' }, 'EN'), undefined);
  });

  it('no springerlink.com URLs remain in placement data', async () => {
    const fs = await import('node:fs');
    for (const f of ['server.ts', 'src/server/localizedCopy.ts']) {
      assert.equal(/springerlink\.com/.test(fs.readFileSync(f, 'utf-8')), false, f);
    }
  });
});

describe('safe shortening', () => {
  it('never cuts mid-word and never leaves a half bracket', () => {
    const s = safeShorten('Nature Communications (Open Access) for Researchers', 30, 'EN');
    assert.ok(countCharacterWidth(s) <= 30);
    assert.deepEqual(unbalancedMarks(s), []);
    assert.ok('Nature Communications (Open Access) for Researchers'.split(' ').some((w) => s.endsWith(w)), s);
    assert.equal(shortenName('Journal of Experimental Biology', 18), 'Journal');
  });
  it('balances full-width brackets', () => {
    assert.deepEqual(unbalancedMarks(balanceBrackets('研究成果（开放获取')), []);
    assert.deepEqual(unbalancedMarks(balanceBrackets('「査読付き論文')), []);
  });
});

describe('final ad-copy QA gate', () => {
  it('detects each problem class', () => {
    assert.ok(checkAdText('Publish Open Access (APC', { maxWidth: 30 }).includes('unbalanced_brackets'));
    assert.ok(checkAdText('Submit your research to…').includes('truncated'));
    assert.ok(checkAdText('Fast decisions and').includes('trailing_fragment'));
    assert.ok(checkAdText('研究成果（开放获取').includes('unbalanced_brackets'));
    assert.ok(checkAdText('A'.repeat(31), { maxWidth: 30 }).includes('over_length'));
    assert.ok(checkAdText('SUBMIT NOW!!').includes('tone'));
    assert.ok(checkAdText('Guaranteed acceptance', { prohibitedTerms: ['guaranteed'] }).includes('prohibited_term'));
    assert.deepEqual(checkAdText('Publish in Nature Portfolio', { maxWidth: 30 }), []);
    assert.deepEqual(checkAdText('Submit via JCR Q1 journal APC'), []);
  });

  it('repairs at word boundaries', () => {
    const r = finalizeAdText('Rigorous peer review and global reach for authors', { maxWidth: 30, language: 'EN' });
    assert.equal(r.ready, true);
    assert.ok(countCharacterWidth(r.text) <= 30);
    assert.equal(/\s(and|for|of)$/.test(r.text), false, r.text);
    const t = finalizeAdText('SUBMIT NOW!!', { language: 'EN' });
    assert.equal(t.text, 'Submit NOW!');
    const ja = finalizeAdText('「査読付き論文の', { maxWidth: 30, language: 'JA' });
    assert.deepEqual(unbalancedMarks(ja.text), []);
    assert.equal(/[のとやをが]$/.test(ja.text), false, ja.text);
  });

  it('replaces unrepairable lines with the fallback and flags what is left', () => {
    const campaign: any = {
      outputLanguage: 'EN',
      searchAds: {
        headlines: [
          { text: 'Guaranteed acceptance', language: 'EN' },
          { text: 'Guaranteed fast review', language: 'EN' },
          { text: 'Publish with Nature', language: 'EN' },
        ],
        descriptions: [{ text: 'Rigorous peer review for all research…', language: 'EN' }],
        callouts: ['Open Access', 'Global reach &'],
        structuredSnippet: { header: 'Types', values: ['Articles', 'Reviews'] },
      },
    };
    const fallback = { searchAds: { headlines: [{ text: 'Peer-Reviewed Research' }], descriptions: [] } };
    const out = qaCampaignCopy(campaign, { fallback, prohibitedTerms: ['guaranteed'] });
    assert.equal(out.searchAds.headlines[0].text, 'Peer-Reviewed Research');
    assert.equal(out.searchAds.headlines[1].qaReady, false);
    assert.equal(out.copyQa.ready, false);
    assert.ok(out.copyQa.issues.some((i: any) => i.field === 'searchAds.headlines[1]'));
    assert.equal(out.searchAds.descriptions[0].text, 'Rigorous peer review for all research');
    assert.equal(out.searchAds.callouts[1], 'Global reach');
    assert.equal(out.searchAds.structuredSnippet, undefined);
    assert.ok(out.copyQa.replaced >= 1 && out.copyQa.repaired >= 1);
  });

  it('passes clean ZH/JA copy untouched', () => {
    const out = qaCampaignCopy({
      outputLanguage: 'ZH',
      searchAds: { headlines: [{ text: 'Nature Communications 投稿指南', language: 'ZH' }], descriptions: [{ text: '同行评议，开放获取。', language: 'ZH' }] },
    });
    assert.equal(out.copyQa.ready, true);
    assert.equal(out.searchAds.headlines[0].text, 'Nature Communications 投稿指南');
  });
});

describe('landing page facts: unverified until the user verifies', () => {
  const facts: any = {
    extractedFacts: {
      journalTitle: { value: 'X' }, issnPrint: { value: '' }, issnElectronic: { value: '' }, aimsAndScopeSummary: { value: '' },
      acceptedArticleTypes: { value: [] }, submissionPortalUrl: { value: '' }, authorGuidelinesUrl: { value: '' },
      articleProcessingChargeUsd: { value: null }, openAccessPolicy: { value: '' }, editorInChief: { value: '' }, pageMetrics: [],
      pageFeatures: [{ kind: 'median_decision', label: 'Decision', text: '30 days', provenance: 'page_sourced' }],
    },
  };
  it('labels facts unverified by default and verified after the click', () => {
    assert.match(formatLandingPagePromptSection(facts), /30 days \[UNVERIFIED/);
    assert.match(formatLandingPagePromptSection(facts, ['median_decision']), /30 days \[user-verified\]/);
  });
  it('stores the verify choice per URL', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    setPageFactVerified('https://www.nature.com/ncomms/', 'median_decision', true, storage);
    assert.deepEqual(getVerifiedPageFacts('https://www.nature.com/ncomms', storage), ['median_decision']);
    assert.deepEqual(getVerifiedPageFacts('https://www.nature.com/srep', storage), []);
    setPageFactVerified('https://www.nature.com/ncomms', 'median_decision', false, storage);
    assert.deepEqual(getVerifiedPageFacts('https://www.nature.com/ncomms', storage), []);
    assert.deepEqual(sanitizeVerifiedKinds(['a', 3, '', 'b']), ['a', 'b']);
  });
});
