import { exportArtboardRaster } from '@/editor/export/rasterExport';
import { McpOperationError, getPreviewInputSchema } from './operationSchemas';
import { projectStore } from '@/lib/state/projectStore';
import { workspaceStore } from '@/lib/state/workspaceStore';
import { selectionStore } from '@/lib/state/selectionStore';

/** Longest edge of an agent preview, in px. Keeps the base64 payload small
 * enough for agent context windows while staying legible. */
export const PREVIEW_MAX_EDGE = 1024;

export interface McpPreviewResult {
  ok: true;
  projectId: string;
  artboardId: string;
  mimeType: 'image/png';
  width: number;
  height: number;
  /** Base64-encoded PNG bytes (no data-URL prefix). */
  data: string;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function downscale(blob: Blob, width: number, height: number): Promise<Blob> {
  const scale = PREVIEW_MAX_EDGE / Math.max(width, height);
  if (scale >= 1) return blob;
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) return blob;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (scaled) => (scaled ? resolve(scaled) : reject(new Error('preview encode failed'))),
        'image/png',
      );
    });
  } finally {
    bitmap.close();
  }
}

/** Render an artboard to a bounded PNG for the agent's look-and-refine loop.
 * Uses the same offscreen Konva pipeline as user exports. */
export async function renderMcpPreview(raw: unknown): Promise<McpPreviewResult> {
  const parsed = getPreviewInputSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    throw new McpOperationError({
      code: 'VALIDATION_FAILED',
      message: 'Invalid preview request.',
      recoverable: true,
      details: {
        issues: parsed.error.issues.map(
          (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
        ),
      },
    });
  }
  const projectId = parsed.data.projectId ?? workspaceStore.getState().activeProjectId;
  const project = projectId ? projectStore.getState().projects[projectId] : null;
  if (!project) {
    throw new McpOperationError({
      code: 'PROJECT_NOT_FOUND',
      message: 'No project is open to preview.',
      recoverable: true,
    });
  }
  const artboardId =
    parsed.data.artboardId ??
    selectionStore.getState().activeArtboardId ??
    project.artboards[0]?.id;
  const artboard = project.artboards.find((candidate) => candidate.id === artboardId);
  if (!artboard) {
    throw new McpOperationError({
      code: 'ARTBOARD_NOT_FOUND',
      message: `Artboard "${artboardId}" does not exist.`,
      recoverable: true,
      details: { artboardIds: project.artboards.map((candidate) => candidate.id) },
    });
  }

  try {
    const fullSize = await exportArtboardRaster({
      artboard,
      locale: project.activeContentLocale,
      format: 'png',
      pixelRatio: 1,
      transparent: false,
    });
    const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(artboard.width, artboard.height));
    const scaled = await downscale(fullSize, artboard.width, artboard.height);
    return {
      ok: true,
      projectId: project.id,
      artboardId: artboard.id,
      mimeType: 'image/png',
      width: Math.max(1, Math.round(artboard.width * scale)),
      height: Math.max(1, Math.round(artboard.height * scale)),
      data: await blobToBase64(scaled),
    };
  } catch (error) {
    if (error instanceof McpOperationError) throw error;
    throw new McpOperationError({
      code: 'EXPORT_FAILED',
      message: `Preview rendering failed: ${error instanceof Error ? error.message : String(error)}`,
      recoverable: true,
    });
  }
}
