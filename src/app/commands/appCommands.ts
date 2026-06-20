import i18n from '@/lib/i18n';
import { assetStorage, clipboard, files } from '@/lib/adapters';
import { isTauri } from '@/lib/platform/runtime';
import { useUiStore, type EditorTool } from '@/lib/state/uiStore';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import { useProjectStore } from '@/lib/state/projectStore';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { APP_REPOSITORY_URL } from '@/lib/appInfo';
import { APP_VERSION } from '@/lib/appInfo';
import { historyStore } from '@/lib/state/historyStore';
import {
  addImportedAssetLayer,
  closeProject,
  copySelectedLayers,
  deleteSelectedLayers,
  duplicateSelectedLayers,
  groupSelectedLayers,
  pasteLayers,
  redoProject,
  saveProject,
  selectAllLayers,
  shiftSelectionZOrder,
  undoProject,
  ungroupSelected,
} from '@/editor/commands/projectCommands';
import {
  exportProjectFile,
  openNativeProjectFile,
  saveNativeProjectFile,
} from '@/editor/export/calqoFile';
import { exportArtboardRaster } from '@/editor/export/rasterExport';
import { shareArtboardPng } from '@/editor/export/share';

export type AppCommandId =
  | 'app.about'
  | 'app.settings'
  | 'app.quit'
  | 'file.new'
  | 'file.open'
  | 'file.save'
  | 'file.saveAs'
  | 'file.close'
  | 'file.export'
  | 'file.share'
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.copy'
  | 'edit.paste'
  | 'edit.selectAll'
  | 'edit.duplicate'
  | 'edit.delete'
  | 'insert.text'
  | 'insert.list'
  | 'insert.image'
  | 'insert.imageFromClipboard'
  | 'insert.svg'
  | 'object.group'
  | 'object.ungroup'
  | 'object.forward'
  | 'object.backward'
  | 'object.front'
  | 'object.back'
  | 'view.zoomIn'
  | 'view.zoomOut'
  | 'view.fit'
  | 'view.toggleSnap'
  | 'view.theme'
  | 'view.transparencyAuto'
  | 'view.transparencyGlass'
  | 'view.transparencySolid'
  | 'ai.promptTemplate'
  | 'ai.translate'
  | 'window.shortcuts'
  | 'help.github'
  | 'help.diagnostics';

interface CommandContext {
  openNewProject: () => void;
  openExport: () => void;
  openSettings: () => void;
  openShortcuts: () => void;
  openDiagnostics: () => void;
}

export interface CommandDefinition {
  id: AppCommandId;
  labelKey: string;
  accelerator?: string;
}

export const appCommandDefinitions: CommandDefinition[] = [
  { id: 'app.about', labelKey: 'common:menu.app.about' },
  { id: 'app.settings', labelKey: 'common:settings.open', accelerator: 'CmdOrCtrl+,' },
  { id: 'app.quit', labelKey: 'common:menu.app.quit', accelerator: 'CmdOrCtrl+Q' },
  { id: 'file.new', labelKey: 'common:actions.new', accelerator: 'CmdOrCtrl+N' },
  { id: 'file.open', labelKey: 'common:actions.open', accelerator: 'CmdOrCtrl+O' },
  { id: 'file.save', labelKey: 'common:actions.save', accelerator: 'CmdOrCtrl+S' },
  { id: 'file.saveAs', labelKey: 'common:menu.file.saveAs', accelerator: 'CmdOrCtrl+Shift+S' },
  { id: 'file.close', labelKey: 'common:actions.close', accelerator: 'CmdOrCtrl+W' },
  { id: 'file.export', labelKey: 'common:actions.export', accelerator: 'CmdOrCtrl+E' },
  { id: 'file.share', labelKey: 'editor:title.share', accelerator: 'CmdOrCtrl+Shift+E' },
  { id: 'edit.undo', labelKey: 'common:actions.undo', accelerator: 'CmdOrCtrl+Z' },
  { id: 'edit.redo', labelKey: 'common:actions.redo', accelerator: 'CmdOrCtrl+Shift+Z' },
  { id: 'edit.copy', labelKey: 'common:menu.edit.copy', accelerator: 'CmdOrCtrl+C' },
  { id: 'edit.paste', labelKey: 'common:menu.edit.paste', accelerator: 'CmdOrCtrl+V' },
  { id: 'edit.selectAll', labelKey: 'common:menu.edit.selectAll', accelerator: 'CmdOrCtrl+A' },
  { id: 'edit.duplicate', labelKey: 'common:actions.duplicate', accelerator: 'CmdOrCtrl+D' },
  { id: 'edit.delete', labelKey: 'common:actions.delete', accelerator: 'Delete' },
  { id: 'insert.text', labelKey: 'editor:tools.text', accelerator: 'T' },
  { id: 'insert.list', labelKey: 'editor:tools.list', accelerator: 'Shift+L' },
  { id: 'insert.image', labelKey: 'editor:tools.image', accelerator: 'I' },
  { id: 'insert.imageFromClipboard', labelKey: 'common:menu.insert.imageFromClipboard' },
  { id: 'insert.svg', labelKey: 'editor:tools.svg' },
  { id: 'object.group', labelKey: 'editor:layersPanel.group', accelerator: 'CmdOrCtrl+G' },
  { id: 'object.ungroup', labelKey: 'editor:layersPanel.ungroup', accelerator: 'CmdOrCtrl+Shift+G' },
  { id: 'object.forward', labelKey: 'common:menu.object.forward', accelerator: ']' },
  { id: 'object.backward', labelKey: 'common:menu.object.backward', accelerator: '[' },
  { id: 'object.front', labelKey: 'common:menu.object.front', accelerator: 'CmdOrCtrl+]' },
  { id: 'object.back', labelKey: 'common:menu.object.back', accelerator: 'CmdOrCtrl+[' },
  { id: 'view.zoomIn', labelKey: 'editor:status.zoomIn', accelerator: 'CmdOrCtrl+=' },
  { id: 'view.zoomOut', labelKey: 'editor:status.zoomOut', accelerator: 'CmdOrCtrl+-' },
  { id: 'view.fit', labelKey: 'editor:status.fitToScreen', accelerator: 'CmdOrCtrl+0' },
  { id: 'view.toggleSnap', labelKey: 'editor:status.snap' },
  { id: 'view.theme', labelKey: 'common:theme.toggle' },
  { id: 'view.transparencyAuto', labelKey: 'common:transparency.auto' },
  { id: 'view.transparencyGlass', labelKey: 'common:transparency.glass' },
  { id: 'view.transparencySolid', labelKey: 'common:transparency.solid' },
  { id: 'ai.promptTemplate', labelKey: 'editor:ai.promptTemplate' },
  { id: 'ai.translate', labelKey: 'editor:ai.translate' },
  { id: 'window.shortcuts', labelKey: 'common:shortcuts.open', accelerator: '?' },
  { id: 'help.github', labelKey: 'editor:title.github' },
  { id: 'help.diagnostics', labelKey: 'editor:diagnostics.title' },
];

