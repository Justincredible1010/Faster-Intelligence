import fs from 'fs';
import path from 'path';
import { ClarivateJournalMetrics } from '../types';
import { normalizeIssn } from './issn';

export const WOS_METRICS_COLLECTION = 'wosJournalMetrics';
export const WOS_ISSN_COLLECTION = 'wosIssnMappings';

/** One JCR edition for one ISSN. Provenance is stored with the numbers. */
export interface JournalMetricsRecord {
  issn: string;
  eIssn?: string | null;
  jcrYear: number;
  wosJournalId: string;
  source: 'clarivate_wos_journals_api';
  retrievedAt: string;
  metrics: ClarivateJournalMetrics;
}

/** ISSN (print or electronic) to the Clarivate journal id, including a durable miss. */
export interface IssnIdMapping {
  issn: string;
  wosJournalId: string;
  updatedAt: string;
  latestJcrYear: number | null;
  lastYearCheckAt: string | null;
  /** Set when the API found no journal, or found one with no JCR year and no JIF. */
  lookupState?: 'not_found' | 'unavailable' | null;
  /** When lookupState was recorded. Rechecked on the next UTC day. */
  lookupStateAt?: string | null;
}

export interface MetricsStore {
  getByIssnYear(issn: string, jcrYear: number): Promise<JournalMetricsRecord | null>;
  getLatestByIssn(issn: string): Promise<JournalMetricsRecord | null>;
  putMetrics(record: JournalMetricsRecord): Promise<void>;
  getIdMapping(issn: string): Promise<IssnIdMapping | null>;
  getLastYearCheck(issn: string): Promise<string | null>;
  setLastYearCheck(issn: string, isoTimestamp: string): Promise<void>;
  /**
   * Remember a not-found ISSN or a journal with no JCR year / no JIF.
   * The next UTC day is allowed to try the API again.
   */
  rememberLookupState(
    issn: string,
    state: 'not_found' | 'unavailable',
    at: string,
    wosJournalId?: string
  ): Promise<void>;
}

interface StoreSnapshot {
  metrics: JournalMetricsRecord[];
  mappings: IssnIdMapping[];
}

function metricsKey(issn: string, jcrYear: number): string {
  return `${normalizeIssn(issn)}_${jcrYear}`;
}

function issnKeysFor(record: Pick<JournalMetricsRecord, 'issn' | 'eIssn'>): string[] {
  const keys = [normalizeIssn(record.issn), normalizeIssn(record.eIssn)];
  return [...new Set(keys.filter(Boolean))];
}

export class MemoryMetricsStore implements MetricsStore {
  private metrics = new Map<string, JournalMetricsRecord>();
  private mappings = new Map<string, IssnIdMapping>();

  async getByIssnYear(issn: string, jcrYear: number): Promise<JournalMetricsRecord | null> {
    const key = metricsKey(issn, jcrYear);
    if (!key.startsWith('_') && normalizeIssn(issn)) return this.metrics.get(key) ?? null;
    return null;
  }

  async getLatestByIssn(issn: string): Promise<JournalMetricsRecord | null> {
    const normalized = normalizeIssn(issn);
    if (!normalized) return null;
    const mapping = this.mappings.get(normalized);
    if (mapping?.latestJcrYear) {
      const keyed = this.metrics.get(metricsKey(normalized, mapping.latestJcrYear));
      if (keyed) return keyed;
    }
    let best: JournalMetricsRecord | null = null;
    for (const record of this.metrics.values()) {
      if (!issnKeysFor(record).includes(normalized)) continue;
      if (!best || record.jcrYear > best.jcrYear) best = record;
    }
    return best;
  }

  async putMetrics(record: JournalMetricsRecord): Promise<void> {
    const issn = normalizeIssn(record.issn);
    if (!issn || !Number.isInteger(record.jcrYear)) return;
    const stored: JournalMetricsRecord = {
      ...record,
      issn,
      eIssn: normalizeIssn(record.eIssn) || null,
      source: 'clarivate_wos_journals_api',
    };
    for (const key of issnKeysFor(stored)) {
      this.metrics.set(metricsKey(key, stored.jcrYear), stored);
      const previous = this.mappings.get(key);
      const latest = Math.max(previous?.latestJcrYear ?? 0, stored.jcrYear);
      this.mappings.set(key, {
        issn: key,
        wosJournalId: stored.wosJournalId,
        updatedAt: stored.retrievedAt,
        latestJcrYear: latest,
        lastYearCheckAt: previous?.lastYearCheckAt ?? null,
        lookupState: null,
        lookupStateAt: null,
      });
    }
  }

  async getIdMapping(issn: string): Promise<IssnIdMapping | null> {
    const normalized = normalizeIssn(issn);
    if (!normalized) return null;
    return this.mappings.get(normalized) ?? null;
  }

  async getLastYearCheck(issn: string): Promise<string | null> {
    return (await this.getIdMapping(issn))?.lastYearCheckAt ?? null;
  }

  async setLastYearCheck(issn: string, isoTimestamp: string): Promise<void> {
    const normalized = normalizeIssn(issn);
    if (!normalized) return;
    const latest = await this.getLatestByIssn(normalized);
    const keys = new Set<string>([normalized]);
    if (latest) issnKeysFor(latest).forEach((key) => keys.add(key));
    for (const key of keys) {
      const previous = this.mappings.get(key);
      this.mappings.set(key, {
        issn: key,
        wosJournalId: previous?.wosJournalId || latest?.wosJournalId || '',
        updatedAt: previous?.updatedAt || isoTimestamp,
        latestJcrYear: previous?.latestJcrYear ?? latest?.jcrYear ?? null,
        lastYearCheckAt: isoTimestamp,
        lookupState: previous?.lookupState ?? null,
        lookupStateAt: previous?.lookupStateAt ?? null,
      });
    }
  }

