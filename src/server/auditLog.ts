import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface MetricsAuditEvent {
  at: string;
  actorEmail: string;
  actorSub: string;
  actorProvider: string;
  journalId: string;
  journalName: string;
  action: 'create' | 'update';
  changedFields: FieldChange[];
}

const TRACKED_FIELDS = [
  'journalName',
  'publisher',
  'url',
  'impactFactor',
  'fiveYearImpactFactor',
  'jcrQuartile',
  'casZone',
  'firstDecisionDays',
  'indexing',
  'openAccessType',
  'apcUsd',
  'chinaWaiverAvailable',
  'aimsAndScopeSummary',
  'primaryDiscipline',
  'reportingYear',
  'jcrYear',
  'provenanceSource',
  'verificationStatus',
] as const;

export interface AuditLogStore {
  append(event: MetricsAuditEvent): void;
  list(): MetricsAuditEvent[];
  reset(): void;
}

/**
 * Default audit log: a local JSONL file plus an in-memory mirror for tests.
 * Replace it with `setAuditLogStore` when a shared database is available.
 */
export class FileAuditLogStore implements AuditLogStore {
  private memory: MetricsAuditEvent[] = [];

  append(event: MetricsAuditEvent): void {
    this.memory.push(event);
    if (this.memory.length > 500) this.memory.shift();
    try {
      fs.appendFileSync(auditFilePath(), `${JSON.stringify(event)}\n`, 'utf8');
    } catch (err) {
      console.error('[audit] Failed to append metrics audit log:', err);
    }
  }

  list(): MetricsAuditEvent[] {
    return this.memory.map((event) => ({ ...event, changedFields: event.changedFields.map((change) => ({ ...change })) }));
  }

  reset(): void {
    this.memory = [];
    const file = auditFilePath();
    try {
      if (fs.existsSync(file)) fs.unlinkSync(file);
    } catch (err) {
      console.warn('[audit] Failed to reset audit log:', err);
    }
  }
}

let auditLogStore: AuditLogStore = new FileAuditLogStore();

export function getAuditLogStore(): AuditLogStore {
  return auditLogStore;
}

export function setAuditLogStore(store: AuditLogStore): void {
  auditLogStore = store;
}

export function auditFilePath(): string {
  const override = process.env.METRICS_AUDIT_PATH;
  if (override && override.trim()) return path.resolve(override);
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../metrics-audit.jsonl');
}

export function diffTrackedFields(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of TRACKED_FIELDS) {
    const previous = before ? before[field] : undefined;
    const next = after[field];
    if (JSON.stringify(previous ?? null) !== JSON.stringify(next ?? null)) {
      changes.push({ field, before: previous ?? null, after: next ?? null });
    }
  }
  return changes;
}

export function recordMetricsAudit(event: MetricsAuditEvent): void {
  getAuditLogStore().append(event);
}

export function getAuditEventsForTests(): MetricsAuditEvent[] {
  return getAuditLogStore().list();
}

export function resetAuditLogForTests(): void {
  getAuditLogStore().reset();
}
