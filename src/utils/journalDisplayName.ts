/**
 * Journal display name for ad copy on every channel (Google, Weibo, WeChat, Baidu, 360).
 * Shared by server.ts and src/china so neither imports the other.
 *
 * Order:
 *   1. The landing-page title.
 *   2. A user-entered or catalog full title.
 *   3. Clarivate's full title (Web of Science name), title-cased when all caps,
 *      keeping known acronyms such as BMC.
 *   Never Clarivate's abbreviated form (JCR or ISO abbreviation: "BMC MED", "BMC Med.").
 */

const PLACEHOLDER_LABEL = /^(unknown journal|unknown publisher|journal|本期刊)$/i;

export function labelText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed || PLACEHOLDER_LABEL.test(trimmed)) return '';
  return trimmed;
}

/** True when every letter is uppercase, as in the Web of Science id NATURE. */
export function isShoutyLabel(value: string): boolean {
  const letters = (value || '').replace(/[^A-Za-z]/g, '');
  return letters.length >= 2 && letters === letters.toUpperCase();
}

/** Society and publisher acronyms that stay uppercase when an all-caps name is title-cased. */
export const DISPLAY_ACRONYMS = new Set([
  'ACM', 'ACS', 'AIP', 'AMS', 'APS', 'ASME', 'BMC', 'BMJ', 'CA', 'EMBO', 'IEEE', 'IET', 'IOP', 'JAMA',
  'NEJM', 'OSA', 'PLOS', 'PNAS', 'RNA', 'DNA', 'RSC', 'SIAM', 'SPIE', 'AIDS', 'ACS', 'ISME', 'JCI',
]);
const SMALL_WORDS = new Set(['and', 'of', 'in', 'the', 'for', 'on', 'to', 'with', 'a', 'an', 'at', 'by', 'or']);

/** Title-case an all-caps label. Mixed-case text is left as it arrived. */
export function toDisplayCase(value: string): string {
  if (!value || !isShoutyLabel(value)) return value;
  let index = 0;
  return value.replace(/[A-Za-z0-9]+/g, (word) => {
    const upper = word.toUpperCase();
    const first = index++ === 0;
    if (DISPLAY_ACRONYMS.has(upper)) return upper;
    const lower = upper.toLowerCase();
    if (!first && SMALL_WORDS.has(lower)) return lower;
    return upper.charAt(0) + lower.slice(1);
  });
}

export interface JournalNameCarrier {
  journalName?: string | null;
  jcrTitle?: string | null;
  isoTitle?: string | null;
  wosName?: string | null;
  /** Journal name as it was before Clarivate merged in, and where it came from. */
  landingJournalName?: string | null;
  landingJournalNameSource?: string | null;
  provenanceMap?: Record<string, { source?: string } | undefined> | null;
  journalTitle?: { value?: string | null } | string | null;
}

const fold = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * True for a Clarivate abbreviation: a word ending in "." ("Med."), or the JCR/ISO title
 * when the Web of Science name is longer ("BMC MED" vs "BMC Medicine").
 */
export function isAbbreviatedJournalName(name: string, facts: JournalNameCarrier): boolean {
  const text = labelText(name);
  if (!text) return false;
  if (/\b[A-Za-z]{1,6}\.(\s|$)/.test(text)) return true;
  const full = labelText(facts.wosName);
  const f = fold(text);
  const abbreviations = [facts.jcrTitle, facts.isoTitle].map((v) => fold(labelText(v))).filter(Boolean);
  if (full && abbreviations.includes(f) && fold(full).length > f.length) return true;
  return false;
}

function pageTitle(facts: JournalNameCarrier): string {
  const jt = facts.journalTitle;
  if (typeof jt === 'string') return labelText(jt);
  return labelText(jt?.value);
}

const PAGE_SOURCES = /page|landing/i;
const USER_OR_CATALOG = /user|catalog|snapshot/i;

export function displayJournalName(facts: JournalNameCarrier | null | undefined, landingName?: string | null): string {
  const f = facts || {};
  const ok = (v: unknown) => {
    const t = labelText(v);
    return t && !isAbbreviatedJournalName(t, f) ? t : '';
  };
  const landing = labelText(landingName ?? f.landingJournalName);
  const landingSource = String(f.landingJournalNameSource || f.provenanceMap?.journalName?.source || '');
  const clarivateNames = new Set([f.jcrTitle, f.isoTitle, f.wosName].map((v) => fold(labelText(v))).filter(Boolean));
  const fromClarivate = (v: string) => clarivateNames.has(fold(v));

  // 1. Landing-page title (mixed case; an all-caps page title is title-cased).
  const page = ok(pageTitle(f)) || (landing && (!landingSource || PAGE_SOURCES.test(landingSource)) && !fromClarivate(landing) ? ok(landing) : '');
  if (page) return toDisplayCase(page);
  // 2. User-entered or catalog full title.
  if (landing && USER_OR_CATALOG.test(landingSource)) {
    const t = ok(landing);
    if (t) return toDisplayCase(t);
  }
  const current = labelText(f.journalName);
  if (current && !fromClarivate(current) && ok(current)) return toDisplayCase(current);
  // 3. Clarivate full title, then any non-abbreviated Clarivate label, title-cased.
  for (const v of [f.wosName, f.isoTitle, f.jcrTitle, f.journalName, landing]) {
    const t = ok(v);
    if (t) return toDisplayCase(t);
  }
  // Only abbreviations exist: expand nothing, but never return a dotted ISO form.
  const last = labelText(f.wosName) || labelText(f.journalName) || landing;
  return last ? toDisplayCase(last.replace(/\./g, '')) : 'Journal';
}
