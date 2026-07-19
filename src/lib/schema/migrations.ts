import {
  CURRENT_SCHEMA_VERSION,
  projectSchema,
  type CalqoLayer,
  type CalqoProject,
} from './schema';

/** A migration lifts a raw document from version N to N+1. */
type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** v1 → v2 (Animate mode, schema v2). Animation fields are all optional, so a
 * v1 document is already a structurally valid v2 document; the only required
 * rewrite is the version stamp. Content is cloned and otherwise untouched. */
export function migrateV1ToV2(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  return { ...structuredClone(raw), schemaVersion: 2 };
}

const migrations: Record<number, Migration> = {
  1: migrateV1ToV2,
};

export function detectSchemaVersion(raw: unknown): number {
  if (raw && typeof raw === 'object' && 'schemaVersion' in raw) {
    const v = (raw as { schemaVersion: unknown }).schemaVersion;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  // Pre-versioned documents are treated as v1.
  return 1;
}

/** Thrown when a document needs a migration step that does not exist, so the
 * caller sees the real cause instead of an opaque literal-version mismatch. */
export class MissingMigrationError extends Error {
  constructor(
    readonly fromVersion: number,
    readonly toVersion: number = CURRENT_SCHEMA_VERSION,
  ) {
    super(
      `No migration from schema v${fromVersion} toward v${toVersion}. This file may come from a newer Calqo.`,
    );
    this.name = 'MissingMigrationError';
  }
}

/** Apply migrations in sequence until the document reaches the current version.
 * Throws {@link MissingMigrationError} when a required step is missing rather
 * than silently returning an under-migrated document. */
export function migrateToCurrent(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  let doc = raw as Record<string, unknown>;
  let version = detectSchemaVersion(doc);
  // A version above the current one comes from a newer build — there is no
  // forward migration, so fail clearly instead of hitting an opaque validation
  // error on the version literal.
  if (version > CURRENT_SCHEMA_VERSION) throw new MissingMigrationError(version);
  while (version < CURRENT_SCHEMA_VERSION) {
    const migrate = migrations[version];
    if (!migrate) throw new MissingMigrationError(version);
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
 * Unknown keys are stripped; failures are reported with readable issue paths.
 * A future-version file (missing migration) fails as a readable error, not a
 * thrown exception, so callers can surface it in the UI. */
export function safeImportProject(raw: unknown): ImportResult {
  let migrated: unknown;
  try {
    migrated = migrateToCurrent(raw);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Migration failed.',
    };
  }
  const result = projectSchema.safeParse(migrated);
  if (result.success) {
    return { ok: true, project: result.data };
  }
  const issues = result.error.issues.map(
    (i) => `${i.path.join('.') || '(root)'}: ${i.message}`,
  );
  return { ok: false, error: 'Project failed validation.', issues };
}

// ---------------------------------------------------------------------------
// v2 → v1 downgrade (explicit, opt-in compatibility export — §4.4 / AN-0.3)
//
// A v2 project can only be written as a v1-compatible document when it carries
// no v2-only data: no layer animation, no scene timing, and no clip settings.
// The downgrade never mutates the live project and never strips animation to
// force a fit — the caller must decide to export an unanimated document.
// ---------------------------------------------------------------------------

function anyLayerAnimated(layers: CalqoLayer[]): boolean {
  return layers.some((layer) => {
    if (layer.animation) return true;
    if (layer.type === 'group') return anyLayerAnimated(layer.children);
    return false;
  });
}

/** True when the project has no v2-only fields and can safely serialize to a
 * v1 envelope. */
export function canDowngradeToV1(project: CalqoProject): boolean {
  if (project.clipSettings) return false;
  return project.artboards.every(
    (ab) => !ab.timing && !anyLayerAnimated(ab.layers),
  );
}

/** Produce a v1-compatible plain document from a v2 project, without mutating
 * the input. Returns `null` when the project carries animation/timing that a v1
 * client could not represent (callers should surface a warning instead of
 * silently dropping data). The returned value is a raw document (not re-parsed
 * against the current schema, whose version literal is now 2). */
export function toV1CompatibleDocument(
  project: CalqoProject,
): Record<string, unknown> | null {
  if (!canDowngradeToV1(project)) return null;
  const clone = structuredClone(project) as Record<string, unknown>;
  // Drop v2-only optional fields even though they are known-empty here, so the
  // envelope contains nothing a v1 client would reject.
  delete clone.clipSettings;
  clone.schemaVersion = 1;
  return clone;
}
