import { assetStorage } from '@/lib/adapters';
import { noticeIfOversized, measureImageFile } from '@/lib/utils/imageAsset';
import { createId } from '@/lib/utils/ids';
import type { CalqoAssetRef, ImageLayer } from '@/lib/schema';
import { editProject } from '@/editor/commands/projectCommands';
import { flattenLayers } from '@/editor/utils/layers';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { workspaceStore } from '@/lib/state/workspaceStore';
import {
  insertImageInputSchema,
  MAX_AGENT_IMAGE_BYTES,
  MAX_LAYERS_PER_ARTBOARD,
  McpOperationError,
  type AgentImageMimeType,
  type InsertImageInput,
  type McpErrorCode,
} from './operationSchemas';
import {
  projectRevision,
  resolveMcpArtboard,
  resolveMcpProject,
} from './executor';

/** Agents may bring an image from an image-generation tool or from the web,
 * but Calqo receives only the final bytes. It never fetches an agent-supplied
 * URL, which avoids SSRF and accidental forwarding of browsing credentials. */

function fail(
  code: McpErrorCode,
  message: string,
  recoverable = true,
  details?: unknown,
): never {
  throw new McpOperationError({ code, message, recoverable, details });
}

function assertRevision(projectId: string, expected?: string): void {
  if (!expected) return;
  const project = projectStore.getState().projects[projectId];
  const actual = project ? projectRevision(project) : null;
  if (actual !== expected) {
    fail(
      'REVISION_MISMATCH',
      'The project changed since the agent last read it.',
      true,
      { expected, actual },
    );
  }
}

