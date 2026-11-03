import { WosJifRank } from '../types';

/**
 * JCR quartiles are per subject category. A journal listed in several
 * categories can be Q1 in one and Q2 in another. Ads use the best (lowest
 * number) quartile and must always name the category it belongs to.
 */
export interface BestQuartile {
  quartile: string;
  category: string;
  rank?: string;
}

function quartileNumber(value: unknown): number | null {
  const m = typeof value === 'string' ? value.trim().match(/^Q([1-4])$/i) : null;
  return m ? Number(m[1]) : null;
}

function percentile(rank: WosJifRank): number {
  const raw = rank.jifPercentile;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : -1;
}

/** Best quartile with a named category. Ties go to the higher JIF percentile. */
export function bestJifRank(ranks: WosJifRank[] | null | undefined): BestQuartile | null {
  let best: WosJifRank | null = null;
  for (const rank of ranks || []) {
    const q = quartileNumber(rank?.quartile);
    if (q == null || !rank.category?.trim()) continue;
    if (!best) { best = rank; continue; }
    const bq = quartileNumber(best.quartile)!;
    if (q < bq || (q === bq && percentile(rank) > percentile(best))) best = rank;
  }
  if (!best) return null;
  return { quartile: best.quartile!.trim().toUpperCase(), category: best.category!.trim(), rank: best.rank };
}

interface QuartileCarrier {
  jcrQuartile?: string | null;
  jcrQuartileCategory?: string | null;
  jifRanks?: WosJifRank[];
  jcrYear?: number | null;
}

/** Category that goes with the record's quartile, from the field or from the ranks. */
export function quartileCategory(facts: QuartileCarrier | null | undefined): string | null {
  if (!facts?.jcrQuartile) return null;
  const q = String(facts.jcrQuartile).trim().toUpperCase();
  if (facts.jcrQuartileCategory?.trim()) return facts.jcrQuartileCategory.trim();
  const match = (facts.jifRanks || []).filter((r) => r?.category?.trim() && String(r.quartile || '').trim().toUpperCase() === q);
  if (!match.length) return null;
  return match.sort((a, b) => percentile(b) - percentile(a))[0].category!.trim();
}

const SMALL_WORDS = new Set(['and', 'of', 'in', 'the', 'for', 'on', 'to', 'with']);

/** Clarivate sends category names in capitals ("INFORMATION SCIENCE & LIBRARY SCIENCE"). Ads use title case. */
export function displayCategory(category: string): string {
  const trimmed = category.trim();
  if (trimmed !== trimmed.toUpperCase()) return trimmed;
  return trimmed
    .toLowerCase()
    .split(/(\s+|-|\/)/)
    .map((word, i) => (i > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join('');
}

/** "Q1 in Information Science & Library Science (Clarivate JCR 2025)". Null without a category. */
export function formatQuartileClaim(facts: QuartileCarrier | null | undefined, opts: { clarivate?: boolean } = {}): string | null {
  const category = quartileCategory(facts);
  if (!facts?.jcrQuartile || !category) return null;
  const q = String(facts.jcrQuartile).trim().toUpperCase();
  const source = opts.clarivate !== false && facts.jcrYear ? ` (Clarivate JCR ${facts.jcrYear})` : '';
  return `${q} in ${displayCategory(category)}${source}`;
}

const fold = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** True when the text names the quartile's category, so the quartile is not bare. */
export function textNamesQuartileCategory(text: string, facts: QuartileCarrier | null | undefined): boolean {
  const category = quartileCategory(facts);
  return !!category && fold(text).includes(fold(category));
}