let context: CommandContext | null = null;

export function registerAppCommandHandlers(next: CommandContext): () => void {
  context = next;
  return () => {
    if (context === next) context = null;
  };
}

export function activeProjectId(): string | null {
  return useWorkspaceStore.getState().activeProjectId;
}

function activeProject() {
  const id = activeProjectId();
  return id ? useProjectStore.getState().projects[id] : null;
}

function activeArtboard() {
  const project = activeProject();
  const activeArtboardId = useSelectionStore.getState().activeArtboardId;
  return project
    ? (project.artboards.find((artboard) => artboard.id === activeArtboardId) ??
        project.artboards[0] ??
        null)
    : null;
}

function blobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export function getAppCommandState(id: AppCommandId): { enabled: boolean } {
  const project = activeProject();
  const selectedCount = useSelectionStore.getState().selectedLayerIds.length;
  const history = project ? historyStore.getState().histories[project.id] : undefined;
  if (
    id.startsWith('file.') ||
    id.startsWith('edit.') ||
    id.startsWith('object.') ||
    id.startsWith('ai.') ||
    id === 'help.diagnostics'
  ) {
    if (id === 'file.new' || id === 'file.open') return { enabled: true };
    if (!project) return { enabled: false };
  }
  if (id === 'object.group') return { enabled: selectedCount >= 2 };
  if (id === 'object.ungroup') return { enabled: selectedCount === 1 };
  if (id === 'edit.delete' || id === 'edit.duplicate' || id === 'edit.copy') {
    return { enabled: selectedCount > 0 };
  }
  if (id === 'ai.translate') return { enabled: Boolean(project) };
  if (id === 'edit.undo') return { enabled: (history?.past.length ?? 0) > 0 };
  if (id === 'edit.redo') return { enabled: (history?.future.length ?? 0) > 0 };
  return { enabled: true };
}

function setTool(tool: EditorTool): void {
  useUiStore.getState().setActiveTool(tool);
}

async function openImageFiles(): Promise<void> {
  const project = activeProject();
  const artboard = activeArtboard();
  const openImages = files.openImageFilesFromDisk;
  if (!project || !artboard || !openImages) return;
  const images = await openImages();
  for (const image of images) {
    const blob = new Blob([blobPart(image.bytes)], { type: image.mimeType });
    const asset = await assetStorage.saveAsset(project.id, blob, {
      kind: image.mimeType === 'image/svg+xml' ? 'svg' : 'raster',
      name: image.name,
      mimeType: image.mimeType,
    });
    addImportedAssetLayer(project.id, asset, artboard.width * 0.15, artboard.height * 0.15);
  }
}

async function pasteImageFromClipboard(): Promise<void> {
  const project = activeProject();
  const artboard = activeArtboard();
  if (!project || !artboard || !clipboard.readImage) return;
  const blob = await clipboard.readImage();
  if (!blob) return;
  const asset = await assetStorage.saveAsset(project.id, blob, {
    kind: 'raster',
    name: `Clipboard image ${new Date().toLocaleTimeString()}`,
    mimeType: 'image/png',
  });
  addImportedAssetLayer(project.id, asset, artboard.width * 0.15, artboard.height * 0.15);
}

