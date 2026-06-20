/** Active adapter implementations. The rest of the app imports these
 * interface-typed singletons, so swapping in Tauri implementations later is a
 * one-line change here (plan §0.3). */
import { dexieStorageAdapter } from './storage/dexieStorageAdapter';
import { dexieAssetStorageAdapter } from './assets/dexieAssetStorageAdapter';
import { browserFileAdapter } from './file/browserFileAdapter';
import { browserClipboardAdapter } from './clipboard/browserClipboardAdapter';
import { browserFontAdapter } from './fonts/browserFontAdapter';
import { dexieSettingsAdapter } from './settings/dexieSettingsAdapter';
import { browserDialogAdapter } from './dialog/browserDialogAdapter';

import type { StorageAdapter } from './storage/StorageAdapter';
import type { AssetStorageAdapter } from './assets/AssetStorageAdapter';
import type { FileImportExportAdapter } from './file/FileImportExportAdapter';
import type { ClipboardAdapter } from './clipboard/ClipboardAdapter';
import type { FontAdapter } from './fonts/FontAdapter';
import type { SettingsAdapter } from './settings/SettingsAdapter';
import type { DialogAdapter } from './dialog/DialogAdapter';

export const storage: StorageAdapter = dexieStorageAdapter;
export const assetStorage: AssetStorageAdapter = dexieAssetStorageAdapter;
export const files: FileImportExportAdapter = browserFileAdapter;
export const clipboard: ClipboardAdapter = browserClipboardAdapter;
export const fonts: FontAdapter = browserFontAdapter;
export const appSettings: SettingsAdapter = dexieSettingsAdapter;
export const dialog: DialogAdapter = browserDialogAdapter;

export type { StorageAdapter, ProjectSummary } from './storage/StorageAdapter';
export type { AssetStorageAdapter, AssetMeta } from './assets/AssetStorageAdapter';
export type { FileImportExportAdapter, CalqoFile } from './file/FileImportExportAdapter';
export type { ClipboardAdapter } from './clipboard/ClipboardAdapter';
export type { FontAdapter, FontDef } from './fonts/FontAdapter';
export type { SettingsAdapter } from './settings/SettingsAdapter';
export type { DialogAdapter } from './dialog/DialogAdapter';