function hasExpectedSignature(
  bytes: Uint8Array,
  mimeType: AgentImageMimeType,
): boolean {
  if (mimeType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return signature.every((byte, index) => bytes[index] === byte);
  }
  if (mimeType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

export function decodeAgentImageDataUrl(dataUrl: string): {
  blob: Blob;
  mimeType: AgentImageMimeType;
} {
  // MIME-style base64 is commonly wrapped with ASCII whitespace. Agents often
  // encounter that when reading generated files through text tools; normalize
  // it before both length validation and decoding.
  const normalized = dataUrl.replace(/[\t\n\f\r ]/g, '');
  const match =
    /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(
      normalized,
    );
  if (!match) {
    fail(
      'VALIDATION_FAILED',
      'dataUrl must be a base64 PNG, JPEG, or WebP data URL. Fetch or generate the image first; Calqo does not fetch remote URLs.',
    );
  }
  const mimeType = match[1] as AgentImageMimeType;
  let binary: string;
  try {
    binary = atob(match[2]);
  } catch {
    fail('VALIDATION_FAILED', 'dataUrl contains invalid base64 image data.');
  }
  if (binary.length > MAX_AGENT_IMAGE_BYTES) {
    fail(
      'VALIDATION_FAILED',
      `Image is ${binary.length} bytes; the cap is ${MAX_AGENT_IMAGE_BYTES} bytes. Resize or recompress it and retry.`,
    );
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (!hasExpectedSignature(bytes, mimeType)) {
    fail(
      'VALIDATION_FAILED',
      `Image bytes do not match the declared ${mimeType} MIME type.`,
    );
  }
  return { blob: new Blob([bytes], { type: mimeType }), mimeType };
}

function parseInput(raw: unknown): InsertImageInput {
  const normalized =
    raw &&
    typeof raw === 'object' &&
    !Array.isArray(raw) &&
    'dataUrl' in raw &&
    typeof (raw as { dataUrl?: unknown }).dataUrl === 'string'
      ? {
          ...raw,
          dataUrl: (raw as { dataUrl: string }).dataUrl.replace(
            /[\t\n\f\r ]/g,
            '',
          ),
        }
      : raw;
  const parsed = insertImageInputSchema.safeParse(normalized);
  if (!parsed.success) {
    fail('VALIDATION_FAILED', 'Invalid insert_image input.', true, {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

function defaultName(mimeType: AgentImageMimeType): string {
  const extension =
    mimeType === 'image/jpeg' ? 'jpg' : (mimeType.split('/')[1] ?? 'png');
  return `agent-image.${extension}`;
}

export interface InsertAgentImageResult {
  ok: true;
  projectId: string;
  artboardId: string;
  revision: string;
  asset: Pick<
    CalqoAssetRef,
    'id' | 'kind' | 'name' | 'mimeType' | 'width' | 'height'
  >;
  layerId: string;
  warnings: string[];
}

/** Persist an agent-supplied raster and place it as one editable image layer.
 * The manifest and layer mutation are a single undo step. If editor state
 * changes while the blob is being stored, the orphan blob is removed before
 * returning a revision error. */
export async function executeInsertAgentImage(
  raw: unknown,
): Promise<InsertAgentImageResult> {
  const input = parseInput(raw);
  const initialProject = resolveMcpProject(input.projectId);
  const initialArtboard = resolveMcpArtboard(initialProject, input.artboardId);
  assertRevision(initialProject.id, input.baseRevision);
  if (flattenLayers(initialArtboard.layers).length >= MAX_LAYERS_PER_ARTBOARD) {
    fail(
      'VALIDATION_FAILED',
      `Adding this image would exceed the ${MAX_LAYERS_PER_ARTBOARD}-layer cap per artboard.`,
    );
  }

  const { blob, mimeType } = decodeAgentImageDataUrl(input.dataUrl);
  const measured = await measureImageFile(blob);
  if (!measured.width || !measured.height) {
    fail(
      'VALIDATION_FAILED',
      'The supplied bytes could not be decoded as an image.',
    );
  }
  const name = input.name ?? defaultName(mimeType);
  noticeIfOversized(name, 'raster', measured.width, measured.height);

  assertRevision(initialProject.id, input.baseRevision);
  const asset = await assetStorage.saveAsset(initialProject.id, blob, {
    name,
    mimeType,
    kind: 'raster',
    width: measured.width,
    height: measured.height,
  });

  try {
    const project = resolveMcpProject(initialProject.id);
    const artboard = resolveMcpArtboard(project, initialArtboard.id);
    assertRevision(project.id, input.baseRevision);
    if (flattenLayers(artboard.layers).length >= MAX_LAYERS_PER_ARTBOARD) {
      fail(
        'VALIDATION_FAILED',
        `Adding this image would exceed the ${MAX_LAYERS_PER_ARTBOARD}-layer cap per artboard.`,
      );
    }

    const layer: ImageLayer = {
      id: createId('layer'),
      name,
      type: 'image',
      assetId: asset.id,
      x: input.x ?? 0,
      y: input.y ?? 0,
      w: input.w ?? artboard.width,
      h: input.h ?? artboard.height,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: false,
      fit: input.fit ?? 'cover',
    };
    const warnings: string[] = [];
    if (
      layer.x + layer.w < 0 ||
      layer.y + layer.h < 0 ||
      layer.x > artboard.width ||
      layer.y > artboard.height
    ) {
      warnings.push(
        `Image layer (${layer.id}) is entirely outside artboard bounds ${artboard.width}x${artboard.height}.`,
      );
    }

    editProject(
      project.id,
      (draft) => {
        draft.assets.push(asset);
        const target = draft.artboards.find(
          (candidate) => candidate.id === artboard.id,
        );
        if (!target) return;
        target.layers.push(layer);
      },
      { undoable: true },
    );

    if (
      workspaceStore.getState().activeProjectId === project.id &&
      selectionStore.getState().activeArtboardId === artboard.id
    ) {
      selectionStore.getState().setSelection([layer.id]);
    }
    const committed = projectStore.getState().projects[project.id];
    return {
      ok: true,
      projectId: project.id,
      artboardId: artboard.id,
      revision: committed
        ? projectRevision(committed)
        : projectRevision(project),
      asset: {
        id: asset.id,
        kind: asset.kind,
        name: asset.name,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
      },
      layerId: layer.id,
      warnings,
    };
  } catch (error) {
    await assetStorage.deleteAsset(asset.id).catch(() => undefined);
    throw error;
  }
}
