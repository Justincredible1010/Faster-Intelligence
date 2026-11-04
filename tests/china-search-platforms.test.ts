import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CHINA_PLATFORM_LIMITS, checkPlatformText, finalizePlatformText, platformWidth } from '../src/china/platformRules';
import { withChinaChannels } from '../src/china/withChinaChannels';
import { qaCampaignCopy } from '../src/utils/adCopyQa';
import { StageCode } from '../src/types';

const codes = (t: string, p: any, f: any, o?: any) => checkPlatformText(t, p, f, o).map((i: any) => (typeof i === 'string' ? i : i.code));

const ONCOGENE = { journalName: 'Oncogene', publisher: 'Springer Nature', impactFactor: 7.3, jcrYear: 2025, jcrQuartile: 'Q1', jcrQuartileCategory: 'ONCOLOGY', url: 'https://www.nature.com/onc/' };
const BMC = { journalName: 'BMC Medicine', publisher: 'BioMed Central', impactFactor: 8.3, jcrYear: 2025, jcrQuartile: 'Q1', jcrQuartileCategory: 'MEDICINE, GENERAL & INTERNAL', url: 'https://bmcmedicine.biomedcentral.com/' };

function campaign(j: any, stage: StageCode): any {
  return withChinaChannels({
    funnelStage: stage,
    outputLanguage: 'all',
    clarivateFacts: { sourceAttribution: 'Clarivate JCR', verificationStatus: 'clarivate_api', provenanceSource: 'clarivate_wos_journals_api', ...j },
    recommendedDestination: { label: 'Journal page', url: j.url, description: '' },
  } as any);
}

describe('Baidu / 360 width counting', () => {
  it('counts 汉字 and full-width punctuation as 2, ASCII as 1', () => {
    assert.equal(platformWidth('期刊'), 4);
    assert.equal(platformWidth('Oncogene'), 8);
    assert.equal(platformWidth('，。'), 4);
    assert.equal(platformWidth('“”'), 4);
  });
  it('enforces the published limits', () => {
    assert.equal(CHINA_PLATFORM_LIMITS.baidu.title.max, 50);
    assert.equal(CHINA_PLATFORM_LIMITS.baidu.description.max, 80);
    assert.equal(CHINA_PLATFORM_LIMITS.so360.title.max, 50);
    assert.ok(codes('期'.repeat(26), 'baidu', 'title').includes('over_length'));
    assert.deepEqual(codes('期'.repeat(25), 'baidu', 'title'), []);
    assert.ok(codes('短标题', 'so360Display', 'title').includes('under_length'));
  });
});

describe('Advertising Law and platform symbol rules', () => {
  it('flags 极限词 unless the phrase is a sourced fact', () => {
    assert.ok(codes('国内最好的肿瘤学期刊', 'baidu', 'description').includes('absolute_term'));
    assert.ok(codes('本刊是学科第一期刊', 'so360', 'description').includes('absolute_term'));
    const sourced = '据 Clarivate JCR 2025，本刊位列 Oncology 学科第一。';
    assert.deepEqual(codes(sourced, 'baidu', 'description', { sourcedPhrases: [sourced] }), []);
  });
  it('flags unsourced claims and promises', () => {
    assert.ok(codes('保证录用，快速发表', 'baidu', 'description').includes('unsourced_claim'));
    assert.ok(codes('影响因子 7.3 的期刊', 'baidu', 'description').includes('unsourced_claim'));
    assert.deepEqual(codes('据 Clarivate JCR 2025，本刊影响因子为 7.3。', 'baidu', 'description'), []);
  });
  it('flags special symbols, repeats, URLs and the 360 ^ rule', () => {
    assert.ok(codes('【官方】期刊介绍', 'baidu', 'title').includes('special_symbol'));
    assert.ok(codes('★期刊介绍', 'so360', 'title').includes('special_symbol'));
    assert.ok(codes('立即投稿！！！', 'baidu', 'description').includes('repeated_punctuation'));
    assert.ok(codes('访问 www.example.com 了解', 'baidu', 'description').includes('url_in_copy'));
    assert.ok(codes('甲^乙^丙', 'so360', 'description').includes('bad_line_break'));
    assert.ok(codes('期'.repeat(21) + '^短', 'so360', 'description').includes('bad_line_break'));
  });
});

