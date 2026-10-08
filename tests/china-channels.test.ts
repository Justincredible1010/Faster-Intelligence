import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { JOURNAL_CATALOG } from '../src/data/journalCatalog';
import { withChinaChannels } from '../src/china/withChinaChannels';
import { charCount } from '../src/china/chinaAdLaw';
import { chinaChannelsExportSection, generateChinaChannelsCsv } from '../src/china/exportText';
import { autoFixComplianceIssues, runComplianceAudit } from '../src/utils/complianceValidator';
import { generateDeterministicCampaign } from '../server.ts';
import { ClarivateJournalMetrics, GeneratedAdCampaign, OutputLanguage, StageCode } from '../src/types';

const LANDING = 'https://www.nature.com/aims-and-scope';

function campaignFor(
  facts: Partial<ClarivateJournalMetrics>,
  stage: StageCode = 'CON',
  outputLanguage: OutputLanguage = 'all',
  url = LANDING
) {
  return withChinaChannels({
    funnelStage: stage,
    outputLanguage,
    clarivateFacts: {
      journalName: 'Nature',
      publisher: 'Nature Portfolio',
      impactFactor: null,
      sourceAttribution: 'test',
      verificationStatus: 'missing',
      ...facts,
    } as ClarivateJournalMetrics,
    recommendedDestination: { url, label: 'Aims and scope' },
  });
}

function combined(campaign: ReturnType<typeof campaignFor>): string {
  const weibo = campaign.weiboPost;
  const ad = campaign.wechatAd;
  return [
    weibo.hook,
    weibo.body,
    weibo.hashtags.join(' '),
    weibo.englishOption?.hook,
    weibo.englishOption?.body,
    weibo.englishOption?.hashtags.join(' '),
    ad.headline,
    ad.description,
    ad.cta,
    ad.englishOption?.headline,
    ad.englishOption?.description,
    ad.englishOption?.cta,
  ].join('\n');
}

