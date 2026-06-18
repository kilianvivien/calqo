import {
  CURRENT_SCHEMA_VERSION,
  projectSchema,
  type CalqoProject,
} from './schema';

/** A migration lifts a raw document from version N to N+1. None are needed yet
 * (we are at v1), but the plumbing exists so future schema bumps are cheap. */
type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

const migrations: Record<number, Migration> = {
  // 1: (raw) => migrateV1ToV2(raw),
};

export function detectSchemaVersion(raw: unknown): number {
  if (raw && typeof raw === 'object' && 'schemaVersion' in raw) {
    const v = (raw as { schemaVersion: unknown }).schemaVersion;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  // Pre-versioned documents are treated as v1.
  return 1;
}

/** Apply migrations in sequence until the document reaches the current version. */
export function migrateToCurrent(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  let doc = raw as Record<string, unknown>;
  let version = detectSchemaVersion(doc);
  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = migrations[version];
    if (!migrate) break;
    doc = migrate(doc);
    version += 1;
  }
  return doc;
}

export type ImportResult =
  | { ok: true; project: CalqoProject }
  | { ok: false; error: string; issues?: string[] };

/** Validate a raw value against the strict schema; returns the Zod result. */
export function validateProject(raw: unknown) {
  return projectSchema.safeParse(raw);
}

/** Migrate then validate an untrusted document (disk import or AI output).
 * Unknown keys are stripped; failures are reported with readable issue paths. */
export function safeImportProject(raw: unknown): ImportResult {
  const migrated = migrateToCurrent(raw);
  const result = projectSchema.safeParse(migrated);
  if (result.success) {
    return { ok: true, project: result.data };
  }
  const issues = result.error.issues.map(
    (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
  );
  return { ok: false, error: 'Project failed validation.', issues };
}
