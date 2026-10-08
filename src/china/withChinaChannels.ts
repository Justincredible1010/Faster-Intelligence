import { GeneratedAdCampaign, OutputLanguage, StageCode, WeChatAd, WeiboPost, normalizeStage } from '../types';
import { chinaCopyFacts, resolvedLandingUrl } from './copyFacts';
import { generateWeChatAd } from './wechatAd';
import { generateWeiboPost } from './weiboPost';

type ChinaCampaign = {
  funnelStage: string;
  outputLanguage?: OutputLanguage;
  clarivateFacts: GeneratedAdCampaign['clarivateFacts'];
  recommendedDestination?: { url?: string; label?: string };
};

/**
 * Attach a Weibo post and a WeChat ad for the same journal and stage.
 * The landing link is the destination already on the campaign.
 */
export function withChinaChannels<T extends ChinaCampaign>(campaign: T): T & { weiboPost: WeiboPost; wechatAd: WeChatAd } {
  const stage = normalizeStage(campaign.funnelStage) as StageCode;
  const language = campaign.outputLanguage || 'all';
  const landingUrl = resolvedLandingUrl(campaign.recommendedDestination?.url);
  const facts = chinaCopyFacts(campaign.clarivateFacts);
  return {
    ...campaign,
    weiboPost: generateWeiboPost(facts, stage, language, landingUrl),
    wechatAd: generateWeChatAd(facts, stage, language, landingUrl),
  };
}
