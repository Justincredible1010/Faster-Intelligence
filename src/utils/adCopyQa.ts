/**
 * Final ad-copy QA gate for every language (EN / ZH / JA).
 *
 * Every text an ad shows passes through here before the campaign is returned:
 * - unbalanced brackets or quotes (incl. full-width （）「」【】《》),
 * - truncated text (ellipsis) and trailing fragments ("and", "of", "、", "の"),
 * - over-length for the platform limit (visual width, CJK counts 2),
 * - unprofessional tone (repeated !!/??, emoji, ALL-CAPS shouting),
 * - prohibited playbook terms.
 * Fixable problems are auto-repaired at a word/phrase boundary. Anything still
 * failing is replaced from a fallback when one is given, otherwise flagged
 * not-ready so the UI never presents it as final.
 */
import {
  balanceBrackets,
  countCharacterWidth,
  safeShorten,
  stripTrailingFragments,
  unbalancedMarks,
} from './textUtils';
import { CHINA_PLATFORM_LIMITS, ChinaPlatform, PlatformIssue, checkPlatformText, finalizePlatformText } from '../china/platformRules';
import { sameFact, zhQuartileCandidates } from '../china/searchAds';

/**
 * Platform limits (visual width, CJK counts 2). Baidu and 360 rules and their sources
 * live in ../china/platformRules.ts.
 */
export const PLATFORM_LIMITS = {
  baidu: { title: CHINA_PLATFORM_LIMITS.baidu.title.max, description: CHINA_PLATFORM_LIMITS.baidu.description.max },
  so360: { title: CHINA_PLATFORM_LIMITS.so360.title.max, description: CHINA_PLATFORM_LIMITS.so360.description.max },
  so360Display: { titleMin: CHINA_PLATFORM_LIMITS.so360Display.title.min, title: CHINA_PLATFORM_LIMITS.so360Display.title.max, descriptionMin: CHINA_PLATFORM_LIMITS.so360Display.description.min, description: CHINA_PLATFORM_LIMITS.so360Display.description.max },
  google: { headline: 30, description: 90, sitelinkText: 25, sitelinkDescription: 35, callout: 25, snippetValue: 25, displayShortHeadline: 30, displayLongHeadline: 90, displayDescription: 90, businessName: 25 },
} as const;

export type QaIssue = 'empty' | 'unbalanced_brackets' | 'truncated' | 'trailing_fragment' | 'over_length' | 'tone' | 'prohibited_term' | 'too_few_assets' | PlatformIssue;
export type QaLanguage = 'EN' | 'ZH' | 'JA' | undefined;

export interface QaOptions {
  maxWidth?: number;
  language?: QaLanguage;
  prohibitedTerms?: string[];
}

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const TRAILING_FRAGMENT_EN = /\s(and|or|of|for|the|a|an|to|with|in|on|by|at|from|via|&|\+)$/i;
const TRAILING_FRAGMENT_PUNCT = /[,;:\-–—·/|、，；：・&+]$/;
const TRAILING_FRAGMENT_JA = /[のとやをが]$/;
const ACRONYM_OK = /^(APC|OA|JCR|JIF|SCI|SCIE|SSCI|DOI|ISSN|BMC|CAS|NSFC|PDF|USD|AI|UK|US|EU|Q[1-4])$/;

export function detectLanguage(text: string): 'EN' | 'ZH' | 'JA' {
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'JA';
  if (/[\u4e00-\u9fa5]/.test(text)) return 'ZH';
  return 'EN';
}

export function checkAdText(text: string, opts: QaOptions = {}): QaIssue[] {
  const issues: QaIssue[] = [];
  const t = (text || '').trim();
  if (!t) return ['empty'];
  const language = opts.language || detectLanguage(t);
  if (unbalancedMarks(t).length) issues.push('unbalanced_brackets');
  if (/(\.\.\.|…|‥)$/.test(t)) issues.push('truncated');
  if (TRAILING_FRAGMENT_PUNCT.test(t) || (language === 'EN' && TRAILING_FRAGMENT_EN.test(t)) || (language === 'JA' && TRAILING_FRAGMENT_JA.test(t))) {
    issues.push('trailing_fragment');
  }
  if (opts.maxWidth && countCharacterWidth(t) > opts.maxWidth) issues.push('over_length');
  const shouting = (t.match(/\b[A-Z]{4,}\b/g) || []).filter((w) => !ACRONYM_OK.test(w));
  if (/[!！]{2,}|[?？]{2,}/.test(t) || EMOJI.test(t) || shouting.length > 0) issues.push('tone');
  const lower = t.toLowerCase();
  if ((opts.prohibitedTerms || []).some((term) => term && lower.includes(term.toLowerCase()))) issues.push('prohibited_term');
  return issues;
}

