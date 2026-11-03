/**
 * Durable storage for the admin playbook, playbook proposals (learning from
 * user edits and rules) and the journal metrics database.
 *
 * Production (Cloud Run): Firestore, so data survives redeploys.
 * Dev/tests: local JSON files (or memory), so tests run offline.
 * Select with PLAYBOOK_STORE=firestore|file|memory. Defaults to firestore when
 * METRICS_STORE=firestore, else file.
 */
import fs from 'fs';
import crypto from 'crypto';
import type { AdminPlaybookConfig, JournalMetricsDatabaseRecord } from '../types';
import { defaultPlaybook, loadPlaybookFile, savePlaybookFile } from './playbook';
import { loadMetricsDatabaseFile, sanitizeDatabaseRecord, saveMetricsDatabaseFile, withClarivateMetrics } from './metricsDatabase';
import type { PlaybookProposal, ProposalStatus } from './playbookLearning';

export const PLAYBOOK_DOC = 'adminPlaybook';
export const PROPOSALS_COLLECTION = 'playbookProposals';
export const METRICS_DB_COLLECTION = 'journalMetricsDatabase';
export const APP_SETTINGS_COLLECTION = 'appSettings';

export interface PlaybookStore {
  getPlaybook(): Promise<AdminPlaybookConfig>;
  savePlaybook(p: AdminPlaybookConfig): Promise<void>;
  listProposals(status?: ProposalStatus): Promise<PlaybookProposal[]>;
  getProposal(id: string): Promise<PlaybookProposal | null>;
  saveProposal(p: PlaybookProposal): Promise<void>;
  listMetricsRecords(): Promise<JournalMetricsDatabaseRecord[]>;
  saveMetricsRecord(r: JournalMetricsDatabaseRecord): Promise<void>;
}

export function newProposalId(): string {
  return crypto.randomUUID();
}

const byNewest = (a: PlaybookProposal, b: PlaybookProposal) => b.submittedAt.localeCompare(a.submittedAt);

export class MemoryPlaybookStore implements PlaybookStore {
  playbook: AdminPlaybookConfig = defaultPlaybook();
  proposals = new Map<string, PlaybookProposal>();
  records = new Map<string, JournalMetricsDatabaseRecord>();
  async getPlaybook() { return { ...this.playbook }; }
  async savePlaybook(p: AdminPlaybookConfig) { this.playbook = { ...p }; }
  async listProposals(status?: ProposalStatus) {
    return [...this.proposals.values()].filter((p) => !status || p.status === status).sort(byNewest);
  }
  async getProposal(id: string) { return this.proposals.get(id) ?? null; }
  async saveProposal(p: PlaybookProposal) { this.proposals.set(p.id, { ...p }); }
  async listMetricsRecords() { return [...this.records.values()]; }
  async saveMetricsRecord(r: JournalMetricsDatabaseRecord) { this.records.set(r.canonicalUrl, r); }
}

