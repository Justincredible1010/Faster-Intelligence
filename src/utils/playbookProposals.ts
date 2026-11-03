/** Client side of playbook learning: turn user edits into proposals for admin review. */
import { apiFetch } from '../auth/api';

export interface CopyEditDraft {
  field: string;
  language?: 'EN' | 'ZH' | 'JA';
  before: string;
  after: string;
  journalName?: string;
  stage?: string;
}

/** Lines added to the playbook text, ignoring blanks, headings and lines already present. */
export function newRuleLines(previous: string, next: string): string[] {
  const seen = new Set(previous.split('\n').map((l) => l.trim()).filter(Boolean));
  const out: string[] = [];
  for (const raw of next.split('\n')) {
    const line = raw.trim().replace(/^[-*•]\s*/, '').trim();
    if (!line || raw.trim().startsWith('#') || seen.has(raw.trim()) || line.length < 6 || line.length > 300) continue;
    if (!out.includes(line)) out.push(line);
  }
  return out.slice(0, 20);
}

type Sender = (body: Record<string, unknown>) => Promise<void>;

const defaultSender: Sender = async (body) => {
  try {
    await apiFetch('/api/playbook/proposals', { method: 'POST', body: JSON.stringify(body) });
  } catch {
    /* learning is best effort; never block editing */
  }
};

/**
 * Debounces edits per field: the first text before editing is kept as "before",
 * and one proposal is sent once the user stops typing.
 */
export function createCopyEditQueue(send: Sender = defaultSender, delayMs = 2500) {
  const pending = new Map<string, { draft: CopyEditDraft; timer: ReturnType<typeof setTimeout> }>();
  const flushKey = (key: string) => {
    const p = pending.get(key);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(key);
    const { before, after } = p.draft;
    if (after.trim() && before.trim() !== after.trim()) void send({ kind: 'copy_edit', ...p.draft, after: after.trim(), before: before.trim() });
  };
  return {
    edit(draft: CopyEditDraft) {
      const prev = pending.get(draft.field);
      if (prev) clearTimeout(prev.timer);
      const merged = { ...draft, before: prev ? prev.draft.before : draft.before };
      pending.set(draft.field, { draft: merged, timer: setTimeout(() => flushKey(draft.field), delayMs) });
    },
    flushAll() {
      for (const key of [...pending.keys()]) flushKey(key);
    },
    size: () => pending.size,
  };
}

export async function proposeRules(lines: string[], send: Sender = defaultSender): Promise<void> {
  for (const rule of lines) await send({ kind: 'rule', rule });
}
