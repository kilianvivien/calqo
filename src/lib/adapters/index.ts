/** Active adapter implementations. The rest of the app imports these
 * interface-typed singletons, so swapping in Tauri implementations later is a
 * one-line change here (plan §0.3). */
import { dexieStorageAdapter } from './storage/dexieStorageAdapter';
import { dexieAssetStorageAdapter } from './assets/dexieAssetStorageAdapter';
import { browserFileAdapter } from './file/browserFileAdapter';
import { tauriFileAdapter } from './file/tauriFileAdapter';
import { browserClipboardAdapter } from './clipboard/browserClipboardAdapter';
import { tauriClipboardAdapter } from './clipboard/tauriClipboardAdapter';
import { browserFontAdapter } from './fonts/browserFontAdapter';
import { tauriFontAdapter } from './fonts/tauriFontAdapter';
import { dexieSettingsAdapter } from './settings/dexieSettingsAdapter';
import { tauriSettingsAdapter } from './settings/tauriSettingsAdapter';
import { browserDialogAdapter } from './dialog/browserDialogAdapter';
import { tauriDialogAdapter } from './dialog/tauriDialogAdapter';
import { isTauri } from '@/lib/platform/runtime';

import type { StorageAdapter } from './storage/StorageAdapter';
import type { AssetStorageAdapter } from './assets/AssetStorageAdapter';
import type { FileImportExportAdapter } from './file/FileImportExportAdapter';
import type { ClipboardAdapter } from './clipboard/ClipboardAdapter';
import type { FontAdapter } from './fonts/FontAdapter';
import type { SettingsAdapter } from './settings/SettingsAdapter';
import type { DialogAdapter } from './dialog/DialogAdapter';

export const storage: StorageAdapter = dexieStorageAdapter;
export const assetStorage: AssetStorageAdapter = dexieAssetStorageAdapter;
export const files: FileImportExportAdapter = isTauri
  ? tauriFileAdapter
  : browserFileAdapter;
export const clipboard: ClipboardAdapter = isTauri
  ? tauriClipboardAdapter
  : browserClipboardAdapter;
export const fonts: FontAdapter = isTauri ? tauriFontAdapter : browserFontAdapter;
export const appSettings: SettingsAdapter = isTauri
  ? tauriSettingsAdapter
  : dexieSettingsAdapter;
export const dialog: DialogAdapter = isTauri
  ? tauriDialogAdapter
  : browserDialogAdapter;

export type { StorageAdapter, ProjectSummary } from './storage/StorageAdapter';
export type { AssetStorageAdapter, AssetMeta } from './assets/AssetStorageAdapter';
export type { FileImportExportAdapter, CalqoFile } from './file/FileImportExportAdapter';
export type { ClipboardAdapter } from './clipboard/ClipboardAdapter';
export type { FontAdapter, FontDef, FontVariant } from './fonts/FontAdapter';
export type { SettingsAdapter } from './settings/SettingsAdapter';
export type { DialogAdapter } from './dialog/DialogAdapter';