/** Local JSON files. The playbook and metrics files keep their existing formats. */
export class FilePlaybookStore implements PlaybookStore {
  constructor(private paths: { playbook: string; metrics: string; proposals: string }) {}
  async getPlaybook() { return loadPlaybookFile(this.paths.playbook); }
  async savePlaybook(p: AdminPlaybookConfig) { savePlaybookFile(this.paths.playbook, p); }
  private readProposals(): PlaybookProposal[] {
    try {
      if (!fs.existsSync(this.paths.proposals)) return [];
      const raw = JSON.parse(fs.readFileSync(this.paths.proposals, 'utf-8'));
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }
  async listProposals(status?: ProposalStatus) {
    return this.readProposals().filter((p) => !status || p.status === status).sort(byNewest);
  }
  async getProposal(id: string) { return this.readProposals().find((p) => p.id === id) ?? null; }
  async saveProposal(p: PlaybookProposal) {
    const all = this.readProposals().filter((x) => x.id !== p.id);
    all.push(p);
    const tmp = `${this.paths.proposals}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(all, null, 2), 'utf-8');
    fs.renameSync(tmp, this.paths.proposals);
  }
  async listMetricsRecords() { return loadMetricsDatabaseFile(this.paths.metrics); }
  async saveMetricsRecord(r: JournalMetricsDatabaseRecord) {
    const records = loadMetricsDatabaseFile(this.paths.metrics).filter((x) => x.canonicalUrl !== r.canonicalUrl);
    records.push(r);
    saveMetricsDatabaseFile(this.paths.metrics, records);
  }
}

/** Firestore rejects undefined. */
function plain<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/**
 * Firestore store. The bundled JSON files are read-only seeds used until the
 * first admin write, so an empty project still shows the shipped defaults.
 */
export class FirestorePlaybookStore implements PlaybookStore {
  constructor(private db: any, private seed: { playbook: string; metrics: string }) {}
  private playbookRef() { return this.db.collection(APP_SETTINGS_COLLECTION).doc(PLAYBOOK_DOC); }
  async getPlaybook() {
    const snap = await this.playbookRef().get();
    if (!snap.exists) return loadPlaybookFile(this.seed.playbook);
    return { ...defaultPlaybook(), ...(snap.data() as AdminPlaybookConfig) };
  }
  async savePlaybook(p: AdminPlaybookConfig) { await this.playbookRef().set(plain(p)); }
  async listProposals(status?: ProposalStatus) {
    let q = this.db.collection(PROPOSALS_COLLECTION);
    if (status) q = q.where('status', '==', status);
    const snap = await q.limit(500).get();
    return snap.docs.map((d: any) => d.data() as PlaybookProposal).sort(byNewest);
  }
  async getProposal(id: string) {
    const snap = await this.db.collection(PROPOSALS_COLLECTION).doc(id).get();
    return snap.exists ? (snap.data() as PlaybookProposal) : null;
  }
  async saveProposal(p: PlaybookProposal) { await this.db.collection(PROPOSALS_COLLECTION).doc(p.id).set(plain(p)); }
  async listMetricsRecords() {
    const snap = await this.db.collection(METRICS_DB_COLLECTION).get();
    if (snap.empty) return loadMetricsDatabaseFile(this.seed.metrics);
    return snap.docs
      .map((d: any) => sanitizeDatabaseRecord(d.data()))
      .filter((r: JournalMetricsDatabaseRecord | null): r is JournalMetricsDatabaseRecord => Boolean(r));
  }
  async saveMetricsRecord(r: JournalMetricsDatabaseRecord) {
    // Clarivate-only fields are never stored; they are filled from the Clarivate store on read.
    await this.db.collection(METRICS_DB_COLLECTION).doc(encodeURIComponent(r.canonicalUrl)).set(plain(withClarivateMetrics(r, null)));
  }
}

let singleton: Promise<PlaybookStore> | null = null;

export async function createPlaybookStoreFromEnv(
  paths: { playbook: string; metrics: string; proposals: string },
  env: NodeJS.ProcessEnv = process.env
): Promise<PlaybookStore> {
  const explicit = (env.PLAYBOOK_STORE || '').trim().toLowerCase();
  const mode = explicit || ((env.METRICS_STORE || '').trim().toLowerCase() === 'firestore' ? 'firestore' : 'file');
  if (mode === 'memory') return new MemoryPlaybookStore();
  if (mode === 'firestore') {
    const projectId = (env.FIRESTORE_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT || '').trim();
    if (!projectId) throw new Error('PLAYBOOK_STORE=firestore requires FIRESTORE_PROJECT_ID or GOOGLE_CLOUD_PROJECT.');
    const { Firestore } = await import('@google-cloud/firestore');
    return new FirestorePlaybookStore(new Firestore({ projectId }), paths);
  }
  if (env.NODE_ENV === 'production') {
    console.warn('[Playbook Store] Using local files in production. Playbook, proposals and metrics edits reset on redeploy. Set PLAYBOOK_STORE=firestore.');
  }
  return new FilePlaybookStore(paths);
}

export function getPlaybookStore(paths: { playbook: string; metrics: string; proposals: string }): Promise<PlaybookStore> {
  if (!singleton) singleton = createPlaybookStoreFromEnv(paths);
  return singleton;
}

/** Test hook. */
export function setPlaybookStoreForTests(store: PlaybookStore | null): void {
  singleton = store ? Promise.resolve(store) : null;
}
