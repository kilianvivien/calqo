import Dexie, { type Table } from 'dexie';
import type { CalqoProject, GlossaryEntry } from '@/lib/schema';
import type { CalqoFile } from '@/lib/adapters/file/FileImportExportAdapter';

export interface ProjectRecord {
  id: string;
  name: string;
  schemaVersion: number;
  updatedAt: string;
  createdAt: string;
  project: CalqoProject;
}

export interface AssetRecord {
  id: string;
  projectId: string;
  kind: 'raster' | 'svg';
  mimeType: string;
  name: string;
  blob: Blob;
  width?: number;
  height?: number;
  createdAt: string;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

/** A user-saved starter: a full `.calqo` envelope snapshot plus a pre-rendered
 * thumbnail data URL for the gallery card. */
export interface StarterRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  envelope: CalqoFile;
  /** PNG data URL rendered at save time. */
  thumbnail?: string;
}

/** A local brand profile (Brand Lite): app data, never part of a project
 * document. The optional logo blob lives in the shared asset store under the
 * app-brand scope and is copied into projects on insertion. */
export interface BrandProfileRecord {
  id: string;
  name: string;
  palette: string[];
  headingFont?: string;
  bodyFont?: string;
  logoAssetId?: string;
  glossary: GlossaryEntry[];
  createdAt: string;
  updatedAt: string;
}

export class CalqoDatabase extends Dexie {
  projects!: Table<ProjectRecord, string>;
  assets!: Table<AssetRecord, string>;
  settings!: Table<SettingRecord, string>;
  starters!: Table<StarterRecord, string>;
  brandProfiles!: Table<BrandProfileRecord, string>;

  constructor() {
    super('calqo');
    this.version(1).stores({
      projects: 'id, name, updatedAt, createdAt',
      assets: 'id, projectId, kind, createdAt',
      settings: 'key',
    });
    // v2: local starter library + brand profiles (Milestone D groundwork).
    this.version(2).stores({
      starters: 'id, name, updatedAt, createdAt',
      brandProfiles: 'id, name, updatedAt, createdAt',
    });
  }
}

export const db = new CalqoDatabase();
