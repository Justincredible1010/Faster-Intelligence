/**
 * Platform policy rules for Baidu Search (百度推广) and 360 Search / Display (360推广).
 *
 * Sources (checked 2026-11-04):
 * - Baidu creative length: title ≤ 50 characters, each description line ≤ 80;
 *   a half-width letter/digit/symbol counts 1, a full-width character or 汉字 counts 2.
 *   https://sem.baidu.com/news/sem/569.html
 * - Baidu: avoid special symbols such as 【】『』, avoid URLs or URL-like text in title/description,
 *   no disparaging competitors, keep copy objective and true.
 *   https://esm.baidu.com/problem/yingxiao/4060.html
 *   https://so.baidu.com/wiki/help/1179.html (rejected for "不符合规范的字符" / 语句不通顺)
 * - 360 Search creative: title ≤ 50 bytes, description ≤ 80 bytes (中文占两个字节); at most one
 *   "^" line break in a description, with ≤ 40 bytes on each side.
 *   https://open.e.360.cn/api/limit.html
 * - 360 forbidden characters: title @ $ * 【】『』○●△▲◎☆★◇◆□■▽▼⊙¤; description 【】『』○●△▲◎☆★◇◆□■▽▼⊙¤.
 *   https://open.e.360.cn/api/specialCharacter.html
 * - 360 Display (展示推广) 图文 creative: each title 15–60 字符, description (memo) 15–120 字符.
 *   https://open.e.360.cn/displayapi/banner_add.html
 *   Manual: 2–10 titles, 15–30 字 each. http://yingxiao.360.cn/Uploads/202205/20/ue_1653013659756115.pdf
 * - Advertising Law Art. 9(3): no “国家级”“最高级”“最佳” or similar absolute terms; Art. 11: data and
 *   statistics must be true and state their source.
 *   https://www.gov.cn/guoqing/2021-10/29/content_5647620.htm
 * - SAMR 广告绝对化用语执法指南 (2023): absolute wording describing a verifiable, condition-limited fact
 *   (time, region, award) is outside Art. 9(3) only when the advertiser can prove it.
 *   https://www.samr.gov.cn/ggjgs/tzgg/art/2023/art_183b5cb48d9e4f0dba67f9f912a913ba.html
 */
import { termsIn } from './chinaAdLaw';

export type ChinaPlatform = 'baidu' | 'so360' | 'so360Display';

export const CHINA_PLATFORM_LIMITS = {
  baidu: { title: { max: 50 }, description: { max: 80 } },
  so360: { title: { max: 50 }, description: { max: 80, breakSide: 40 } },
  so360Display: { title: { min: 15, max: 60 }, description: { min: 15, max: 120 }, minTitles: 2, maxTitles: 10 },
} as const;

export type PlatformIssue =
  | 'empty'
  | 'over_length'
  | 'under_length'
  | 'absolute_term'
  | 'unsourced_claim'
  | 'special_symbol'
  | 'repeated_punctuation'
  | 'leading_punctuation'
  | 'url_in_copy'
  | 'bad_line_break'
  | 'truncated';

/** Byte-style width: 汉字 and full-width characters (incl. Chinese quotes, ……, ——) count 2. */
export function platformWidth(text: string): number {
  return Array.from(text || '').reduce(
    (n, ch) => n + (/[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u2018\u2019\u201C\u201D\u2014\u2026\u00B7]/.test(ch) ? 2 : 1),
    0
  );
}

const SPECIAL_DESC = /[【】『』○●△▲◎☆★◇◆□■▽▼⊙¤]/;
const SPECIAL_TITLE_360 = /[@$*【】『』○●△▲◎☆★◇◆□■▽▼⊙¤]/;
const REPEATED_PUNCT = /([!！?？。，,、.~～;；:：\-—_])\1+/;
const LEADING_PUNCT = /^[\s!！?？。，,、.~～;；:：\-—_)）]/;
const URL_LIKE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|cn|net|org)\b)/i;
/** Academic-publishing promises regulators treat as false or unprovable claims. */
const PROMISE = /(保证录用|包录用|包发表|稳过|必中|秒审|快速录用|内部渠道|100\s*%\s*录用|百分之百录用)/;
/** A metric number cited without its source (Art. 11). */
const METRIC_NUMBER = /(影响因子|IF|JIF|分区)\s*[:：]?\s*(Q[1-4]|\d)/;
const METRIC_SOURCE = /(Clarivate|JCR|来源|期刊页面|官网)/;

