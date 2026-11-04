import { ChinaSearchAd, ClarivateJournalMetrics, So360DisplayAd, StageCode } from '../types';
import { displayCategory, quartileCategory } from '../utils/jcrQuartile';
import { metricsFromClarivateWos, trustedQuartileClaim } from '../utils/metricClaims';
import { ChinaCopyFacts } from './copyFacts';
import { CHINA_PLATFORM_LIMITS, ChinaPlatform, checkPlatformText, firstPassing } from './platformRules';

/**
 * Baidu Search, 360 Search and 360 Display copy. Every line is a complete sentence built
 * from facts that carry their source (Clarivate JCR, the journal page, or this campaign).
 * Candidates are ordered from most to least specific; the first that passes the platform
 * rules wins. Nothing is cut to fit. Rules and sources: ./platformRules.ts.
 */

/** Chinese quartile lines, category named as Clarivate names it. Never a bare "Q1". */
export function zhQuartileCandidates(raw: Partial<ClarivateJournalMetrics> | null | undefined): string[] {
  const facts: any = raw || {};
  if (!trustedQuartileClaim(facts)) return [];
  // The line names Clarivate, so the quartile itself must have come from Clarivate.
  const mapped = facts.provenanceMap?.jcrQuartile?.source;
  if (mapped ? mapped !== 'clarivate_wos_journals_api' : !metricsFromClarivateWos(facts)) return [];
  const category = displayCategory(quartileCategory(facts) || '');
  if (!category) return [];
  const q = String(facts.jcrQuartile).trim().toUpperCase();
  const year = facts.jcrYear ? ` ${facts.jcrYear}` : '';
  return [
    `据 Clarivate JCR${year}，本刊位列 ${category} 学科 ${q} 分区。`,
    `Clarivate JCR${year}：${category} 学科 ${q} 分区`,
    `JCR${year} ${category} 学科 ${q} 分区`,
  ];
}

function factLines(stage: StageCode, facts: ChinaCopyFacts, raw: Partial<ClarivateJournalMetrics> | null | undefined): string[] {
  const lines: string[] = [];
  if (stage === 'CON') {
    lines.push(...zhQuartileCandidates(raw));
    if (facts.impact) {
      const which = facts.impact.fiveYear ? '5年影响因子' : '影响因子';
      if (facts.impact.year) lines.push(`据 Clarivate JCR ${facts.impact.year}，本刊${which}为 ${facts.impact.value}。`);
      lines.push(`Clarivate ${which} ${facts.impact.value}`);
    }
  }
  if (stage !== 'AWA' && facts.firstDecisionDays) {
    lines.push(`首次决定约${facts.firstDecisionDays.value}天，来源：${facts.firstDecisionDays.sourceZh}。`);
  }
  if (stage === 'CON' && facts.apc) {
    lines.push(`文章处理费${facts.apc.value}美元，来源：${facts.apc.sourceZh}。`);
  }
  return lines;
}

function scopeLines(stage: StageCode, facts: ChinaCopyFacts): string[] {
  const name = facts.journalName;
  if (stage === 'AWA') {
    return [`了解${name}的研究范围、文章类型与近期发表的论文。`, `${facts.publisher}出版，了解期刊研究范围与收稿方向。`, '了解期刊的研究范围与收稿方向。'];
  }
  if (stage === 'CON') {
    return [`核对${name}的收稿范围、文章类型与出版方式。`, '核对收稿范围、同行评审流程与出版方式。', '核对收稿范围与出版方式。'];
  }
  return [`查看${name}的作者须知、投稿清单与同行评审流程。`, '查看作者须知与投稿清单，准备好再投稿。', '查看作者须知与投稿清单。'];
}

function titleLines(stage: StageCode, facts: ChinaCopyFacts): string[] {
  const name = facts.journalName;
  if (stage === 'AWA') return [`${name}期刊介绍与研究范围`, `${name}期刊介绍`, `${facts.publisher}期刊介绍`, '期刊介绍与研究范围'];
  if (stage === 'CON') return [`${name}选刊参考：收稿范围与出版方式`, `${name}选刊参考`, '选刊参考：收稿范围与出版方式'];
  return [`${name}投稿指南与作者须知`, `${name}投稿须知`, '投稿指南与作者须知'];
}

function passing(lines: string[], platform: ChinaPlatform, field: 'title' | 'description'): string[] {
  return [...new Set(lines.map((l) => l.trim()).filter(Boolean))].filter((l) => !checkPlatformText(l, platform, field).length);
}

/** True when two lines state the same fact, so description 2 would only repeat description 1. */
export function sameFact(a: string, b: string): boolean {
  const kinds = [/分区|\bQ[1-4]\b/, /影响因子/, /首次决定/, /文章处理费/, /^(了解|核对|查看)/];
  return kinds.some((k) => k.test(a) && k.test(b));
}

export function generateChinaSearchAd(
  platform: 'baidu' | 'so360',
  facts: ChinaCopyFacts,
  raw: Partial<ClarivateJournalMetrics> | null | undefined,
  stage: StageCode,
  landingUrl: string
): ChinaSearchAd {
  const titles = passing(titleLines(stage, facts), platform, 'title');
  const descs = passing([...factLines(stage, facts, raw), ...scopeLines(stage, facts)], platform, 'description');
  const title = titles[0] || '';
  const description1 = descs[0] || '';
  // Second line must add something new: skip variants of the same fact.
  const description2 = descs.find((d) => d !== description1 && !sameFact(d, description1)) || '';
  const limits = CHINA_PLATFORM_LIMITS[platform];
  return {
    platform,
    title,
    description1,
    description2,
    titleLimit: limits.title.max,
    descriptionLimit: limits.description.max,
    landingUrl,
    alternatives: {
      title: titles.slice(1),
      description: descs.filter((d) => d !== description1 && d !== description2),
    },
    factNotes: facts.factNotes,
  };
}

/**
 * Generic display titles of 15+ characters even when counted one per 汉字, so 360 Display
 * always has at least two complete titles when a journal name fails the generic checks.
 */
const DISPLAY_TITLES: Record<string, string[]> = {
  AWA: ['了解期刊的研究范围、文章类型与近期论文', '期刊介绍：研究范围、文章类型与出版方式'],
  CON: ['选刊参考：核对收稿范围、文章类型与出版方式', '核对收稿范围、同行评审流程与出版方式'],
  DEC: ['投稿前查看作者须知、投稿清单与评审流程', '查看作者须知与投稿清单，准备好再投稿'],
};

export function generateSo360DisplayAd(
  facts: ChinaCopyFacts,
  raw: Partial<ClarivateJournalMetrics> | null | undefined,
  stage: StageCode,
  landingUrl: string
): So360DisplayAd {
  const spec = CHINA_PLATFORM_LIMITS.so360Display;
  const titleCandidates = [...titleLines(stage, facts), ...scopeLines(stage, facts).map((l) => l.replace(/。$/, '')), ...DISPLAY_TITLES[stage]];
  const titles = passing(titleCandidates, 'so360Display', 'title');
  const descs = passing([...factLines(stage, facts, raw), ...scopeLines(stage, facts)], 'so360Display', 'description');
  return {
    titles: titles.slice(0, 4),
    description: descs[0] || '',
    titleRange: [spec.title.min, spec.title.max],
    descriptionRange: [spec.description.min, spec.description.max],
    landingUrl,
    alternatives: { title: titles.slice(4), description: descs.slice(1) },
    factNotes: facts.factNotes,
  };
}

export { firstPassing };
