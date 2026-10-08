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
] as const;

const memory: MetricsAuditEvent[] = [];

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
  memory.push(event);
  if (memory.length > 500) memory.shift();
  try {
    fs.appendFileSync(auditFilePath(), `${JSON.stringify(event)}\n`, 'utf8');
  } catch (err) {
    console.error('[audit] Failed to append metrics audit log:', err);
  }
}

export function getAuditEventsForTests(): MetricsAuditEvent[] {
  return memory.map((event) => ({ ...event, changedFields: event.changedFields.map((change) => ({ ...change })) }));
}

export function resetAuditLogForTests(): void {
  memory.length = 0;
  const file = auditFilePath();
  try {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch (err) {
    console.warn('[audit] Failed to reset audit log:', err);
  }
}
