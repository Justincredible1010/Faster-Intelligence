import { ChinaSearchAd, GeneratedAdCampaign, OutputLanguage, So360DisplayAd, StageCode, WeChatAd, WeiboPost, normalizeStage } from '../types';
import { stageDestinationUrl } from '../utils/landingPage';
import { chinaCopyFacts } from './copyFacts';
import { generateWeChatAd } from './wechatAd';
import { generateWeiboPost } from './weiboPost';
import { generateChinaSearchAd, generateSo360DisplayAd } from './searchAds';

type ChinaCampaign = {
  funnelStage: string;
  outputLanguage?: OutputLanguage;
  clarivateFacts: GeneratedAdCampaign['clarivateFacts'];
  /** Ignored. A stored path such as /aims-and-scope is not a resolved link. */
  recommendedDestination?: { url?: string; label?: string; description?: string };
};

/**
 * Attach a Weibo post, a WeChat ad, Baidu/360 Search creatives and a 360 Display creative for the same journal and stage.
 * The link is the destination the journal page already resolved for this stage,
 * or the journal landing URL when the page has no more specific link.
 */
export function withChinaChannels<T extends ChinaCampaign>(campaign: T): T & { weiboPost: WeiboPost; wechatAd: WeChatAd; baiduSearchAd: ChinaSearchAd; so360SearchAd: ChinaSearchAd; so360DisplayAd: So360DisplayAd } {
  const stage = normalizeStage(campaign.funnelStage) as StageCode;
  const language = campaign.outputLanguage || 'all';
  const landingUrl = stageDestinationUrl(campaign.clarivateFacts, stage);
  const facts = chinaCopyFacts(campaign.clarivateFacts);
  return {
    ...campaign,
    weiboPost: generateWeiboPost(facts, stage, language, landingUrl),
    wechatAd: generateWeChatAd(facts, stage, language, landingUrl),
    baiduSearchAd: generateChinaSearchAd('baidu', facts, campaign.clarivateFacts, stage, landingUrl),
    so360SearchAd: generateChinaSearchAd('so360', facts, campaign.clarivateFacts, stage, landingUrl),
    so360DisplayAd: generateSo360DisplayAd(facts, campaign.clarivateFacts, stage, landingUrl),
  };
}
