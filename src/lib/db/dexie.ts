import Dexie, { type Table } from 'dexie';
import type { CalqoProject } from '@/lib/schema';

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

export class CalqoDatabase extends Dexie {
  projects!: Table<ProjectRecord, string>;
  assets!: Table<AssetRecord, string>;
  settings!: Table<SettingRecord, string>;

  constructor() {
    super('calqo');
    this.version(1).stores({
      projects: 'id, name, updatedAt, createdAt',
      assets: 'id, projectId, kind, createdAt',
      settings: 'key',
    });
  }
}

export const db = new CalqoDatabase();
