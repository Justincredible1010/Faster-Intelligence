/**
 * Playbook learning: user copy edits and suggested rules become proposals.
 * Admins approve or reject them; approved ones are merged into the playbook and
 * then used by generation (prompt rules + copy corrections).
 */
import type { AdminPlaybookConfig } from '../types';
import { PLAYBOOK_LIMITS } from './playbook';

export type ProposalKind = 'copy_edit' | 'rule' | 'prohibited_term';
export type ProposalStatus = 'pending' | 'approved' | 'rejected';

export interface PlaybookProposal {
  id: string;
  kind: ProposalKind;
  field?: string;
  language?: 'EN' | 'ZH' | 'JA';
  before?: string;
  after?: string;
  rule?: string;
  note?: string;
  journalName?: string;
  stage?: string;
  submittedBy: string;
  submittedAt: string;
  status: ProposalStatus;
  decidedBy?: string;
  decidedAt?: string;
}

export class ProposalValidationError extends Error {
  status = 400;
}

const KINDS: ProposalKind[] = ['copy_edit', 'rule', 'prohibited_term'];
const LANGS = ['EN', 'ZH', 'JA'] as const;

function opt(v: unknown, field: string, max: number = PLAYBOOK_LIMITS.listItem): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') throw new ProposalValidationError(`${field} must be a string`);
  const t = v.trim();
  if (t.length > max) throw new ProposalValidationError(`${field} is too long`);
  return t || undefined;
}

/** Build a pending proposal from a client payload. Who/when/status are set here, never by the client. */
export function buildProposal(raw: unknown, submittedBy: string, id: string, now: Date = new Date()): PlaybookProposal {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new ProposalValidationError('Invalid proposal');
  const r = raw as Record<string, unknown>;
  const kind = r.kind as ProposalKind;
  if (!KINDS.includes(kind)) throw new ProposalValidationError('kind must be copy_edit, rule or prohibited_term');
  const language = LANGS.includes(r.language as any) ? (r.language as PlaybookProposal['language']) : undefined;
  const p: PlaybookProposal = {
    id,
    kind,
    field: opt(r.field, 'field', PLAYBOOK_LIMITS.short),
    language,
    before: opt(r.before, 'before'),
    after: opt(r.after, 'after'),
    rule: opt(r.rule, 'rule'),
    note: opt(r.note, 'note'),
    journalName: opt(r.journalName, 'journalName', PLAYBOOK_LIMITS.short),
    stage: opt(r.stage, 'stage', PLAYBOOK_LIMITS.short),
    submittedBy,
    submittedAt: now.toISOString(),
    status: 'pending',
  };
  if (kind === 'copy_edit') {
    if (!p.before || !p.after) throw new ProposalValidationError('copy_edit needs before and after text');
    if (p.before === p.after) throw new ProposalValidationError('copy_edit has no change');
  } else if (!p.rule) {
    throw new ProposalValidationError(`${kind} needs rule text`);
  }
  for (const k of Object.keys(p) as (keyof PlaybookProposal)[]) if (p[k] === undefined) delete p[k];
  return p;
}

/** Same content already pending or approved? Used to drop duplicate proposals. */
export function isDuplicateProposal(p: PlaybookProposal, existing: PlaybookProposal[]): boolean {
  return existing.some(
    (e) =>
      e.status !== 'rejected' &&
      e.kind === p.kind &&
      (e.rule || '') === (p.rule || '') &&
      (e.before || '') === (p.before || '') &&
      (e.after || '') === (p.after || '') &&
      (e.language || '') === (p.language || '')
  );
}

/** Merge an approved proposal into the playbook. */
export function applyApprovedProposal(playbook: AdminPlaybookConfig, p: PlaybookProposal, editor: string, now: Date = new Date()): AdminPlaybookConfig {
  const next: AdminPlaybookConfig = {
    ...playbook,
    learnedRules: [...(playbook.learnedRules || [])],
    copyCorrections: [...(playbook.copyCorrections || [])],
    prohibitedTerms: [...playbook.prohibitedTerms],
    lastModified: now.toISOString(),
    modifiedBy: editor,
  };
  if (p.kind === 'rule' && p.rule && !next.learnedRules!.includes(p.rule)) next.learnedRules!.push(p.rule);
  if (p.kind === 'prohibited_term' && p.rule && !next.prohibitedTerms.includes(p.rule)) next.prohibitedTerms.push(p.rule);
  if (p.kind === 'copy_edit' && p.before && p.after) {
    next.copyCorrections = next.copyCorrections!.filter((c) => !(c.before === p.before && (c.language || '') === (p.language || '')));
    next.copyCorrections!.push({ before: p.before, after: p.after, ...(p.language ? { language: p.language } : {}) });
  }
  return next;
}

/** Prompt section with the admin playbook and approved learned rules. */
export function playbookPromptSection(playbook: AdminPlaybookConfig): string {
  const lines: string[] = [];
  if (playbook.brandVoice) lines.push(`Brand voice: ${playbook.brandVoice}`);
  for (const r of playbook.brandRules || []) lines.push(`- ${r}`);
  for (const r of playbook.learnedRules || []) lines.push(`- ${r} (approved learned rule)`);
  if (playbook.prohibitedTerms?.length) lines.push(`Never use these terms: ${playbook.prohibitedTerms.join(', ')}`);
  const fixes = (playbook.copyCorrections || []).slice(0, 30);
  if (fixes.length) {
    lines.push('Approved copy corrections (prefer the corrected wording):');
    for (const c of fixes) lines.push(`- "${c.before}" -> "${c.after}"${c.language ? ` [${c.language}]` : ''}`);
  }
  return lines.length ? `ADMIN PLAYBOOK (approved, must follow):\n${lines.join('\n')}` : '';
}

/** Apply approved before->after corrections to every headline/description/callout text. */
export function applyCopyCorrections<T extends Record<string, any>>(campaign: T, playbook: AdminPlaybookConfig, language?: string): T {
  const fixes = (playbook.copyCorrections || []).filter((c) => !c.language || !language || c.language === language);
  if (!fixes.length) return campaign;
  const fix = (s: string) => {
    let out = s;
    for (const c of fixes) {
      if (out === c.before) return c.after;
      if (c.before.length >= 3) out = out.split(c.before).join(c.after);
    }
    return out;
  };
  const out: any = { ...campaign };
  for (const key of ['headlines', 'descriptions', 'callouts']) {
    if (!Array.isArray(out[key])) continue;
    out[key] = out[key].map((item: any) =>
      typeof item === 'string' ? fix(item) : item && typeof item.text === 'string' ? { ...item, text: fix(item.text) } : item
    );
  }
  return out;
}
