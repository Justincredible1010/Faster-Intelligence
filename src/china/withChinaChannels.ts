import { GeneratedAdCampaign, OutputLanguage, StageCode, WeChatAd, WeiboPost, normalizeStage } from '../types';
import { stageDestinationUrl } from '../utils/landingPage';
import { chinaCopyFacts } from './copyFacts';
import { generateWeChatAd } from './wechatAd';
import { generateWeiboPost } from './weiboPost';

type ChinaCampaign = {
  funnelStage: string;
  outputLanguage?: OutputLanguage;
  clarivateFacts: GeneratedAdCampaign['clarivateFacts'];
  /** Ignored. A stored path such as /aims-and-scope is not a resolved link. */
  recommendedDestination?: { url?: string; label?: string; description?: string };
};

/**
 * Attach a Weibo post and a WeChat ad for the same journal and stage.
 * The link is the destination the journal page already resolved for this stage,
 * or the journal landing URL when the page has no more specific link.
 */
export function withChinaChannels<T extends ChinaCampaign>(campaign: T): T & { weiboPost: WeiboPost; wechatAd: WeChatAd } {
  const stage = normalizeStage(campaign.funnelStage) as StageCode;
  const language = campaign.outputLanguage || 'all';
  const landingUrl = stageDestinationUrl(campaign.clarivateFacts, stage);
  const facts = chinaCopyFacts(campaign.clarivateFacts);
  return {
    ...campaign,
    weiboPost: generateWeiboPost(facts, stage, language, landingUrl),
    wechatAd: generateWeChatAd(facts, stage, language, landingUrl),
  };
}