export interface PlatformCheckOptions {
  /** Exact phrases already backed by a sourced fact; absolute terms inside them are allowed. */
  sourcedPhrases?: string[];
}

export function checkPlatformText(
  text: string,
  platform: ChinaPlatform,
  field: 'title' | 'description',
  opts: PlatformCheckOptions = {}
): PlatformIssue[] {
  const t = (text || '').trim();
  if (!t) return ['empty'];
  const issues: PlatformIssue[] = [];
  const spec: { min?: number; max: number; breakSide?: number } = (CHINA_PLATFORM_LIMITS[platform] as any)[field];
  const parts = platform === 'so360' && field === 'description' ? t.split('^') : [t];
  const width = platformWidth(parts.join(''));
  if (width > spec.max) issues.push('over_length');
  if (spec.min && width < spec.min) issues.push('under_length');
  if (platform === 'so360' && field === 'description' && (parts.length > 2 || (parts.length === 2 && parts.some((p) => platformWidth(p) > (spec.breakSide || 40) || !p.trim())))) {
    issues.push('bad_line_break');
  }
  if (platform !== 'so360' && t.includes('^')) issues.push('bad_line_break');
  const special = platform === 'so360' && field === 'title' ? SPECIAL_TITLE_360 : SPECIAL_DESC;
  if (special.test(t)) issues.push('special_symbol');
  if (REPEATED_PUNCT.test(t)) issues.push('repeated_punctuation');
  if (LEADING_PUNCT.test(t)) issues.push('leading_punctuation');
  if (URL_LIKE.test(t)) issues.push('url_in_copy');
  if (/(\.\.\.|…|‥)$/.test(t)) issues.push('truncated');
  let scan = t;
  for (const phrase of opts.sourcedPhrases || []) if (phrase) scan = scan.split(phrase).join(' ');
  if (termsIn(scan).length) issues.push('absolute_term');
  if (PROMISE.test(scan) || (METRIC_NUMBER.test(t) && !METRIC_SOURCE.test(t))) issues.push('unsourced_claim');
  return [...new Set(issues)];
}

/**
 * Repairs that never change meaning or length class: collapse repeated punctuation,
 * drop a leading punctuation mark, unwrap 【】『』 brackets. Never shortens.
 */
export function repairPlatformText(text: string): string {
  return (text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/([!！?？。，,、.~～;；:：\-—_])\1+/g, '$1')
    .replace(/[【『]([^】』]*)[】』]/g, '$1 ')
    .replace(/[○●△▲◎☆★◇◆□■▽▼⊙¤]/g, '')
    .replace(/^[\s!！?？。，,、.~～;；:：\-—_)）]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export interface PlatformFinal {
  text: string;
  ready: boolean;
  issues: PlatformIssue[];
  /** 'original' | 'repaired' | 'alternative' | 'dropped' */
  outcome: 'original' | 'repaired' | 'alternative' | 'dropped';
}

/**
 * Final check for one line: keep, repair, swap for the first complete alternative that
 * passes, or drop. A line is never cut to fit.
 */
export function finalizePlatformText(
  text: string,
  platform: ChinaPlatform,
  field: 'title' | 'description',
  alternatives: string[] = [],
  opts: PlatformCheckOptions = {}
): PlatformFinal {
  const original = (text || '').trim();
  const issues = checkPlatformText(original, platform, field, opts);
  if (!issues.length) return { text: original, ready: true, issues: [], outcome: 'original' };
  const repaired = repairPlatformText(original);
  if (repaired && !checkPlatformText(repaired, platform, field, opts).length) return { text: repaired, ready: true, issues: [], outcome: 'repaired' };
  for (const alt of alternatives) {
    const a = repairPlatformText(alt);
    if (a && a !== original && !checkPlatformText(a, platform, field, opts).length) return { text: a, ready: true, issues: [], outcome: 'alternative' };
  }
  return { text: '', ready: false, issues, outcome: 'dropped' };
}

/** First candidate that passes every rule for the platform field, or ''. */
export function firstPassing(candidates: string[], platform: ChinaPlatform, field: 'title' | 'description', opts: PlatformCheckOptions = {}): string {
  return candidates.map((c) => (c || '').trim()).find((c) => c && !checkPlatformText(c, platform, field, opts).length) || '';
}
