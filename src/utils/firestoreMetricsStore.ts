import { Firestore } from '@google-cloud/firestore';
import {
  IssnIdMapping,
  JournalMetricsRecord,
  MetricsStore,
  WOS_ISSN_COLLECTION,
  WOS_METRICS_COLLECTION,
} from './metricsStore';
import { normalizeIssn } from './issn';
import { parseStageUrlRules, type StageUrlRules } from './stageUrlRules';

export const APP_SETTINGS_COLLECTION = 'appSettings';
export const STAGE_URL_RULES_DOC = 'stageUrlRules';

function projectIdFromEnv(env: NodeJS.ProcessEnv): string {
  const projectId = env.FIRESTORE_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT || '';
  if (!projectId.trim()) {
    throw new Error('Firestore metrics store requires FIRESTORE_PROJECT_ID or GOOGLE_CLOUD_PROJECT.');
  }
  return projectId.trim();
}

function docId(issn: string, jcrYear: number): string {
  return `${normalizeIssn(issn)}_${jcrYear}`;
}

/** Firestore rejects undefined. Drop those fields before writing. */
function toFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * Durable store for Cloud Run. Uses Application Default Credentials.
 * The Firestore emulator is used automatically when FIRESTORE_EMULATOR_HOST is set.
 */
export class FirestoreMetricsStore implements MetricsStore {
  private db: Firestore;

  constructor(env: NodeJS.ProcessEnv = process.env, firestore?: Firestore) {
    this.db = firestore ?? new Firestore({ projectId: projectIdFromEnv(env) });
  }

  private metricsRef(issn: string, jcrYear: number) {
    return this.db.collection(WOS_METRICS_COLLECTION).doc(docId(issn, jcrYear));
  }

  private mappingRef(issn: string) {
    return this.db.collection(WOS_ISSN_COLLECTION).doc(normalizeIssn(issn));
  }

  private stageUrlRulesRef() {
    return this.db.collection(APP_SETTINGS_COLLECTION).doc(STAGE_URL_RULES_DOC);
  }

  async getByIssnYear(issn: string, jcrYear: number): Promise<JournalMetricsRecord | null> {
    if (!normalizeIssn(issn)) return null;
    const snap = await this.metricsRef(issn, jcrYear).get();
    if (!snap.exists) return null;
    return snap.data() as JournalMetricsRecord;
  }

  async getIdMapping(issn: string): Promise<IssnIdMapping | null> {
    if (!normalizeIssn(issn)) return null;
    const snap = await this.mappingRef(issn).get();
    if (!snap.exists) return null;
    return snap.data() as IssnIdMapping;
  }

  async getLatestByIssn(issn: string): Promise<JournalMetricsRecord | null> {
    const mapping = await this.getIdMapping(issn);
    if (!mapping?.latestJcrYear) return null;
    return this.getByIssnYear(issn, mapping.latestJcrYear);
  }

  async putMetrics(record: JournalMetricsRecord): Promise<void> {
    const issn = normalizeIssn(record.issn);
    const eIssn = normalizeIssn(record.eIssn);
    if (!issn || !Number.isInteger(record.jcrYear)) return;
    const stored = toFirestore({
      ...record,
      issn,
      eIssn: eIssn || null,
      source: 'clarivate_wos_journals_api' as const,
    });
    const keys = [...new Set([issn, eIssn].filter(Boolean))];
    const batch = this.db.batch();
    for (const key of keys) {
      batch.set(this.metricsRef(key, record.jcrYear), stored);
      const previous = await this.getIdMapping(key);
      const mapping: IssnIdMapping = {
        issn: key,
        wosJournalId: record.wosJournalId,
        updatedAt: record.retrievedAt,
        latestJcrYear: Math.max(previous?.latestJcrYear ?? 0, record.jcrYear),
        lastYearCheckAt: previous?.lastYearCheckAt ?? null,
        lookupState: null,
        lookupStateAt: null,
      };
      batch.set(this.mappingRef(key), toFirestore(mapping));
    }
    await batch.commit();
  }

  async getLastYearCheck(issn: string): Promise<string | null> {
    return (await this.getIdMapping(issn))?.lastYearCheckAt ?? null;
  }

  async rememberLookupState(
    issn: string,
    state: 'not_found' | 'unavailable',
    at: string,
    wosJournalId = ''
  ): Promise<void> {
    const normalized = normalizeIssn(issn);
    if (!normalized) return;
    const previous = await this.getIdMapping(normalized);
    const mapping: IssnIdMapping = {
      issn: normalized,
      wosJournalId: wosJournalId || previous?.wosJournalId || '',
      updatedAt: at,
      latestJcrYear: previous?.latestJcrYear ?? null,
      lastYearCheckAt: previous?.lastYearCheckAt ?? null,
      lookupState: state,
      lookupStateAt: at,
    };
    await this.mappingRef(normalized).set(toFirestore(mapping));
  }

  async setLastYearCheck(issn: string, isoTimestamp: string): Promise<void> {
    const normalized = normalizeIssn(issn);
    if (!normalized) return;
    const latest = await this.getLatestByIssn(normalized);
    const primary = await this.getIdMapping(normalized);
    const keys = new Set<string>([normalized]);
    if (latest?.issn) keys.add(normalizeIssn(latest.issn));
    if (latest?.eIssn) {
      const electronic = normalizeIssn(latest.eIssn);
      if (electronic) keys.add(electronic);
    }
    const batch = this.db.batch();
    for (const key of keys) {
      if (!key) continue;
      const previous = key === normalized ? primary : await this.getIdMapping(key);
      const mapping: IssnIdMapping = {
        issn: key,
        wosJournalId: previous?.wosJournalId || latest?.wosJournalId || '',
        updatedAt: previous?.updatedAt || isoTimestamp,
        latestJcrYear: previous?.latestJcrYear ?? latest?.jcrYear ?? null,
        lastYearCheckAt: isoTimestamp,
        lookupState: previous?.lookupState ?? null,
        lookupStateAt: previous?.lookupStateAt ?? null,
      };
      batch.set(this.mappingRef(key), toFirestore(mapping));
    }
    await batch.commit();
  }

  async getStageUrlRules(): Promise<StageUrlRules | null> {
    const snap = await this.stageUrlRulesRef().get();
    if (!snap.exists) return null;
    return parseStageUrlRules(snap.data()?.rules);
  }

  async putStageUrlRules(rules: StageUrlRules): Promise<void> {
    const parsed = parseStageUrlRules(rules);
    if (!parsed) throw new Error('Invalid stage URL rules');
    await this.stageUrlRulesRef().set(
      toFirestore({
        rules: parsed,
        updatedAt: new Date().toISOString(),
      })
    );
  }

  async clearStageUrlRules(): Promise<void> {
    await this.stageUrlRulesRef().delete();
  }
}
