import { appSettings, assetStorage, files, storage } from '@/lib/adapters';
import type { CalqoFile } from '@/lib/adapters';
import { safeImportProject, type CalqoProject } from '@/lib/schema';
import { createId } from '@/lib/utils/ids';
import { APP_VERSION } from '@/lib/appInfo';
import {
  normalizeAiSettings,
  toPersistedAiSettings,
  type AiSettings,
} from '@/editor/ai/aiSettings';
import { remapProjectAssetIds } from '@/editor/assets/assetRemap';
import { buildCalqoFile, dataUrlToBlob } from '@/editor/export/calqoFile';

/**
 * A single portable snapshot of the whole app: every stored project (with its
 * assets inlined), the app-level settings, and the UI preferences kept in
 * localStorage. One file the user can stash or carry to another machine.
 *
 * API keys are deliberately *not* included — secrets shouldn't ride along in a
 * plaintext file. The provider choice/model survive; the key is re-entered after
 * a restore.
 */
export interface CalqoBackup {
  kind: 'calqo.backup';
  formatVersion: 1;
  app: 'calqo';
  appVersion: string;
  createdAt: string;
  projects: CalqoFile[];
  settings: Record<string, unknown>;
  localStorage: Record<string, string>;
}

/** App-level settings persisted via the settings adapter (Dexie / Tauri). */
const SETTING_KEYS = ['ai.settings', 'svg.saved'] as const;

/** UI preferences kept in localStorage. The open-tabs list is intentionally
 * excluded: it references project ids that change on a merge restore. */
const LOCAL_STORAGE_KEYS = [
  'calqo-theme',
  'calqo-transparency',
  'calqo-language',
] as const;

const BACKUP_EXTENSION = 'calqobackup';

function safeLocalGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore — sandboxed contexts */
  }
}

/** Remove API keys from a stored AI-settings value before it leaves the app. */
function scrubAiSettings(value: unknown): AiSettings {
  const normalized = normalizeAiSettings(value as Partial<AiSettings>);
  const stripped = toPersistedAiSettings({ ...normalized, storeKey: false }, false);
  // Preserve the user's "remember keys" preference even though the key itself
  // is gone, so the checkbox state is restored.
  return { ...stripped, storeKey: normalized.storeKey };
}

/** Build a full backup of projects, settings, and UI preferences. */
export async function buildAppBackup(): Promise<CalqoBackup> {
  const summaries = await storage.listProjects();
  const projects: CalqoFile[] = [];
  for (const summary of summaries) {
    const project = await storage.getProject(summary.id);
    if (project) projects.push(await buildCalqoFile(project));
  }

  const settings: Record<string, unknown> = {};
  for (const key of SETTING_KEYS) {
    const value = await appSettings.get<unknown>(key);
    if (value == null) continue;
    settings[key] = key === 'ai.settings' ? scrubAiSettings(value) : value;
  }

  const localPrefs: Record<string, string> = {};
  for (const key of LOCAL_STORAGE_KEYS) {
    const value = safeLocalGet(key);
    if (value != null) localPrefs[key] = value;
  }

  return {
    kind: 'calqo.backup',
    formatVersion: 1,
    app: 'calqo',
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    projects,
    settings,
    localStorage: localPrefs,
  };
}

/** Serialize and download a backup as a single `.calqobackup` file. */
export async function downloadAppBackup(): Promise<number> {
  const backup = await buildAppBackup();
  const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const date = backup.createdAt.slice(0, 10);
  await files.downloadBlob(blob, `calqo-backup-${date}.${BACKUP_EXTENSION}`);
  return backup.projects.length;
}

function isBackup(value: unknown): value is CalqoBackup {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as CalqoBackup).kind === 'calqo.backup' &&
    Array.isArray((value as CalqoBackup).projects)
  );
}

/** Parse and validate a backup file's text, throwing a readable error. */
export function parseBackup(text: string): CalqoBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }
  if (!isBackup(parsed)) {
    throw new Error('Not a Calqo backup file.');
  }
  return parsed;
}

/** Persist one project envelope to storage under a fresh id, cloning its assets
 * under fresh ids too. Does not open the project. */
async function restoreProject(file: CalqoFile): Promise<void> {
  const result = safeImportProject(file.project);
  if (!result.ok) {
    throw new Error(result.issues?.join('; ') ?? result.error);
  }
  const newProjectId = createId('proj');

  const idMap = new Map<string, string>();
  for (const asset of file.assets ?? []) {
    const blob = await dataUrlToBlob(asset.dataUrl);
    const newRef = await assetStorage.saveAsset(newProjectId, blob, {
      name: asset.name,
      mimeType: asset.mimeType,
      kind: asset.mimeType.includes('svg') ? 'svg' : 'raster',
    });
    idMap.set(asset.id, newRef.id);
  }

  const now = new Date().toISOString();
  const project: CalqoProject = {
    ...remapProjectAssetIds(result.project, idMap),
    id: newProjectId,
    createdAt: now,
    updatedAt: now,
  };
  await storage.saveProject(project);
}

export interface RestoreResult {
  projects: number;
}

/**
 * Restore a backup additively: every project is imported as a new copy (fresh
 * ids, so nothing already in the app is overwritten) and the settings / UI
 * preferences are applied. A reload afterward lets the settings take effect.
 */
export async function restoreAppBackup(backup: CalqoBackup): Promise<RestoreResult> {
  for (const file of backup.projects) {
    await restoreProject(file);
  }

  for (const [key, value] of Object.entries(backup.settings ?? {})) {
    await appSettings.set(key, value);
  }

  for (const [key, value] of Object.entries(backup.localStorage ?? {})) {
    safeLocalSet(key, value);
  }

  return { projects: backup.projects.length };
}
