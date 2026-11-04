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

export interface SubjectHints {
  /** Journal title(s). Weighted most heavily. */
  titles?: (string | null | undefined)[];
  /** Scope text, discipline, keywords from the landing page. */
  scope?: (string | null | undefined)[];
}

const CATEGORY_STOP = new Set(['and', 'of', 'in', 'the', 'for', 'on', 'to', 'with', 'general', 'internal', 'interdisciplinary', 'applications', 'multidisciplinary', 'science', 'sciences', 'research', 'studies', 'other', 'topics']);
const SUBJECT_SYNONYMS: Record<string, string[]> = {
  oncology: ['cancer', 'tumor', 'tumour', 'carcinoma', 'onco'],
  'medicine, general & internal': ['medicine', 'medical', 'clinical'],
  'information science & library science': ['scientometric', 'bibliometric', 'informetric', 'library', 'information'],
  'genetics & heredity': ['genetic', 'genomic', 'heredity'],
  'cell biology': ['cell', 'cellular'],
};

function words(text: string): string[] {
  return fold(text).split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
}

/** Two words share a subject stem: a common prefix of at least 4 letters covering most of the shorter word. */
function stemMatch(a: string, b: string): boolean {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= 4 && i >= Math.min(a.length, b.length) - 3;
}

function hits(terms: string[], textWords: string[]): number {
  let n = 0;
  for (const t of terms) if (textWords.some((w) => stemMatch(w, t) || (t.length >= 4 && w.startsWith(t)))) n++;
  return n;
}

/** How well a category name matches the journal's subject. 0 = no match. */
export function subjectMatchScore(category: string, hints: SubjectHints | null | undefined): number {
  if (!hints) return 0;
  const terms = Array.from(new Set([
    ...words(category).filter((w) => !CATEGORY_STOP.has(w)),
    ...(SUBJECT_SYNONYMS[fold(category).trim()] || []),
  ]));
  if (!terms.length) return 0;
  const titleWords = words((hints.titles || []).filter(Boolean).join(' '));
  const scopeWords = words((hints.scope || []).filter(Boolean).join(' '));
  return 10 * hits(terms, titleWords) + Math.min(hits(terms, scopeWords), 5);
}

/**
 * Best quartile with a named category. When several categories share it, the
 * one that best matches the journal's subject wins; the higher JIF percentile
 * decides only when the subject match is equal (e.g. nothing matches).
 */
export function bestJifRank(ranks: WosJifRank[] | null | undefined, hints?: SubjectHints | null): BestQuartile | null {
  let best: WosJifRank | null = null;
  let bestScore = -1;
  for (const rank of ranks || []) {
    const q = quartileNumber(rank?.quartile);
    if (q == null || !rank.category?.trim()) continue;
    const score = subjectMatchScore(rank.category, hints);
    if (!best) { best = rank; bestScore = score; continue; }
    const bq = quartileNumber(best.quartile)!;
    if (q < bq || (q === bq && (score > bestScore || (score === bestScore && percentile(rank) > percentile(best))))) {
      best = rank; bestScore = score;
    }
  }
  if (!best) return null;
  return { quartile: best.quartile!.trim().toUpperCase(), category: best.category!.trim(), rank: best.rank };
}

/** Subject hints from a journal record: titles plus landing-page scope facts. */
export function subjectHintsFrom(facts: any): SubjectHints {
  const val = (v: any) => (v && typeof v === 'object' && 'value' in v ? v.value : v);
  const list = (v: any) => (Array.isArray(v) ? v.join(' ') : val(v));
  return {
    titles: [facts?.journalName, facts?.jcrTitle, facts?.isoTitle, facts?.wosName, val(facts?.journalTitle)],
    scope: [facts?.aimsAndScopeSummary, val(facts?.aimsAndScopeSummary), facts?.primaryDiscipline, list(facts?.keywords), list(facts?.scopeKeywords), list(facts?.researchTopics)]
      .map((v) => (typeof v === 'string' ? v : null)),
  };
}

/**
 * Re-pick the category among those tied at the record's quartile using the
 * journal's subject. Leaves user-entered categories that are not in the ranks alone.
 */
export function refineQuartileCategory<T extends { jcrQuartile?: string | null; jcrQuartileCategory?: string | null; jifRanks?: WosJifRank[] }>(facts: T): T {
  if (!facts?.jcrQuartile || !facts.jifRanks?.length) return facts;
  const q = String(facts.jcrQuartile).trim().toUpperCase();
  const tied = facts.jifRanks.filter((r) => r?.category?.trim() && String(r.quartile || '').trim().toUpperCase() === q);
  if (tied.length < 2) return facts;
  const current = facts.jcrQuartileCategory?.trim();
  if (current && !tied.some((r) => fold(r.category!) === fold(current))) return facts;
  const pick = bestJifRank(tied, subjectHintsFrom(facts));
  return pick ? { ...facts, jcrQuartileCategory: pick.category } : facts;
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
  facts = refineQuartileCategory(facts);
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
