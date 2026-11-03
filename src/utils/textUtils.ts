/**
 * Text processing utilities for Google Ads compliance, CJK double-width calculation,
 * and language purity verification (EN, ZH, JA).
 */

// CJK Unicode Range: Includes CJK ideographs, Hiragana (\u3040-\u309f), Katakana (\u30a0-\u30ff),
// CJK Symbols/Punctuation (\u3000-\u303f), Fullwidth forms (\uff01-\uffee)
export const CJK_REGEX = /[\u4e00-\u9fa5\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\u3000-\u303f\uff01-\uffee]/g;
export const JAPANESE_KANA_REGEX = /[\u3040-\u309f\u30a0-\u30ff]/g;
export const LATIN_LETTER_REGEX = /[a-zA-Z]/g;

/**
 * Calculates character width according to Google Ads standards:
 * - CJK characters (Chinese, Japanese Kanji/Hiragana/Katakana, Korean) take 2 units of width.
 * - Latin letters, numbers, and standard ASCII punctuation take 1 unit of width.
 * A 30-char limit in Google Ads allows either 30 English letters, 15 Chinese/Japanese characters, or combinations.
 */
export function countCharacterWidth(text: string, _language?: 'EN' | 'ZH' | 'JA' | 'auto'): number {
  if (!text) return 0;
  const cjkChars = (text.match(CJK_REGEX) || []).length;
  const otherChars = text.length - cjkChars;
  return (cjkChars * 2) + otherChars;
}

/** Latin terms always allowed inside ZH/JA copy (brand names and standard acronyms). */
export const DEFAULT_ALLOWED_LATIN_TERMS = ['Springer Nature', 'Nature Portfolio', 'Springer', 'Nature', 'BMC', 'APC', 'OA', 'JCR', 'JIF', 'SCI', 'SCIE', 'SSCI', 'DOI', 'ISSN', 'Clarivate', 'Web of Science', 'PubMed', 'Scopus'];

