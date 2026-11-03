/**
 * Facts extracted from the landing page start unverified. The user marks each
 * one verified in the input panel; the choice is kept per journal URL in the
 * browser and sent with generation so the prompt can label each fact.
 */
import { normalizeJournalUrl } from './journalUrl';

const KEY = 'fi.verifiedPageFacts.v1';

function keyFor(url: string): string {
  return normalizeJournalUrl(url || '').canonical || (url || '').trim();
}

function readAll(storage: Pick<Storage, 'getItem'> | undefined): Record<string, string[]> {
  try {
    const raw = storage?.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

const defaultStorage = (): Storage | undefined => (typeof window !== 'undefined' ? window.localStorage : undefined);

export function getVerifiedPageFacts(url: string, storage: Pick<Storage, 'getItem'> | undefined = defaultStorage()): string[] {
  const v = readAll(storage)[keyFor(url)];
  return Array.isArray(v) ? v.filter((k) => typeof k === 'string') : [];
}

export function setPageFactVerified(
  url: string,
  kind: string,
  verified: boolean,
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = defaultStorage()
): string[] {
  const all = readAll(storage);
  const k = keyFor(url);
  const set = new Set(all[k] || []);
  if (verified) set.add(kind);
  else set.delete(kind);
  all[k] = [...set];
  try {
    storage?.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full or blocked: keep in memory only */
  }
  return all[k];
}

/** Server side: keep only short string kinds. */
export function sanitizeVerifiedKinds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is string => typeof k === 'string' && k.length > 0 && k.length <= 80).slice(0, 50);
}