describe('Weibo posts and WeChat ads', () => {
  it('uses the campaign landing URL and keeps hook plus body within Weibo length', () => {
    const campaign = campaignFor({
      journalName: 'Nature',
      publisher: 'Nature Portfolio',
      primaryDiscipline: 'Multidisciplinary Sciences (综合性科学)',
      verificationStatus: 'page_sourced',
      provenanceSource: 'page_sourced',
      impactFactor: null,
    });
    assert.equal(campaign.weiboPost.link, LANDING);
    assert.equal(campaign.weiboPost.englishOption?.link, LANDING);
    assert.equal(campaign.wechatAd.landingUrl, LANDING);
    assert.ok(campaign.weiboPost.practicalLength <= campaign.weiboPost.practicalLimit);
    assert.equal(campaign.weiboPost.practicalLength, charCount(campaign.weiboPost.hook) + 1 + charCount(campaign.weiboPost.body));
    assert.ok(campaign.weiboPost.hashtags.every((tag) => tag.startsWith('#') && tag.endsWith('#')));
    assert.match(campaign.weiboPost.body, /综合性科学/);
    assert.ok(charCount(campaign.wechatAd.headline) <= 10);
    assert.ok(charCount(campaign.wechatAd.description) <= 30);
    assert.equal(charCount(campaign.wechatAd.cta), 4);
    assert.equal(campaign.wechatAd.cta, '查看详情');
    assert.doesNotMatch(campaign.wechatAd.cta, /[，。！？、,.!]/);
    assert.ok(campaign.wechatAd.englishOption);
    assert.ok(charCount(campaign.wechatAd.englishOption.headline) <= 10);
    assert.ok(charCount(campaign.wechatAd.englishOption.description) <= 30);
  });

  it('omits a page-sourced impact factor and cites page APC and decision time with their source', () => {
    const campaign = campaignFor({
      verificationStatus: 'page_sourced',
      provenanceSource: 'page_sourced',
      impactFactor: 8.8,
      apcUsd: 3200,
      firstDecisionDays: 21,
    });
    const text = combined(campaign);
    assert.equal(text.includes('8.8'), false);
    assert.match(text, /3200/);
    assert.match(text, /21/);
    assert.match(text, /期刊页面/);
    assert.match(campaign.weiboPost.factNotes.join(' '), /page-sourced/);
    assert.match(campaign.weiboPost.body, /文章处理费3200美元（来源：期刊页面）/);
    assert.match(campaign.weiboPost.body, /首次决定21天（来源：期刊页面）/);
  });

  it('keeps a user-supplied impact factor out of the copy and labels a user-supplied fee', () => {
    const campaign = campaignFor({
      verificationStatus: 'user_provided',
      provenanceSource: 'user_provided',
      isVerifiedClarivate: false,
      impactFactor: 7.7,
      apcUsd: 450,
      firstDecisionDays: null,
    });
    const text = combined(campaign);
    assert.equal(text.includes('7.7'), false);
    assert.match(text, /450/);
    assert.match(text, /本次活动填写/);
    assert.doesNotMatch(text, /clarivate/i);
  });

  it('cites a Clarivate impact factor and ignores a page impact factor on the same record', () => {
    const clarivate = campaignFor({
      verificationStatus: 'clarivate_api',
      provenanceSource: 'clarivate_wos_journals_api',
      isVerifiedClarivate: true,
      impactFactor: 56.1,
      fiveYearImpactFactor: 60.2,
      jcrYear: 2025,
      apcUsd: null,
      firstDecisionDays: null,
    });
    const text = combined(clarivate);
    assert.match(text, /56\.1/);
    assert.match(text, /Clarivate/);
    assert.match(text, /2025/);
    assert.equal(text.includes('60.2'), false);

    const mixed = campaignFor({
      verificationStatus: 'clarivate_api',
      provenanceSource: 'clarivate_wos_journals_api',
      isVerifiedClarivate: true,
      impactFactor: 9.1,
      jcrYear: 2025,
      apcUsd: 1500,
      provenanceMap: {
        impactFactor: { source: 'page_sourced', confidence: 0.8 },
        apcUsd: { source: 'page_sourced', confidence: 0.9 },
      },
    });
    const mixedText = combined(mixed);
    assert.equal(mixedText.includes('9.1'), false);
    assert.match(mixedText, /1500/);
    assert.match(mixedText, /期刊页面/);
  });

  it('cites a Clarivate five-year impact factor only when the primary value is absent', () => {
    const campaign = campaignFor({
      verificationStatus: 'clarivate_api',
      provenanceSource: 'clarivate_wos_journals_api',
      isVerifiedClarivate: true,
      impactFactor: null,
      fiveYearImpactFactor: 4.2,
      jcrYear: 2024,
    });
    assert.match(combined(campaign), /4\.2/);
    assert.match(campaign.weiboPost.body, /5年影响因子/);
  });

  it('adds the English option only for a bilingual campaign', () => {
    const facts = {
      verificationStatus: 'page_sourced' as const,
      provenanceSource: 'page_sourced' as const,
      impactFactor: null,
    };
    assert.ok(campaignFor(facts, 'AWA', 'all').weiboPost.englishOption);
    assert.equal(campaignFor(facts, 'AWA', 'ZH').weiboPost.englishOption, undefined);
    assert.equal(campaignFor(facts, 'AWA', 'EN').weiboPost.englishOption, undefined);
    assert.equal(campaignFor(facts, 'AWA', 'ZH').wechatAd.englishOption, undefined);
    assert.equal(campaignFor(facts, 'AWA', 'all').wechatAd.cta, '了解更多');
  });

  it('does not invent a destination when the campaign has no resolved URL', () => {
    const blank = campaignFor({ verificationStatus: 'page_sourced', provenanceSource: 'page_sourced' }, 'DEC', 'ZH', '');
    assert.equal(blank.weiboPost.link, '');
    assert.equal(blank.wechatAd.landingUrl, '');
    const relative = campaignFor(
      { verificationStatus: 'page_sourced', provenanceSource: 'page_sourced' },
      'DEC',
      'ZH',
      '/submission-guidelines'
    );
    assert.equal(relative.weiboPost.link, '');
    assert.equal(relative.wechatAd.landingUrl, '');
  });

  it('warns on China Advertising Law terms and does not rewrite the line', () => {
    const campaign = campaignFor({
      journalName: '最佳期刊',
      verificationStatus: 'page_sourced',
      provenanceSource: 'page_sourced',
      impactFactor: null,
    }) as GeneratedAdCampaign;
    campaign.keywords = { englishSearchKeywords: [], chineseAuthorKeywords: [], negativeKeywords: [] };
    campaign.funnelStrategyNote = 'Consideration';
    campaign.primaryCta = 'Check journal fit';
    campaign.generationSource = 'template_fallback';
    campaign.recommendedDestination = {
      label: 'Aims and scope',
      url: LANDING,
      description: 'Scope',
    };

    const originalHook = campaign.weiboPost?.hook || '';
    const originalBody = campaign.weiboPost?.body || '';
    assert.match(originalHook, /最佳/);

    const report = runComplianceAudit(campaign);
    assert.equal(campaign.weiboPost?.hook, originalHook);
    assert.equal(campaign.weiboPost?.body, originalBody);
    const law = report.issues.filter((issue) => issue.category === 'china_ad_law');
    assert.ok(law.length >= 1);
    assert.ok(law.every((issue) => issue.type === 'warning' && issue.suggestedFix == null));
    assert.match(law.map((issue) => issue.fieldLocation).join(' '), /Weibo/);
    assert.match(law[0].message, /广告法第九条/);
    assert.match(law[0].message, /was not changed/);

    const fixed = autoFixComplianceIssues(campaign);
    assert.equal(fixed.weiboPost?.hook, originalHook);
    assert.equal(fixed.weiboPost?.body, originalBody);
    assert.equal(fixed.wechatAd?.headline, campaign.wechatAd?.headline);
  });

  it('leaves catalog snapshot numbers out of the generated campaign channels', () => {
    const aps = JOURNAL_CATALOG.find((entry) => entry.journalName === 'Acta Pharmacologica Sinica');
    assert.ok(aps);
    const generated = generateDeterministicCampaign(aps, 'CON', 'all');
    const text = [
      generated.weiboPost?.hook,
      generated.weiboPost?.body,
      generated.weiboPost?.englishOption?.body,
      generated.wechatAd?.headline,
      generated.wechatAd?.description,
      generated.wechatAd?.englishOption?.description,
    ].join('\n');
    assert.equal(generated.weiboPost?.link, 'https://www.nature.com/aps/aims-and-scope');
    assert.equal(generated.wechatAd?.landingUrl, generated.recommendedDestination.url);
    for (const banned of ['6.9', '7.4', '4190', '23', '1区', 'SCIE', 'Materia']) {
      assert.equal(text.includes(banned), false, `catalog value leaked: ${banned}`);
    }
    assert.doesNotMatch(text, /clarivate/i);
    assert.ok(generated.weiboPost?.englishOption);
    assert.ok((generated.weiboPost?.practicalLength || 0) <= 140);
    assert.ok(charCount(generated.wechatAd?.description || '') <= 30);
  });

  it('exports a labelled Weibo and WeChat section without the page impact factor', () => {
    const campaign = campaignFor({
      verificationStatus: 'page_sourced',
      provenanceSource: 'page_sourced',
      impactFactor: 8.8,
      apcUsd: 3200,
      firstDecisionDays: 21,
    }) as GeneratedAdCampaign;
    const section = chinaChannelsExportSection(campaign);
    const csv = generateChinaChannelsCsv(campaign);
    assert.match(section, /## Weibo organic post and WeChat ads/);
    assert.match(section, /not a Google Ads Editor table/);
    assert.match(section, /WeChat ads \(paid: Moments and Official Account\)/);
    assert.match(section, new RegExp(LANDING.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.equal(section.includes('8.8'), false);
    assert.match(csv.split('\n')[0], /Section,Channel,Stage,Journal,Field,Language,Text,Landing URL,Notes/);
    assert.match(csv, /Weibo organic post/);
    assert.match(csv, /WeChat ad \(paid\)/);
    assert.equal(csv.includes('8.8'), false);
    assert.match(csv, /3200/);
  });
});
