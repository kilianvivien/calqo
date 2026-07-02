import {
  ARTBOARD_PRESET_LIST,
  type CalqoArtboard,
  type CalqoLayer,
  type CalqoProject,
} from '@/lib/schema';
import { isGroupLayer } from '@/editor/utils/layers';
import { APP_VERSION } from '@/lib/appInfo';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { workspaceStore } from '@/lib/state/workspaceStore';
import { mcpStore } from '@/lib/state/mcpStore';
import { projectRevision } from './executor';

/** Read-only context handed to MCP agents. Compact by design: geometry, text,
 * and structure — never asset blobs, provider settings, or anything secret. */

interface LayerSummary {
  id: string;
  type: CalqoLayer['type'];
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  visible: boolean;
  locked: boolean;
  /** Per-locale text (text layers) or row texts for the active locale (lists). */
  text?: Record<string, string> | string[];
  shape?: string;
  assetId?: string;
  children?: LayerSummary[];
}

function summarizeLayer(layer: CalqoLayer, activeLocale: string): LayerSummary {
  const summary: LayerSummary = {
    id: layer.id,
    type: layer.type,
    name: layer.name,
    x: Math.round(layer.x),
    y: Math.round(layer.y),
    w: Math.round(layer.w),
    h: Math.round(layer.h),
    rotation: layer.rotation,
    visible: layer.visible,
    locked: layer.locked,
  };
  if (layer.type === 'text') summary.text = layer.text;
  if (layer.type === 'list') {
    summary.text = layer.items.map((item) => item.text[activeLocale] ?? '');
  }
  if (layer.type === 'shape') summary.shape = layer.shape;
  if (layer.type === 'image' || layer.type === 'svg') summary.assetId = layer.assetId;
  if (isGroupLayer(layer)) {
    summary.children = layer.children.map((child) => summarizeLayer(child, activeLocale));
  }
  return summary;
}

function summarizeArtboard(artboard: CalqoArtboard, activeLocale: string) {
  return {
    id: artboard.id,
    name: artboard.name,
    preset: artboard.preset,
    width: artboard.width,
    height: artboard.height,
    background:
      artboard.background.type === 'solid'
        ? { type: 'solid' as const, color: artboard.background.color }
        : { type: artboard.background.type },
    layerCount: artboard.layers.length,
    layers: artboard.layers.map((layer) => summarizeLayer(layer, activeLocale)),
  };
}

export function serializeProjectSummary(project: CalqoProject) {
  return {
    id: project.id,
    name: project.name,
    revision: projectRevision(project),
    contentLocales: project.contentLocales,
    activeContentLocale: project.activeContentLocale,
    palette: project.palette,
    artboards: project.artboards.map((artboard) =>
      summarizeArtboard(artboard, project.activeContentLocale),
    ),
    assets: project.assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      width: asset.width,
      height: asset.height,
    })),
  };
}

export function serializeAppStatus() {
  const activeProjectId = workspaceStore.getState().activeProjectId;
  const project = activeProjectId ? projectStore.getState().projects[activeProjectId] : null;
  const mcp = mcpStore.getState();
  return {
    app: 'Calqo',
    version: APP_VERSION,
    permissionMode: mcp.settings.permissionMode,
    writeAccess:
      mcp.settings.permissionMode === 'read'
        ? 'denied'
        : mcp.sessionWriteGranted
          ? 'granted'
          : 'requires-approval',
    openProjectIds: Object.keys(projectStore.getState().projects),
    activeProject: project
      ? {
          id: project.id,
          name: project.name,
          revision: projectRevision(project),
          activeContentLocale: project.activeContentLocale,
          activeArtboardId:
            selectionStore.getState().activeArtboardId ?? project.artboards[0]?.id ?? null,
          selectedLayerIds: selectionStore.getState().selectedLayerIds,
          artboards: project.artboards.map((artboard) => ({
            id: artboard.id,
            name: artboard.name,
            preset: artboard.preset,
            width: artboard.width,
            height: artboard.height,
            layerCount: artboard.layers.length,
          })),
        }
      : null,
    hint: 'Call calqo_get_guide before drawing. Use calqo_apply_operations for edits.',
  };
}

export function serializeArtboardPresets() {
  return ARTBOARD_PRESET_LIST.map((preset) => ({
    id: preset.id,
    name: preset.name,
    width: preset.width,
    height: preset.height,
  }));
}
