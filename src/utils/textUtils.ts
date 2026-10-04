/**
 * Text processing utilities for Google Ads compliance, CJK double-width calculation,
 * and language purity verification.
 */

// CJK Unicode Range: Common CJK ideographs, extension A, symbols, punctuation, and full-width forms
export const CJK_REGEX = /[\u4e00-\u9fa5\u3400-\u4dbf\u3000-\u303f\uff01-\uffee]/g;
export const LATIN_LETTER_REGEX = /[a-zA-Z]/g;

/**
 * Calculates character width according to Google Ads standards:
 * - CJK characters (Chinese, Japanese, Korean) take 2 units of width.
 * - Latin, numbers, and standard ASCII punctuation take 1 unit of width.
 * A 30-char limit in Google Ads allows either 30 English letters, 15 Chinese characters, or combinations.
 */
export function countCharacterWidth(text: string, language: 'EN' | 'ZH' | 'auto' = 'auto'): number {
  if (!text) return 0;
  const cjkChars = (text.match(CJK_REGEX) || []).length;
  const otherChars = text.length - cjkChars;
  return (cjkChars * 2) + otherChars;
}

/**
 * Checks whether text strictly adheres to the selected language:
 * - In EN mode: Must contain ZERO CJK ideographs.
 * - In ZH mode: Must contain ZERO Latin alphabet characters (allowed: Chinese characters, digits, common punctuation).
 */
export function validateLanguagePurity(
  text: string,
  targetLanguage: 'EN' | 'ZH'
): { valid: boolean; strayChars: string[] } {
  if (!text) return { valid: true, strayChars: [] };

  if (targetLanguage === 'EN') {
    const cjkMatches = text.match(CJK_REGEX) || [];
    const uniqueStray = Array.from(new Set(cjkMatches));
    return {
      valid: uniqueStray.length === 0,
      strayChars: uniqueStray,
    };
  }

  if (targetLanguage === 'ZH') {
    // In Chinese mode, latin letters a-z/A-Z should not be present (except perhaps standard acronyms if permitted, but per prompt: reject if Latin letters appear outside ASCII punctuation/numbers)
    const latinMatches = text.match(LATIN_LETTER_REGEX) || [];
    const uniqueStray = Array.from(new Set(latinMatches));
    return {
      valid: uniqueStray.length === 0,
      strayChars: uniqueStray,
    };
  }

  return { valid: true, strayChars: [] };
}

/**
 * Strips stray characters from text to restore purity.
 */
export function cleanStrayCharacters(text: string, targetLanguage: 'EN' | 'ZH'): string {
  if (!text) return '';
  if (targetLanguage === 'EN') {
    return text.replace(CJK_REGEX, '').replace(/\s{2,}/g, ' ').trim();
  }
  if (targetLanguage === 'ZH') {
    return text.replace(LATIN_LETTER_REGEX, '').replace(/\s{2,}/g, ' ').trim();
  }
  return text;
}

/**
 * Smart clamps text to a maximum visual character width without cutting words mid-stride.
 * - For English: respects word boundaries.
 * - For Chinese: respects character boundaries.
 * - Respects the 2-width weight for CJK characters.
 */
export function smartClampWithWidth(text: string, maxWidth: number): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (countCharacterWidth(trimmed) <= maxWidth) {
    return trimmed;
  }

  // Iteratively reduce until width fits
  let slice = trimmed;
  while (countCharacterWidth(slice) > maxWidth && slice.length > 0) {
    slice = slice.slice(0, -1);
  }

  // If the last character was in the middle of an English word, back up to the previous word boundary
  const lastChar = slice.slice(-1);
  const nextChar = trimmed.charAt(slice.length);

  if (/[a-zA-Z0-9]/.test(lastChar) && /[a-zA-Z0-9]/.test(nextChar)) {
    const lastSpace = slice.lastIndexOf(' ');
    if (lastSpace > 5) {
      slice = slice.slice(0, lastSpace);
    }
  }

  // Clean trailing punctuation
  return slice.replace(/[,;:\-\s·/|]+$/, '').trim();
}

/**
 * Formats character display label based on language:
 * e.g., "14/30 chars" (EN) or "7/15 chars (14/30 width)" (ZH)
 */
export function formatCharCountLabel(text: string, language?: 'EN' | 'ZH'): string {
  const width = countCharacterWidth(text);
  const rawLength = text.length;
  const hasCJK = (text.match(CJK_REGEX) || []).length > 0;

  if (language === 'ZH' || hasCJK) {
    // 30 max width = 15 CJK chars
    const cjkEquiv = Math.ceil(width / 2);
    return `${rawLength} chars (${width}/30 width)`;
  }
  return `${width}/30 chars`;
}

export function formatDescriptionCountLabel(text: string, language?: 'EN' | 'ZH'): string {
  const width = countCharacterWidth(text);
  const rawLength = text.length;
  const hasCJK = (text.match(CJK_REGEX) || []).length > 0;

  if (language === 'ZH' || hasCJK) {
    return `${rawLength} chars (${width}/90 width)`;
  }
  return `${width}/90 chars`;
}
