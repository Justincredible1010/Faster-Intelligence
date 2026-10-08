import type { StageCode } from '../types';

/**
 * Page roles the suggestion can rank. A role never becomes a URL by itself.
 * It only selects a link already extracted from the journal page, or that
 * journal's known landing URL.
 */
export const STAGE_URL_ROLES = [
  'journal-home',
  'about',
  'aims-and-scope',
  'article-types',
  'publishing-options',
  'journal-metrics',
  'author-guidelines',
  'submission-checklist',
  'submission-portal',
] as const;

export type StageUrlRole = (typeof STAGE_URL_ROLES)[number];

export const STAGE_URL_ROLE_LABELS: Record<StageUrlRole, string> = {
  'journal-home': 'Journal home',
  about: 'About',
  'aims-and-scope': 'Aims and scope',
  'article-types': 'Article types',
  'publishing-options': 'Publishing options',
  'journal-metrics': 'Journal metrics',
  'author-guidelines': 'Author guidelines',
  'submission-checklist': 'Submission checklist',
  'submission-portal': 'Submission portal',
};

/** Ordered patterns for each funnel stage. Source holds this default; a saved copy overrides it. */
export interface StageUrlRules {
  AWA: string[];
  CON: string[];
  DEC: string[];
}

/**
 * Today's suggestion order.
 * Awareness accepts only the journal home, so a subpage still offers that home.
 * Consideration tries aims, then article types, publishing options, and metrics.
 * Decision tries author guidelines, then the checklist, then the submission portal.
 */
export const DEFAULT_STAGE_URL_RULES: StageUrlRules = {
  AWA: ['journal-home'],
  CON: ['aims-and-scope', 'article-types', 'publishing-options', 'journal-metrics'],
  DEC: ['author-guidelines', 'submission-checklist', 'submission-portal'],
};

const STAGES: StageCode[] = ['AWA', 'CON', 'DEC'];
const MAX_PATTERNS = 12;
const MAX_PATTERN_LENGTH = 80;

const ROLE_SET = new Set<string>(STAGE_URL_ROLES);

export function isStageUrlRole(value: string): value is StageUrlRole {
  return ROLE_SET.has(value);
}

/**
 * A path pattern is a slug or a path suffix such as `submit` or `ncomms/research-articles`.
 * A full URL is rejected so a saved rule cannot invent an address.
 */
export function isPathPattern(value: string): boolean {
  if (!value || value.length > MAX_PATTERN_LENGTH) return false;
  if (value.includes('://') || value.includes('..') || /[?#\\\s]/.test(value)) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(value);
}

export function parseStageUrlPattern(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  if (!value || value.length > MAX_PATTERN_LENGTH) return null;
  if (isStageUrlRole(value) || isPathPattern(value)) return value;
  return null;
}

/** Returns null when any stage is missing or any pattern is not a role or a safe path. */
export function parseStageUrlRules(raw: unknown): StageUrlRules | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const parsed = {} as StageUrlRules;
  for (const stage of STAGES) {
    const list = record[stage];
    if (!Array.isArray(list) || list.length > MAX_PATTERNS) return null;
    const patterns: string[] = [];
    for (const item of list) {
      const pattern = parseStageUrlPattern(item);
      if (!pattern || patterns.includes(pattern)) {
        if (!pattern) return null;
        continue;
      }
      patterns.push(pattern);
    }
    parsed[stage] = patterns;
  }
  return parsed;
}

export function stageUrlPatternLabel(pattern: string): string {
  if (isStageUrlRole(pattern)) return STAGE_URL_ROLE_LABELS[pattern];
  return pattern;
}