export interface QaResult {
  text: string;
  ready: boolean;
  issues: QaIssue[];
  repaired: boolean;
}

/** Repair what can be repaired without changing meaning; report the rest. */
export function finalizeAdText(text: string, opts: QaOptions = {}): QaResult {
  const original = (text || '').replace(/\s+/g, ' ').trim();
  const language = opts.language || detectLanguage(original);
  let out = original;
  let issues = checkAdText(out, { ...opts, language });
  if (issues.length === 0) return { text: out, ready: true, issues: [], repaired: false };

  if (issues.includes('tone')) {
    out = out
      .replace(/[!！]{2,}/g, (m) => m[0])
      .replace(/[?？]{2,}/g, (m) => m[0])
      .replace(new RegExp(EMOJI.source, 'gu'), '')
      .replace(/\b[A-Z]{4,}\b/g, (w) => (ACRONYM_OK.test(w) ? w : w[0] + w.slice(1).toLowerCase()))
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  if (issues.includes('truncated')) out = out.replace(/(\.\.\.|…|‥)$/, '').trim();
  out = balanceBrackets(out);
  if (opts.maxWidth && countCharacterWidth(out) > opts.maxWidth) out = safeShorten(out, opts.maxWidth, language);
  out = stripTrailingFragments(out, language);

  issues = checkAdText(out, { ...opts, language });
  // A cut-off ending we stripped is fine; an ellipsis-truncated sentence needs a rewrite.
  return { text: out, ready: issues.length === 0 && out.length > 0, issues, repaired: out !== original };
}

export interface CampaignQaIssue {
  field: string;
  text: string;
  issues: QaIssue[];
}

export interface CampaignCopyQa {
  ready: boolean;
  checked: number;
  repaired: number;
  replaced: number;
  issues: CampaignQaIssue[];
}

type AnyCampaign = Record<string, any>;

/**
 * Run the gate over a whole campaign. `fallback` (the deterministic template
 * campaign) supplies replacements for lines that cannot be repaired.
 */
export function qaCampaignCopy<T extends AnyCampaign>(
  campaign: T,
  opts: { fallback?: AnyCampaign | null; prohibitedTerms?: string[] } = {}
): T & { copyQa: CampaignCopyQa } {
  const L = PLATFORM_LIMITS.google;
  const report: CampaignCopyQa = { ready: true, checked: 0, repaired: 0, replaced: 0, issues: [] };
  const lang = (campaign.outputLanguage === 'EN' || campaign.outputLanguage === 'ZH' || campaign.outputLanguage === 'JA') ? campaign.outputLanguage : undefined;

  const gate = (field: string, text: string, maxWidth: number | undefined, itemLang?: QaLanguage, alternatives: string[] = []): QaResult => {
    report.checked++;
    const o = { maxWidth, language: itemLang || lang, prohibitedTerms: opts.prohibitedTerms };
    const r = finalizeAdText(text, o);
    if (r.ready) {
      if (r.repaired) report.repaired++;
      return r;
    }
    for (const alt of alternatives) {
      const a = finalizeAdText(alt, o);
      if (a.ready) {
        report.replaced++;
        return { ...a, repaired: true };
      }
    }
    report.ready = false;
    report.issues.push({ field, text: r.text || text, issues: r.issues });
    return r;
  };

  const out: AnyCampaign = { ...campaign };
  const fb = opts.fallback || null;
  const s = campaign.searchAds;
  if (s) {
    const search: AnyCampaign = { ...s };
    const usedHeadlines = new Set<string>();
    const fbHeadlines = (fb?.searchAds?.headlines || []).map((h: any) => h.text);
    search.headlines = (s.headlines || []).map((h: any, i: number) => {
      const r = gate(`searchAds.headlines[${i}]`, h.text, L.headline, h.language, fbHeadlines.filter((t: string) => !usedHeadlines.has(t)));
      usedHeadlines.add(r.text);
      return { ...h, text: r.text, charCount: r.text.length, charWidth: countCharacterWidth(r.text), qaReady: r.ready, ...(r.ready ? {} : { qaIssues: r.issues }) };
    });
    const fbDescs = (fb?.searchAds?.descriptions || []).map((d: any) => d.text);
    const usedDescs = new Set<string>();
    search.descriptions = (s.descriptions || []).map((d: any, i: number) => {
      const r = gate(`searchAds.descriptions[${i}]`, d.text, L.description, d.language, fbDescs.filter((t: string) => !usedDescs.has(t)));
      usedDescs.add(r.text);
      return { ...d, text: r.text, charCount: r.text.length, charWidth: countCharacterWidth(r.text), qaReady: r.ready, ...(r.ready ? {} : { qaIssues: r.issues }) };
    });
    if (Array.isArray(s.callouts)) {
      search.callouts = s.callouts
        .map((c: string, i: number) => gate(`searchAds.callouts[${i}]`, c, L.callout))
        .map((r: QaResult) => r.text)
        .filter(Boolean);
    }
    if (Array.isArray(s.sitelinks)) {
      search.sitelinks = s.sitelinks.map((l: any, i: number) => {
        const text = gate(`searchAds.sitelinks[${i}].text`, l.text, L.sitelinkText).text;
        const d1 = gate(`searchAds.sitelinks[${i}].description1`, l.description1 ?? l.desc ?? '', L.sitelinkDescription).text;
        const d2 = l.description2 ? gate(`searchAds.sitelinks[${i}].description2`, l.description2, L.sitelinkDescription).text : l.description2;
        return { ...l, text, title: text, description1: d1, desc: d1, description2: d2 };
      });
    }
    if (s.structuredSnippet) {
      const values = (s.structuredSnippet.values || [])
        .map((v: string) => finalizeAdText(v, { maxWidth: L.snippetValue, language: lang }))
        .filter((r: QaResult) => r.ready)
        .map((r: QaResult) => r.text);
      // Google needs at least 3 values; otherwise the snippet is omitted.
      search.structuredSnippet = values.length >= 3 ? { ...s.structuredSnippet, values } : undefined;
    }
    // Google responsive search ads need at least 3 headlines and 2 descriptions.
    const readyCount = (list: any[] | undefined) => (list || []).filter((x: any) => x.qaReady && x.text).length;
    if (Array.isArray(s.headlines) && readyCount(search.headlines) < 3) {
      report.ready = false;
      report.issues.push({ field: 'searchAds.headlines', text: `${readyCount(search.headlines)} ready headlines (Google needs at least 3)`, issues: ['too_few_assets'] });
    }
    if (Array.isArray(s.descriptions) && readyCount(search.descriptions) < 2) {
      report.ready = false;
      report.issues.push({ field: 'searchAds.descriptions', text: `${readyCount(search.descriptions)} ready descriptions (Google needs at least 2)`, issues: ['too_few_assets'] });
    }
    out.searchAds = search;
  }
  const d = campaign.displayAds;
  if (d) {
    const fd = fb?.displayAds || {};
    const display: AnyCampaign = { ...d };
    for (const [key, max] of [['shortHeadline', L.displayShortHeadline], ['longHeadline', L.displayLongHeadline], ['description', L.displayDescription]] as const) {
      if (typeof d[key] !== 'string') continue;
      const r = gate(`displayAds.${key}`, d[key], max, undefined, fd[key] ? [fd[key]] : []);
      display[key] = r.text;
      display[`${key}CharCount`] = r.text.length;
      display[`${key}CharWidth`] = countCharacterWidth(r.text);
    }
    if (typeof d.ctaText === 'string') display.ctaText = gate('displayAds.ctaText', d.ctaText, 30).text;
    if (typeof d.bannerHeadlineZh === 'string' && d.bannerHeadlineZh) display.bannerHeadlineZh = gate('displayAds.bannerHeadlineZh', d.bannerHeadlineZh, undefined).text;
    if (typeof d.bannerSubtextZh === 'string' && d.bannerSubtextZh) display.bannerSubtextZh = gate('displayAds.bannerSubtextZh', d.bannerSubtextZh, undefined).text;
    out.displayAds = display;
  }
  // China channels are length-fitted by their own generators; check form and tone here.
  const china: Array<[string, string[]]> = [['weiboPost', ['hook']], ['wechatAd', ['headline', 'description', 'cta']]];
  for (const [channel, fields] of china) {
    const c = campaign[channel];
    if (!c || typeof c !== 'object') continue;
    const next: AnyCampaign = { ...c };
    for (const k of fields) {
      if (typeof c[k] === 'string' && c[k]) next[k] = gate(`${channel}.${k}`, c[k], undefined).text;
    }
    // The Weibo body carries links and hashtags: only flag half brackets there.
    if (channel === 'weiboPost' && typeof c.body === 'string' && unbalancedMarks(c.body).length) {
      report.ready = false;
      report.issues.push({ field: 'weiboPost.body', text: c.body, issues: ['unbalanced_brackets'] });
    }
    out[channel] = next;
  }
  // Baidu Search, 360 Search and 360 Display: platform policy rules on top of the
  // generic checks. A failing line is repaired without shortening, swapped for a complete
  // alternative, or dropped. It is never truncated.
  const sourcedPhrases = zhQuartileCandidates(campaign.clarivateFacts);
  const platformGate = (field: string, platform: ChinaPlatform, kind: 'title' | 'description', text: string, alternatives: string[], required: boolean): string => {
    report.checked++;
    const generic = (t: string) => checkAdText(t, { language: 'ZH', prohibitedTerms: opts.prohibitedTerms });
    const pool = alternatives.filter((a) => !generic(a).length);
    const r = finalizePlatformText(text, platform, kind, pool, { sourcedPhrases });
    let finalText = r.text;
    let issues: QaIssue[] = r.issues;
    if (r.ready && generic(finalText).length) {
      const alt = pool.find((a) => a !== finalText && !checkPlatformText(a, platform, kind, { sourcedPhrases }).length);
      if (alt) { finalText = alt; report.replaced++; }
      else { issues = generic(finalText); finalText = ''; }
    } else if (r.outcome === 'repaired') report.repaired++;
    else if (r.outcome === 'alternative') report.replaced++;
    if (!finalText) {
      if (text) report.issues.push({ field, text, issues: issues.length ? issues : ['empty'] });
      if (required) report.ready = false;
    }
    return finalText;
  };
  for (const [key, platform] of [['baiduSearchAd', 'baidu'], ['so360SearchAd', 'so360']] as const) {
    const ad = campaign[key];
    if (!ad || typeof ad !== 'object') continue;
    const alt = ad.alternatives || { title: [], description: [] };
    const title = platformGate(`${key}.title`, platform, 'title', ad.title || '', alt.title || [], true);
    const used = new Set<string>();
    const d1 = platformGate(`${key}.description1`, platform, 'description', ad.description1 || '', (alt.description || []).concat(ad.description2 ? [ad.description2] : []), true);
    used.add(d1);
    // Description 2 must add a new fact: the original and any alternative are held to the same-fact rule.
    const d2Original = ad.description2 && !used.has(ad.description2) && !sameFact(ad.description2, d1) ? ad.description2 : '';
    const d2Pool = (alt.description || []).filter((t: string) => !used.has(t) && !sameFact(t, d1));
    const d2 = ad.description2 ? platformGate(`${key}.description2`, platform, 'description', d2Original || d2Pool[0] || '', d2Original ? d2Pool : d2Pool.slice(1), false) : '';
    out[key] = { ...ad, title, description1: d1, description2: d2 === d1 ? '' : d2 };
  }
  const disp = campaign.so360DisplayAd;
  if (disp && typeof disp === 'object') {
    const alt = disp.alternatives || { title: [], description: [] };
    const used = new Set<string>();
    const titles = (disp.titles || [])
      .map((t: string, i: number) => {
        const r = platformGate(`so360DisplayAd.titles[${i}]`, 'so360Display', 'title', t, (alt.title || []).filter((x: string) => !used.has(x)), false);
        if (r) used.add(r);
        return r;
      })
      .filter(Boolean)
      .filter((t: string, i: number, arr: string[]) => arr.indexOf(t) === i)
      .slice(0, CHINA_PLATFORM_LIMITS.so360Display.maxTitles);
    if (titles.length < CHINA_PLATFORM_LIMITS.so360Display.minTitles) {
      report.ready = false;
      report.issues.push({ field: 'so360DisplayAd.titles', text: `${titles.length} ready titles (360 Display needs at least 2)`, issues: ['too_few_assets'] });
    }
    const description = platformGate('so360DisplayAd.description', 'so360Display', 'description', disp.description || '', alt.description || [], true);
    out.so360DisplayAd = { ...disp, titles, description };
  }
  out.copyQa = report;
  return out as T & { copyQa: CampaignCopyQa };
}