async function copyActiveArtboardPng(): Promise<void> {
  const project = activeProject();
  const artboard = activeArtboard();
  if (!project || !artboard) return;
  const blob = await exportArtboardRaster({
    artboard,
    locale: project.activeContentLocale,
    format: 'png',
    pixelRatio: 2,
    transparent: false,
  });
  await clipboard.writeImage(blob);
}

export async function invokeAppCommand(id: AppCommandId): Promise<void> {
  if (!getAppCommandState(id).enabled) return;
  const projectId = activeProjectId();
  const ui = useUiStore.getState();
  switch (id) {
    case 'app.about':
      window.alert(i18n.t('common:app.versionLabel', { version: APP_VERSION }));
      return;
    case 'app.settings':
      context?.openSettings();
      return;
    case 'app.quit':
      if (isTauri) {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        await getCurrentWindow().close();
      }
      return;
    case 'file.new':
      context?.openNewProject();
      return;
    case 'file.open':
      if (isTauri) await openNativeProjectFile();
      else window.dispatchEvent(new CustomEvent('calqo:open-import'));
      return;
    case 'file.save':
      if (!projectId) return;
      if (isTauri) await saveNativeProjectFile(projectId, 'save');
      else await saveProject(projectId);
      return;
    case 'file.saveAs':
      if (!projectId) return;
      if (isTauri) await saveNativeProjectFile(projectId, 'saveAs');
      else await exportProjectFile(projectId);
      return;
    case 'file.close':
      if (projectId) await closeProject(projectId);
      return;
    case 'file.export':
      context?.openExport();
      return;
    case 'file.share': {
      const project = activeProject();
      const artboard = activeArtboard();
      if (project && artboard) await shareArtboardPng(project, artboard);
      return;
    }
    case 'edit.undo':
      if (projectId) undoProject(projectId);
      return;
    case 'edit.redo':
      if (projectId) redoProject(projectId);
      return;
    case 'edit.copy':
      if (projectId) copySelectedLayers(projectId);
      return;
    case 'edit.paste':
      if (projectId) pasteLayers(projectId);
      return;
    case 'edit.selectAll':
      if (projectId) selectAllLayers(projectId);
      return;
    case 'edit.duplicate':
      if (projectId) duplicateSelectedLayers(projectId);
      return;
    case 'edit.delete':
      if (projectId) deleteSelectedLayers(projectId);
      return;
    case 'insert.text':
      setTool('text');
      return;
    case 'insert.list':
      setTool('list');
      return;
    case 'insert.image':
      if (isTauri) await openImageFiles();
      else setTool('image');
      return;
    case 'insert.imageFromClipboard':
      await pasteImageFromClipboard();
      return;
    case 'insert.svg':
      useUiStore.getState().setSvgDialog(true);
      return;
    case 'object.group':
      if (projectId) groupSelectedLayers(projectId);
      return;
    case 'object.ungroup':
      if (projectId) ungroupSelected(projectId);
      return;
    case 'object.forward':
      if (projectId) shiftSelectionZOrder(projectId, 'forward');
      return;
    case 'object.backward':
      if (projectId) shiftSelectionZOrder(projectId, 'backward');
      return;
    case 'object.front':
      if (projectId) shiftSelectionZOrder(projectId, 'front');
      return;
    case 'object.back':
      if (projectId) shiftSelectionZOrder(projectId, 'back');
      return;
    case 'view.zoomIn':
      ui.setZoom(ui.zoom * 1.1);
      return;
    case 'view.zoomOut':
      ui.setZoom(ui.zoom / 1.1);
      return;
    case 'view.fit':
      ui.requestFit();
      return;
    case 'view.toggleSnap':
      ui.setSnapEnabled(!ui.snapEnabled);
      return;
    case 'view.theme':
      ui.toggleTheme();
      return;
    case 'view.transparencyAuto':
      ui.setTransparency('auto');
      return;
    case 'view.transparencyGlass':
      ui.setTransparency('glass');
      return;
    case 'view.transparencySolid':
      ui.setTransparency('solid');
      return;
    case 'ai.promptTemplate':
      ui.setAiDialog('template');
      return;
    case 'ai.translate':
      ui.setAiDialog('translate');
      return;
    case 'window.shortcuts':
      context?.openShortcuts();
      return;
    case 'help.github':
      if (isTauri) {
        const { openUrl } = await import('@tauri-apps/plugin-opener');
        await openUrl(APP_REPOSITORY_URL);
      } else {
        window.open(APP_REPOSITORY_URL, '_blank', 'noopener,noreferrer');
      }
      return;
    case 'help.diagnostics':
      context?.openDiagnostics();
      return;
  }
}

export function invokeAppCommandSync(id: AppCommandId): void {
  void invokeAppCommand(id).catch((error) => {
    console.error(`[Calqo] command failed: ${id}`, error);
  });
}

export { copyActiveArtboardPng };
