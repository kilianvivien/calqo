import {
  ARTBOARD_PRESET_LIST,
  DEFAULT_SCENE_DURATION_MS,
  type CalqoArtboard,
  type CalqoLayer,
  type CalqoProject,
  type LayerAnimation,
  type PresetInstance,
} from '@/lib/schema';
import { isGroupLayer } from '@/editor/utils/layers';
import {
  isEditableMotion,
  motionKeyframeTimes,
  motionPoseAt,
} from '@/editor/animation/keyframes';
import { APP_VERSION } from '@/lib/appInfo';
import { projectStore } from '@/lib/state/projectStore';
import { selectionStore } from '@/lib/state/selectionStore';
import { workspaceStore } from '@/lib/state/workspaceStore';
import { mcpStore } from '@/lib/state/mcpStore';
import { projectRevision } from './executor';

/** Read-only context handed to MCP agents. Compact by design: geometry, text,
 * and structure — never asset blobs, provider settings, or anything secret. */

/** Animation as an agent needs to read it: enough to refine motion in place
 * rather than overwrite it blindly, without dumping the whole track IR. */
type AnimationSummary =
  | {
      mode: 'preset';
      enter?: PresetInstance;
      emphasis?: PresetInstance;
      exit?: PresetInstance;
    }
  | {
      /** Calqo's compact keyframe lane — editable by hand and by
       * `setLayerMotionKeyframe`. */
      mode: 'keyframes';
      /** Scene-relative pose times, ms. */
      times: number[];
      poses: Array<{ tMs: number } & ReturnType<typeof motionPoseAt>>;
    }
  | {
      /** Raw custom windows that are not a compact lane; replace wholesale
       * with `setLayerCustomWindows`. */
      mode: 'custom';
      windows: Array<{
        start: number;
        duration: number;
        props: string[];
        keyframeCount: number;
      }>;
    };

function summarizeAnimation(
  animation: LayerAnimation,
  sceneDurationMs: number,
): AnimationSummary {
  if (animation.mode === 'preset') {
    return {
      mode: 'preset',
      ...(animation.enter ? { enter: animation.enter } : {}),
      ...(animation.emphasis ? { emphasis: animation.emphasis } : {}),
      ...(animation.exit ? { exit: animation.exit } : {}),
    };
  }
  // Read the windows before the type guard: narrowing on `isEditableMotion`
  // leaves the negative branch with nothing left of the custom variant.
  const windows = animation.windows;
  if (isEditableMotion(animation, sceneDurationMs)) {
    const times = motionKeyframeTimes(animation, sceneDurationMs);
    return {
      mode: 'keyframes',
      times,
      poses: times.map((tMs) => ({
        tMs,
        ...motionPoseAt(animation, sceneDurationMs, tMs),
      })),
    };
  }
  return {
    mode: 'custom',
    windows: windows.map((window) => ({
      start: window.start,
      duration: window.duration,
      props: window.tracks.map((track) => track.prop),
      keyframeCount: window.tracks[0]?.keyframes.length ?? 0,
    })),
  };
}

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
  animation?: AnimationSummary;
  children?: LayerSummary[];
}

function summarizeLayer(
  layer: CalqoLayer,
  activeLocale: string,
  sceneDurationMs: number,
): LayerSummary {
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
  if (layer.type === 'image' || layer.type === 'svg')
    summary.assetId = layer.assetId;
  if (layer.animation)
    summary.animation = summarizeAnimation(layer.animation, sceneDurationMs);
  if (isGroupLayer(layer)) {
    summary.children = layer.children.map((child) =>
      summarizeLayer(child, activeLocale, sceneDurationMs),
    );
  }
  return summary;
}

function sceneDurationOf(artboard: CalqoArtboard): number {
  return artboard.timing?.duration ?? DEFAULT_SCENE_DURATION_MS;
}

function summarizeArtboard(artboard: CalqoArtboard, activeLocale: string) {
  const sceneDurationMs = sceneDurationOf(artboard);
  return {
    id: artboard.id,
    name: artboard.name,
    preset: artboard.preset,
    width: artboard.width,
    height: artboard.height,
    /** Scene length used by animation; the default applies when unset. */
    sceneDurationMs,
    background:
      artboard.background.type === 'solid'
        ? { type: 'solid' as const, color: artboard.background.color }
        : { type: artboard.background.type },
    layerCount: artboard.layers.length,
    layers: artboard.layers.map((layer) =>
      summarizeLayer(layer, activeLocale, sceneDurationMs),
    ),
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
    /** Clip frame rate and, when the project is a multi-scene clip, its
     * ordered scenes. Absent on a purely static project. */
    clip: project.clipSettings
      ? {
          fps: project.clipSettings.fps,
          ...(project.clipSettings.scenes
            ? { scenes: project.clipSettings.scenes }
            : {}),
        }
      : undefined,
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
  const project = activeProjectId
    ? projectStore.getState().projects[activeProjectId]
    : null;
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
            selectionStore.getState().activeArtboardId ??
            project.artboards[0]?.id ??
            null,
          selectedLayerIds: selectionStore.getState().selectedLayerIds,
          clipFps: project.clipSettings?.fps ?? null,
          sceneCount: project.clipSettings?.scenes?.length ?? 0,
          artboards: project.artboards.map((artboard) => ({
            id: artboard.id,
            name: artboard.name,
            preset: artboard.preset,
            width: artboard.width,
            height: artboard.height,
            sceneDurationMs: sceneDurationOf(artboard),
            layerCount: artboard.layers.length,
          })),
        }
      : null,
    next: {
      tool: 'calqo_apply_and_preview',
      why: 'Preferred fast path: validates, applies one undo step, and returns a PNG plus the new revision.',
      baseRevision: project ? projectRevision(project) : null,
    },
    hint: 'Tool schemas describe operations and layers. Call calqo_get_guide only for advanced fields or design advice.',
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
