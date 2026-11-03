/**
 * Server-stored writing rules ("admin playbook"), ported from AI Studio.
 * Everyone signed in can read it; only admins can change it (see server.ts).
 */
import fs from 'fs';
import type { AdminPlaybookConfig } from '../types';

export const PLAYBOOK_LIMITS = { text: 20000, short: 200, listItems: 50, listItem: 300 } as const;

export class PlaybookValidationError extends Error {
  status = 400;
}

export function defaultPlaybook(): AdminPlaybookConfig {
  return {
    activePreset: 'default',
    brandVoice: 'Evidence-backed, scholarly, welcoming, strictly non-hyperbolic',
    brandRules: [
      'Always spell Nature Portfolio and Springer Nature accurately.',
      'Do not mention competitor journals in copy headlines or descriptions.',
      'Never state a metric, claim, or URL that is not in the verified journal facts.',
    ],
    prohibitedTerms: ['guaranteed', 'fastest', 'world-best', '#1', 'top-ranked', '100% acceptance', '保过', '包录用', '最速', '採択保証'],
    requiredDisclaimers: {},
    // Empty means "use the built-in default writing rules" in the UI.
    customPromptInstructions: '',
    lastModified: '',
    modifiedBy: '',
  };
}

function shortString(value: unknown, field: string, max: number = PLAYBOOK_LIMITS.short): string {
  if (typeof value !== 'string') throw new PlaybookValidationError(`${field} must be a string`);
  if (value.length > max) throw new PlaybookValidationError(`${field} is too long`);
  return value;
}

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new PlaybookValidationError(`${field} must be a list of strings`);
  if (value.length > PLAYBOOK_LIMITS.listItems) throw new PlaybookValidationError(`${field} has too many items`);
  return value.map((v, i) => shortString(v, `${field}[${i}]`, PLAYBOOK_LIMITS.listItem));
}

/** Merge a client update into the current playbook. Unknown keys are ignored. */
export function applyPlaybookUpdate(
  current: AdminPlaybookConfig,
  update: unknown,
  editorEmail: string,
  now: Date = new Date()
): AdminPlaybookConfig {
  if (!update || typeof update !== 'object' || Array.isArray(update)) {
    throw new PlaybookValidationError('Invalid playbook payload');
  }
  const u = update as Record<string, unknown>;
  const next: AdminPlaybookConfig = { ...current };
  if (u.activePreset !== undefined) next.activePreset = shortString(u.activePreset, 'activePreset');
  if (u.brandVoice !== undefined) next.brandVoice = shortString(u.brandVoice, 'brandVoice', PLAYBOOK_LIMITS.listItem);
  if (u.brandRules !== undefined) next.brandRules = stringList(u.brandRules, 'brandRules');
  if (u.prohibitedTerms !== undefined) next.prohibitedTerms = stringList(u.prohibitedTerms, 'prohibitedTerms');
  if (u.customPromptInstructions !== undefined) {
    next.customPromptInstructions = shortString(u.customPromptInstructions, 'customPromptInstructions', PLAYBOOK_LIMITS.text);
  }
  if (u.requiredDisclaimers !== undefined) {
    const d = u.requiredDisclaimers;
    if (!d || typeof d !== 'object' || Array.isArray(d)) throw new PlaybookValidationError('requiredDisclaimers must be an object');
    const entries = Object.entries(d as Record<string, unknown>);
    if (entries.length > PLAYBOOK_LIMITS.listItems) throw new PlaybookValidationError('requiredDisclaimers has too many items');
    next.requiredDisclaimers = Object.fromEntries(entries.map(([k, v]) => [shortString(k, 'requiredDisclaimers key'), shortString(v, `requiredDisclaimers.${k}`, PLAYBOOK_LIMITS.listItem)]));
  }
  // Who and when are set by the server, never by the client.
  next.lastModified = now.toISOString();
  next.modifiedBy = editorEmail;
  return next;
}

export function loadPlaybookFile(filePath: string): AdminPlaybookConfig {
  try {
    if (fs.existsSync(filePath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const base = defaultPlaybook();
      const merged = applyPlaybookUpdate(base, raw, typeof raw?.modifiedBy === 'string' ? raw.modifiedBy : '');
      merged.lastModified = typeof raw?.lastModified === 'string' ? raw.lastModified : '';
      return merged;
    }
  } catch (err) {
    console.warn('[playbook] could not read playbook file:', err instanceof Error ? err.message : err);
  }
  return defaultPlaybook();
}

export function savePlaybookFile(filePath: string, playbook: AdminPlaybookConfig): void {
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(playbook, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}