/** Brand terms for one journal: its name, publisher and the default list, longest first. */
export function brandTermsFor(facts?: { journalName?: string | null; publisher?: string | null } | null, extra: string[] = []): string[] {
  const terms = [facts?.journalName || '', facts?.publisher || '', ...extra, ...DEFAULT_ALLOWED_LATIN_TERMS]
    .map((t) => t.trim())
    .filter((t) => /[a-zA-Z]/.test(t));
  return Array.from(new Set(terms)).sort((a, b) => b.length - a.length);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Replace allowed Latin terms with placeholders so purity checks and cleaning leave them alone. */
function maskTerms(text: string, terms: string[]): { masked: string; restore: (s: string) => string } {
  const found: string[] = [];
  let masked = text;
  for (const term of terms) {
    const re = new RegExp(`(?<![A-Za-z])${escapeRegex(term)}(?![A-Za-z])`, 'gi');
    masked = masked.replace(re, (m) => {
      found.push(m);
      return `\u0000${found.length - 1}\u0000`;
    });
  }
  return {
    masked,
    restore: (s: string) => s.replace(/\u0000(\d+)\u0000/g, (_m, i) => found[Number(i)] ?? ''),
  };
}

/**
 * Checks whether text strictly adheres to the selected language:
 * - In EN mode: Must contain ZERO CJK/Japanese characters.
 * - In ZH mode: no Latin letters and no Japanese Kana, except allowed brand terms.
 * - In JA mode: no Latin letters, except the journal name, publisher and allowed brand terms.
 */
export function validateLanguagePurity(
  text: string,
  targetLanguage: 'EN' | 'ZH' | 'JA',
  allowedTerms: string[] = DEFAULT_ALLOWED_LATIN_TERMS
): { valid: boolean; strayChars: string[] } {
  if (!text) return { valid: true, strayChars: [] };

  if (targetLanguage === 'EN') {
    const uniqueStray = Array.from(new Set(text.match(CJK_REGEX) || []));
    return { valid: uniqueStray.length === 0, strayChars: uniqueStray };
  }

  const { masked } = maskTerms(text, brandTermsFor(null, allowedTerms));
  const latin = masked.match(LATIN_LETTER_REGEX) || [];
  const kana = targetLanguage === 'ZH' ? masked.match(JAPANESE_KANA_REGEX) || [] : [];
  const uniqueStray = Array.from(new Set([...latin, ...kana]));
  return { valid: uniqueStray.length === 0, strayChars: uniqueStray };
}

/**
 * Strips stray characters from text to restore purity. Allowed Latin terms
 * (journal name, publisher, brand acronyms) are kept intact in ZH/JA.
 */
export function cleanStrayCharacters(
  text: string,
  targetLanguage: 'EN' | 'ZH' | 'JA',
  allowedTerms: string[] = DEFAULT_ALLOWED_LATIN_TERMS
): string {
  if (!text) return '';
  if (targetLanguage === 'EN') {
    return text.replace(CJK_REGEX, '').replace(/\s{2,}/g, ' ').trim();
  }
  const { masked, restore } = maskTerms(text, brandTermsFor(null, allowedTerms));
  let cleaned = masked.replace(/[a-zA-Z]+/g, '');
  if (targetLanguage === 'ZH') cleaned = cleaned.replace(JAPANESE_KANA_REGEX, '');
  return balanceBrackets(restore(cleaned).replace(/\s{2,}/g, ' ').trim());
}

/** Bracket and quote pairs checked in every language, incl. full-width CJK forms. */
export const BRACKET_PAIRS: Record<string, string> = {
  '(': ')', '[': ']', '{': '}', '（': '）', '「': '」', '『': '』', '【': '】', '《': '》', '〈': '〉', '〔': '〕', '“': '”', '‘': '’', '［': '］', '｛': '｝',
};
const CLOSERS = new Map(Object.entries(BRACKET_PAIRS).map(([o, c]) => [c, o]));
const SYMMETRIC_QUOTES = ['"', '＂'];

/** Indexes of brackets/quotes that have no partner. */
export function unbalancedMarks(text: string): number[] {
  const stack: { ch: string; i: number }[] = [];
  const bad: number[] = [];
  const quoteOpen: Record<string, number> = {};
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (SYMMETRIC_QUOTES.includes(ch)) {
      if (quoteOpen[ch] === undefined) quoteOpen[ch] = i;
      else delete quoteOpen[ch];
    } else if (BRACKET_PAIRS[ch]) {
      stack.push({ ch, i });
    } else if (CLOSERS.has(ch)) {
      const top = stack[stack.length - 1];
      if (top && BRACKET_PAIRS[top.ch] === ch) stack.pop();
      else bad.push(i);
    }
  }
  return [...bad, ...stack.map((s) => s.i), ...Object.values(quoteOpen)].sort((a, b) => a - b);
}

/** Remove brackets/quotes that have no partner, so no half bracket is ever shown. */
export function balanceBrackets(text: string): string {
  const bad = new Set(unbalancedMarks(text));
  if (bad.size === 0) return text;
  return text.split('').filter((_c, i) => !bad.has(i)).join('').replace(/\s{2,}/g, ' ').trim();
}

const EN_TRAILING_WORDS = /\s+(and|or|of|for|the|a|an|to|with|in|on|by|at|from|via|&|\+)$/i;
const TRAILING_PUNCT = /[\s,;:\-–—·/|、，；：・&+]+$/;
const JA_TRAILING_PARTICLES = /[のとやをがで]$/;
const BOUNDARY = /[\s·|/\-–—,，、。；;:：！!？?・]/;

/** Strip connector words and punctuation a cut can leave at the end. */
export function stripTrailingFragments(text: string, language?: 'EN' | 'ZH' | 'JA'): string {
  let out = text.trim();
  for (let guard = 0; guard < 6; guard++) {
    const before = out;
    out = out.replace(TRAILING_PUNCT, '').replace(EN_TRAILING_WORDS, '').trim();
    if (language === 'JA' && JA_TRAILING_PARTICLES.test(out) && out.length > 4) out = out.slice(0, -1).trim();
    if (out === before) break;
  }
  return out;
}

