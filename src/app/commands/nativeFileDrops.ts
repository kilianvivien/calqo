import { platformRuntime } from '@/lib/platform/runtime';
import { assetStorage, files } from '@/lib/adapters';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import { useProjectStore } from '@/lib/state/projectStore';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { addImportedAssetLayer } from '@/editor/commands/projectCommands';
import { importProjectText } from '@/editor/export/calqoFile';

function mimeFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase();
  if (ext === 'svg') return 'image/svg+xml';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  return 'image/png';
}

function nameFromPath(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function blobPart(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

async function addImage(path: string): Promise<void> {
  const projectId = useWorkspaceStore.getState().activeProjectId;
  const project = projectId ? useProjectStore.getState().projects[projectId] : null;
  if (!project || !files.readBinaryFileFromDisk) return;
  const artboardId = useSelectionStore.getState().activeArtboardId;
  const artboard =
    project.artboards.find((candidate) => candidate.id === artboardId) ??
    project.artboards[0];
  if (!artboard) return;
  const mimeType = mimeFromPath(path);
  const bytes = await files.readBinaryFileFromDisk(path);
  const blob = new Blob([blobPart(bytes)], { type: mimeType });
  const asset = await assetStorage.saveAsset(project.id, blob, {
    kind: mimeType === 'image/svg+xml' ? 'svg' : 'raster',
    name: nameFromPath(path),
    mimeType,
  });
  addImportedAssetLayer(project.id, asset, artboard.width * 0.15, artboard.height * 0.15);
}

async function openProject(path: string): Promise<void> {
  if (!files.readTextFileFromDisk) return;
  await importProjectText(await files.readTextFileFromDisk(path), { sourcePath: path });
}

async function handlePath(path: string): Promise<void> {
  const lower = path.toLowerCase();
  if (lower.endsWith('.calqo') || lower.endsWith('.json')) {
    await openProject(path);
    return;
  }
  if (/\.(png|jpe?g|webp|svg)$/.test(lower)) await addImage(path);
}

export function installNativeFileDrops(): () => void {
  if (!platformRuntime.capabilities.fileDrops) return () => {};
  let cleanup: (() => void) | null = null;
  void import('@tauri-apps/api/webview').then(({ getCurrentWebview }) =>
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') return;
        void Promise.all(event.payload.paths.map(handlePath)).catch((error) => {
          console.error('[Calqo] native file drop failed', error);
        });
      })
      .then((unlisten) => {
        cleanup = unlisten;
      }),
  );
  return () => cleanup?.();
}