  async rememberLookupState(
    issn: string,
    state: 'not_found' | 'unavailable',
    at: string,
    wosJournalId = ''
  ): Promise<void> {
    const normalized = normalizeIssn(issn);
    if (!normalized) return;
    const previous = this.mappings.get(normalized);
    this.mappings.set(normalized, {
      issn: normalized,
      wosJournalId: wosJournalId || previous?.wosJournalId || '',
      updatedAt: at,
      latestJcrYear: previous?.latestJcrYear ?? null,
      lastYearCheckAt: previous?.lastYearCheckAt ?? null,
      lookupState: state,
      lookupStateAt: at,
    });
  }

  exportSnapshot(): StoreSnapshot {
    return {
      metrics: [...this.metrics.values()],
      mappings: [...this.mappings.values()],
    };
  }

  importSnapshot(snapshot: StoreSnapshot): void {
    this.metrics.clear();
    this.mappings.clear();
    for (const record of snapshot.metrics || []) {
      const issn = normalizeIssn(record.issn);
      if (!issn) continue;
      this.metrics.set(metricsKey(issn, record.jcrYear), record);
    }
    for (const mapping of snapshot.mappings || []) {
      const issn = normalizeIssn(mapping.issn);
      if (!issn) continue;
      this.mappings.set(issn, { ...mapping, issn });
    }
  }
}

export class FileMetricsStore implements MetricsStore {
  private memory = new MemoryMetricsStore();
  private loaded = false;

  constructor(private readonly filePath: string) {}

  private async ready(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (!fs.existsSync(this.filePath)) return;
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as StoreSnapshot;
      if (!parsed || typeof parsed !== 'object') return;
      this.memory.importSnapshot({
        metrics: Array.isArray(parsed.metrics) ? parsed.metrics : [],
        mappings: Array.isArray(parsed.mappings) ? parsed.mappings : [],
      });
    } catch (err) {
      console.warn('[Metrics Store] Could not read the local metrics file. Starting empty.', err instanceof Error ? err.message : err);
    }
  }

  private flush(): void {
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const temp = `${this.filePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(this.memory.exportSnapshot(), null, 2), 'utf8');
    fs.renameSync(temp, this.filePath);
  }

  async getByIssnYear(issn: string, jcrYear: number): Promise<JournalMetricsRecord | null> {
    await this.ready();
    return this.memory.getByIssnYear(issn, jcrYear);
  }

  async getLatestByIssn(issn: string): Promise<JournalMetricsRecord | null> {
    await this.ready();
    return this.memory.getLatestByIssn(issn);
  }

  async putMetrics(record: JournalMetricsRecord): Promise<void> {
    await this.ready();
    await this.memory.putMetrics(record);
    this.flush();
  }

  async getIdMapping(issn: string): Promise<IssnIdMapping | null> {
    await this.ready();
    return this.memory.getIdMapping(issn);
  }

  async getLastYearCheck(issn: string): Promise<string | null> {
    await this.ready();
    return this.memory.getLastYearCheck(issn);
  }

  async setLastYearCheck(issn: string, isoTimestamp: string): Promise<void> {
    await this.ready();
    await this.memory.setLastYearCheck(issn, isoTimestamp);
    this.flush();
  }

  async rememberLookupState(
    issn: string,
    state: 'not_found' | 'unavailable',
    at: string,
    wosJournalId?: string
  ): Promise<void> {
    await this.ready();
    await this.memory.rememberLookupState(issn, state, at, wosJournalId);
    this.flush();
  }
}

let singleton: Promise<MetricsStore> | null = null;

export function createMetricsStoreFromEnv(env: NodeJS.ProcessEnv = process.env): MetricsStore {
  const mode = (env.METRICS_STORE || 'memory').trim().toLowerCase();
  if (env.NODE_ENV === 'production' && mode !== 'firestore') {
    console.warn('[Metrics Store] METRICS_STORE is not firestore in production. Clarivate metrics will not survive a Cloud Run restart. Set METRICS_STORE=firestore.');
  }
  if (mode === 'file') {
    const filePath = env.METRICS_STORE_PATH || path.resolve(process.cwd(), '.data/clarivate-metrics.json');
    return new FileMetricsStore(filePath);
  }
  if (mode === 'firestore') {
    throw new Error('Use createMetricsStoreFromEnvAsync for METRICS_STORE=firestore');
  }
  if (mode !== 'memory') {
    console.warn(`[Metrics Store] Unknown METRICS_STORE=${mode}. Using memory.`);
  }
  return new MemoryMetricsStore();
}

export async function createMetricsStoreFromEnvAsync(env: NodeJS.ProcessEnv = process.env): Promise<MetricsStore> {
  const mode = (env.METRICS_STORE || 'memory').trim().toLowerCase();
  if (mode === 'firestore') {
    const { FirestoreMetricsStore } = await import('./firestoreMetricsStore');
    return new FirestoreMetricsStore(env);
  }
  return createMetricsStoreFromEnv(env);
}

export function getMetricsStore(): Promise<MetricsStore> {
  if (!singleton) singleton = createMetricsStoreFromEnvAsync();
  return singleton;
}

/** Test hook. Production code keeps the process-wide store. */
export function resetMetricsStoreForTests(): void {
  singleton = null;
}
