import { OutputLanguage, StageCode, WeChatAd, WeChatAdFields } from '../types';
import { ChinaCopyFacts } from './copyFacts';
import { charCount } from './chinaAdLaw';

/**
 * Shared paid-ad fields.
 * Moments card title is under 10 characters, card description under 30,
 * and the action button is a 4-character preset (了解更多 / 查看详情).
 * A description of 30 also fits the Moments outer copy limit of 40.
 */
export const WECHAT_HEADLINE_LIMIT = 10;
export const WECHAT_DESCRIPTION_LIMIT = 30;
export const WECHAT_CTA_LIMIT = 4;

function firstThatFits(candidates: string[], limit: number): string {
  const ready = candidates.map((item) => item.trim()).filter(Boolean);
  return ready.find((item) => charCount(item) <= limit) || ready[ready.length - 1] || '';
}

function chineseCta(stage: StageCode): string {
  return stage === 'AWA' ? '了解更多' : '查看详情';
}

function chineseHeadline(stage: StageCode, name: string): string {
  const suffix = stage === 'AWA' ? '期刊介绍' : stage === 'CON' ? '选刊参考' : '投稿须知';
  return firstThatFits([`${name}${suffix}`, suffix, '查看期刊'], WECHAT_HEADLINE_LIMIT);
}

function chineseDescription(stage: StageCode, facts: ChinaCopyFacts): string {
  const name = facts.journalName;
  const candidates: string[] = [];
  if (stage === 'CON' && facts.impact) {
    const which = facts.impact.fiveYear ? '5年影响因子' : '影响因子';
    if (facts.impact.year) {
      candidates.push(`Clarivate JCR${facts.impact.year} ${which} ${facts.impact.value}`);
    }
    candidates.push(`${name} Clarivate ${which} ${facts.impact.value}`);
    candidates.push(`Clarivate ${which} ${facts.impact.value}`);
  }
  if (stage !== 'AWA' && facts.firstDecisionDays) {
    const days = facts.firstDecisionDays;
    candidates.push(`首次决定${days.value}天（来源：${days.sourceZh}）`);
  }
  if (stage === 'CON' && facts.apc) {
    candidates.push(`文章处理费${facts.apc.value}美元（来源：${facts.apc.sourceZh}）`);
  }
  if (stage === 'AWA') {
    candidates.push(`${name}，了解研究范围`, '了解期刊的研究范围');
  } else if (stage === 'CON') {
    candidates.push(`${name}，核对收稿范围`, '核对收稿范围与出版方式');
  } else {
    candidates.push(`${name}，查看作者须知`, '查看作者须知与投稿清单');
  }
  return firstThatFits(candidates, WECHAT_DESCRIPTION_LIMIT);
}

function englishFields(stage: StageCode, facts: ChinaCopyFacts): WeChatAdFields {
  const name = facts.journalName;
  const headline = firstThatFits(
    [
      stage === 'AWA' ? `See ${name}` : stage === 'CON' ? name : `${name} guide`,
      stage === 'AWA' ? 'Explore' : stage === 'CON' ? 'Check fit' : 'Guidelines',
    ],
    WECHAT_HEADLINE_LIMIT
  );
  const descriptionCandidates: string[] = [];
  if (stage === 'CON' && facts.impact) {
    const which = facts.impact.fiveYear ? '5-year IF' : 'IF';
    descriptionCandidates.push(`Clarivate ${which} ${facts.impact.value}`);
  }
  if (stage !== 'AWA' && facts.firstDecisionDays) {
    const days = facts.firstDecisionDays;
    descriptionCandidates.push(`First decision ${days.value} days (source: ${days.sourceEn})`);
    descriptionCandidates.push(`${days.value} days (${days.sourceEn})`);
  }
  if (stage === 'CON' && facts.apc) {
    descriptionCandidates.push(`APC ${facts.apc.value} USD (source: ${facts.apc.sourceEn})`);
    descriptionCandidates.push(`APC ${facts.apc.value} USD (${facts.apc.sourceEn})`);
  }
  descriptionCandidates.push(
    stage === 'AWA' ? `Scope from ${name}` : stage === 'CON' ? `Check fit: ${name}` : `Author guide: ${name}`,
    stage === 'AWA' ? 'See the journal scope' : stage === 'CON' ? 'Check scope and options' : 'See the author checklist'
  );
  return {
    headline,
    description: firstThatFits(descriptionCandidates, WECHAT_DESCRIPTION_LIMIT),
    cta: stage === 'AWA' ? 'Learn more' : 'View details',
  };
}

export function generateWeChatAd(
  facts: ChinaCopyFacts,
  stage: StageCode,
  outputLanguage: OutputLanguage,
  landingUrl: string
): WeChatAd {
  const ad: WeChatAd = {
    headline: chineseHeadline(stage, facts.journalName),
    description: chineseDescription(stage, facts),
    cta: chineseCta(stage),
    headlineLimit: WECHAT_HEADLINE_LIMIT,
    descriptionLimit: WECHAT_DESCRIPTION_LIMIT,
    ctaLimit: WECHAT_CTA_LIMIT,
    landingUrl,
    placements: ['moments', 'official_account'],
    factNotes: facts.factNotes,
  };
  if (outputLanguage === 'all') {
    ad.englishOption = englishFields(stage, facts);
  }
  return ad;
}
