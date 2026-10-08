import { ComplianceIssue, GeneratedAdCampaign } from '../types';

/**
 * China Advertising Law notices. These flag a line. They do not rewrite it.
 * Article 9 prohibits absolute terms such as “国家级”, “最高级”, and “最佳”.
 */
const CHINA_AD_LAW_TERMS: { term: string; pattern: RegExp }[] = [
  { term: '国家级', pattern: /国家级/ },
  { term: '最高级', pattern: /最高级/ },
  { term: '世界级', pattern: /世界级/ },
  { term: '史无前例', pattern: /史无前例/ },
  { term: '全网第一', pattern: /全网第一/ },
  { term: '保证录用', pattern: /保证录用|包录用|包过|保过/ },
  { term: '百分之百', pattern: /百分之百|100\s*%/ },
  { term: 'world-class', pattern: /\bworld[-\s]?class\b/i },
  { term: 'national-level', pattern: /\bnational[-\s]?level\b/i },
  { term: 'guaranteed', pattern: /\bguarantee[ds]?\b/i },
  { term: '最佳', pattern: /最佳/ },
  { term: '最好', pattern: /最好/ },
  { term: '最大', pattern: /最大/ },
  { term: '最小', pattern: /最小/ },
  { term: '最快', pattern: /最快/ },
  { term: '最强', pattern: /最强/ },
  { term: '最优', pattern: /最优/ },
  { term: '最新', pattern: /最新/ },
  { term: '最低', pattern: /最低/ },
  { term: '最高', pattern: /最高(?!级)/ },
  { term: '第一', pattern: /第一/ },
  { term: '唯一', pattern: /唯一/ },
  { term: '首个', pattern: /首个/ },
  { term: '首选', pattern: /首选/ },
  { term: '顶级', pattern: /顶级/ },
  { term: '极致', pattern: /极致/ },
  { term: '极品', pattern: /极品/ },
  { term: '绝对', pattern: /绝对/ },
  { term: '完美', pattern: /完美/ },
  { term: '万能', pattern: /万能/ },
  { term: '保证', pattern: /保证/ },
  { term: 'best', pattern: /\bbest\b/i },
  { term: 'fastest', pattern: /\bfastest\b/i },
  { term: '#1', pattern: /#\s*1|\bno\.?\s*1\b/i },
  { term: 'highest', pattern: /\bhighest\b/i },
  { term: 'perfect', pattern: /\bperfect\b/i },
  { term: 'premier', pattern: /\bpremier\b/i },
  { term: 'finest', pattern: /\bfinest\b/i },
];

const SHORTER_WHEN = [
  { drop: '保证', coveredBy: '保证录用' },
  { drop: '最高', coveredBy: '最高级' },
  { drop: '第一', coveredBy: '全网第一' },
];

export interface ChinaCopyLine {
  fieldLocation: string;
  text: string;
}

export function charCount(text: string | null | undefined): number {
  return Array.from(text || '').length;
}

export function chinaChannelLines(campaign: GeneratedAdCampaign): ChinaCopyLine[] {
  const lines: ChinaCopyLine[] = [];
  const weibo = campaign.weiboPost;
  if (weibo) {
    lines.push({ fieldLocation: 'Weibo hook', text: weibo.hook });
    lines.push({ fieldLocation: 'Weibo body', text: weibo.body });
    lines.push({ fieldLocation: 'Weibo hashtags', text: (weibo.hashtags || []).join(' ') });
    if (weibo.englishOption) {
      lines.push({ fieldLocation: 'Weibo English hook', text: weibo.englishOption.hook });
      lines.push({ fieldLocation: 'Weibo English body', text: weibo.englishOption.body });
      lines.push({ fieldLocation: 'Weibo English hashtags', text: (weibo.englishOption.hashtags || []).join(' ') });
    }
  }
  const wechat = campaign.wechatAd;
  if (wechat) {
    lines.push({ fieldLocation: 'WeChat headline', text: wechat.headline });
    lines.push({ fieldLocation: 'WeChat description', text: wechat.description });
    lines.push({ fieldLocation: 'WeChat CTA', text: wechat.cta });
    if (wechat.englishOption) {
      lines.push({ fieldLocation: 'WeChat English headline', text: wechat.englishOption.headline });
      lines.push({ fieldLocation: 'WeChat English description', text: wechat.englishOption.description });
      lines.push({ fieldLocation: 'WeChat English CTA', text: wechat.englishOption.cta });
    }
  }
  return lines;
}

function termsIn(text: string): string[] {
  const found = CHINA_AD_LAW_TERMS.filter((entry) => entry.pattern.test(text)).map((entry) => entry.term);
  return found.filter((term) => !SHORTER_WHEN.some((rule) => rule.drop === term && found.includes(rule.coveredBy)));
}

/**
 * Warn which lines might conflict with China Advertising Law.
 * Does not return a suggested rewrite and does not change the campaign.
 */
export function auditChinaAdLaw(campaign: GeneratedAdCampaign): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  chinaChannelLines(campaign).forEach((line, index) => {
    const text = (line.text || '').trim();
    if (!text) return;
    const terms = termsIn(text);
    if (terms.length === 0) return;
    issues.push({
      id: `china-ad-law-${index}-${terms.join('-')}`,
      type: 'warning',
      category: 'china_ad_law',
      message: `China Advertising Law (广告法第九条) may conflict because this line uses “${terms.join('”, “')}”. The copy was not changed.`,
      targetText: line.text,
      fieldLocation: line.fieldLocation,
    });
  });
  return issues;
}