const isLatinWordChar = (ch: string) => /[A-Za-z0-9'’]/.test(ch);
const isCjk = (ch: string) => /[\u4e00-\u9fa5\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff]/.test(ch);

/**
 * Shorten to maxWidth at a word or phrase boundary. Never cuts inside a Latin
 * word or leaves half a bracket. Returns '' when nothing sensible fits.
 */
export function safeShorten(text: string, maxWidth: number, language?: 'EN' | 'ZH' | 'JA'): string {
  if (!text) return '';
  const clean = text.replace(/\s+/g, ' ').trim();
  if (countCharacterWidth(clean) <= maxWidth && unbalancedMarks(clean).length === 0) return clean;
  if (countCharacterWidth(clean) <= maxWidth) return stripTrailingFragments(balanceBrackets(clean), language);

  // Candidate cut points: punctuation/space boundaries first, then CJK character boundaries.
  const strong: number[] = [];
  const weak: number[] = [];
  for (let i = 1; i < clean.length; i++) {
    const prev = clean[i - 1];
    const next = clean[i];
    if (BOUNDARY.test(next) || BOUNDARY.test(prev) || CLOSERS.has(prev)) strong.push(i);
    else if ((isCjk(prev) || isCjk(next)) && !(isLatinWordChar(prev) && isLatinWordChar(next))) weak.push(i);
  }
  const tryCut = (cuts: number[]) => {
    for (const cut of cuts.sort((a, b) => b - a)) {
      let candidate = clean.slice(0, cut);
      // Drop an unclosed bracket and everything after it instead of leaving half.
      const bad = unbalancedMarks(candidate);
      if (bad.length) candidate = candidate.slice(0, bad[0]);
      candidate = stripTrailingFragments(candidate, language);
      if (candidate && countCharacterWidth(candidate) <= maxWidth && unbalancedMarks(candidate).length === 0) {
        return candidate;
      }
    }
    return '';
  };
  const strongCut = tryCut(strong);
  // A strong boundary that keeps at least half the room beats a CJK mid-phrase cut.
  if (strongCut && countCharacterWidth(strongCut) >= maxWidth / 2) return strongCut;
  return tryCut(weak) || strongCut;
}

/**
 * Smart clamps text to a maximum visual character width without cutting words
 * mid-stride or leaving half brackets. Respects the 2-width weight for CJK/Kana.
 */
export function smartClampWithWidth(text: string, maxWidth: number): string {
  return safeShorten(text, maxWidth);
}

/** Shorten a name (journal, publisher) to whole words; '' when even the first word is too long. */
export function shortenName(name: string, maxChars: number): string {
  const clean = (name || '').trim();
  if (clean.length <= maxChars) return clean;
  const words = clean.split(/\s+/);
  let out = '';
  for (const w of words) {
    const next = out ? `${out} ${w}` : w;
    if (next.length > maxChars) break;
    out = next;
  }
  return stripTrailingFragments(out);
}

/**
 * Formats character display label based on language:
 * e.g., "14/30 chars" (EN) or "7/15 chars (14/30 width)" (ZH / JA)
 */
export function formatCharCountLabel(text: string, language?: 'EN' | 'ZH' | 'JA'): string {
  const width = countCharacterWidth(text);
  const rawLength = text.length;
  const hasCJK = (text.match(CJK_REGEX) || []).length > 0;

  if (language === 'ZH' || language === 'JA' || hasCJK) {
    // 30 max width = 15 CJK/Kana chars
    return `${rawLength} chars (${width}/30 width)`;
  }
  return `${width}/30 chars`;
}

export function formatDescriptionCountLabel(text: string, language?: 'EN' | 'ZH' | 'JA'): string {
  const width = countCharacterWidth(text);
  const rawLength = text.length;
  const hasCJK = (text.match(CJK_REGEX) || []).length > 0;

  if (language === 'ZH' || language === 'JA' || hasCJK) {
    return `${rawLength} chars (${width}/90 width)`;
  }
  return `${width}/90 chars`;
}