describe('finalizePlatformText never truncates', () => {
  it('repairs symbols without shortening the words', () => {
    const r = finalizePlatformText('【Oncogene】期刊介绍！！', 'baidu', 'title', []);
    assert.equal(r.outcome, 'repaired');
    assert.equal(r.text, 'Oncogene 期刊介绍！');
  });
  it('swaps in a complete alternative, or drops the line', () => {
    const long = '了解' + '期'.repeat(40);
    const alt = finalizePlatformText(long, 'baidu', 'description', ['了解期刊的研究范围与收稿方向。']);
    assert.equal(alt.outcome, 'alternative');
    assert.equal(alt.text, '了解期刊的研究范围与收稿方向。');
    const dropped = finalizePlatformText(long, 'baidu', 'description', ['国内最好的期刊']);
    assert.equal(dropped.outcome, 'dropped');
    assert.equal(dropped.text, '');
    assert.ok(!long.startsWith(dropped.text) || dropped.text === '');
  });
});

describe('generated Baidu / 360 copy', () => {
  for (const j of [ONCOGENE, BMC]) {
    for (const stage of ['AWA', 'CON', 'DEC'] as StageCode[]) {
      it(`${j.journalName} ${stage} stays within every rule and passes the final check`, () => {
        const c = qaCampaignCopy(campaign(j, stage));
        for (const [key, p] of [['baiduSearchAd', 'baidu'], ['so360SearchAd', 'so360']] as const) {
          const ad = c[key];
          assert.ok(ad.title && ad.description1, `${key} has title and description`);
          assert.deepEqual(codes(ad.title, p, 'title'), []);
          for (const d of [ad.description1, ad.description2].filter(Boolean)) assert.deepEqual(codes(d, p, 'description'), []);
          assert.ok(ad.title.includes(j.journalName) || platformWidth(ad.title) <= 50);
        }
        const disp = c.so360DisplayAd;
        assert.ok(disp.titles.length >= 2 && disp.titles.length <= 10);
        for (const t of disp.titles) assert.deepEqual(codes(t, 'so360Display', 'title'), []);
        assert.deepEqual(codes(disp.description, 'so360Display', 'description'), []);
        assert.equal(c.copyQa.issues.filter((i: any) => /baidu|so360/.test(i.field)).length, 0);
        if (stage === 'CON') assert.match(c.baiduSearchAd.description1, /Clarivate JCR 2025/);
      });
    }
  }
  it('does not name Clarivate for a quartile that did not come from Clarivate', () => {
    const c = campaign({ ...ONCOGENE, provenanceSource: undefined, verificationStatus: 'user_provided' }, 'CON');
    assert.doesNotMatch(JSON.stringify(c.baiduSearchAd), /分区/);
  });
  it('the final check replaces a broken line with an alternative and blocks an empty ad', () => {
    const c = campaign(ONCOGENE, 'AWA');
    c.baiduSearchAd.title = '【最好】' + c.baiduSearchAd.title;
    let out: any = qaCampaignCopy(c);
    assert.ok(!/最好|【/.test(out.baiduSearchAd.title));
    assert.ok(out.baiduSearchAd.title.length > 0);
    const c2 = campaign(ONCOGENE, 'AWA');
    c2.baiduSearchAd.description1 = '国内最好的期刊';
    c2.baiduSearchAd.description2 = '';
    c2.baiduSearchAd.alternatives.description = [];
    out = qaCampaignCopy(c2);
    assert.equal(out.baiduSearchAd.description1, '');
    assert.equal(out.copyQa.ready, false);
  });
});
