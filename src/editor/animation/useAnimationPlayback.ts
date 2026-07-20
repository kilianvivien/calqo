import { useEffect, useRef } from 'react';
import type Konva from 'konva';
import type { CalqoArtboard, CalqoLayer, CalqoProject } from '@/lib/schema';
import {
  useAnimationPlaybackStore,
  type PreviewPreset,
} from '@/lib/state/animationPlaybackStore';
import { compileClipCached } from './compiler';
import {
  createIdentityOverride,
  evaluateClipInto,
  evaluateFragmentsInto,
} from './evaluator';
import { applyWrapperOverride, resetWrapper, type LayerBox } from './wrapperNode';
import { buildFragmentContainer, type FragmentNodeHandles } from './fragmentNodes';
import { createCanvasMeasurer } from './textLayout';
import type { WrapperOverride } from './types';
import type { NodeRegistry } from '@/editor/canvas/LayerRenderer';

type WrapperRegistry = Map<string, Konva.Group>;

/** A live fragment overlay: the built nodes plus what it hid, so teardown can
 * restore the layer's base text node exactly. */
interface FragmentOverlay extends FragmentNodeHandles {
  baseNode: Konva.Node | undefined;
  baseWasVisible: boolean;
  overrides: WrapperOverride[];
}

/** Flatten a layer tree into an id→box map (artboard coords) for wrapper math. */
function collectBoxes(layers: CalqoLayer[], out: Map<string, LayerBox>): void {
  for (const layer of layers) {
    out.set(layer.id, { x: layer.x, y: layer.y, w: layer.w, h: layer.h });
    if (layer.type === 'group') collectBoxes(layer.children, out);
  }
}

/** Merge a transient hover preview into an artboard clone so it compiles on top
 * of the committed animation without touching the document or history (§6.5). */
function artboardWithPreview(
  artboard: CalqoArtboard,
  preview: PreviewPreset | null,
): CalqoArtboard {
  if (!preview) return artboard;
  const clone = structuredClone(artboard);
  const apply = (layers: CalqoLayer[]): boolean => {
    for (const layer of layers) {
      if (layer.id === preview.layerId) {
        const base =
          layer.animation?.mode === 'preset'
            ? { ...layer.animation }
            : { mode: 'preset' as const };
        base[preview.slot] = preview.instance;
        layer.animation = base;
        return true;
      }
      if (layer.type === 'group' && apply(layer.children)) return true;
    }
    return false;
  };
  apply(clone.layers);
  return clone;
}

interface UseAnimationPlaybackArgs {
  project: CalqoProject;
  artboard: CalqoArtboard;
  /** Only drives wrappers when true (Animate mode on the desktop shell). */
  enabled: boolean;
  nodeRefs: React.MutableRefObject<NodeRegistry>;
  wrapperRefs: React.MutableRefObject<WrapperRegistry>;
  stageRef: React.RefObject<Konva.Stage | null>;
}

/**
 * Drives the live Konva wrapper nodes from the pure evaluator
 * (docs/calqo-animation-extension-plan.md §6.2). Writes overrides **only to
 * wrapper groups** — never to base nodes — so React re-renders and playback
 * never fight over the same attributes. When disabled (Design mode) every
 * wrapper is reset to identity, so static editing is untouched.
 *
 * Runs its own RAF loop while playing; it does not push a store update every
 * frame — only a throttled `reportTime` so the transport can render without a
 * 60 fps React storm.
 */
export function useAnimationPlayback({
  project,
  artboard,
  enabled,
  nodeRefs,
  wrapperRefs,
  stageRef,
}: UseAnimationPlaybackArgs): void {
  const status = useAnimationPlaybackStore((s) => s.status);
  const seekTime = useAnimationPlaybackStore((s) => s.timeMs);
  const preview = useAnimationPlaybackStore((s) => s.preview);
  const bind = useAnimationPlaybackStore((s) => s.bind);
  const stopAndReset = useAnimationPlaybackStore((s) => s.stopAndReset);
  const reportTime = useAnimationPlaybackStore((s) => s.reportTime);

  // Reusable per-layer override objects (no per-frame allocation in the hot path).
  const overridesRef = useRef<Map<string, WrapperOverride>>(new Map());
  const rafRef = useRef<number | null>(null);
  const touchedRef = useRef<Set<string>>(new Set());
  // Live text-reveal overlays, keyed by layer id (AN-3.5). Built imperatively
  // inside the layer's wrapper during playback and torn down on reset.
  const overlaysRef = useRef<Map<string, FragmentOverlay>>(new Map());

  const locale = project.activeContentLocale;
  const fps = project.clipSettings?.fps ?? 30;
  const sceneDuration = artboard.timing?.duration ?? 5000;

  // Bind the transport to this artboard; a context switch stops & rewinds.
  useEffect(() => {
    if (enabled) bind(project.id, artboard.id, sceneDuration);
  }, [enabled, project.id, artboard.id, sceneDuration, bind]);

  // Any context switch (tab/artboard/locale) or leaving Animate mode stops
  // playback and clears wrappers so handlers read base geometry (§6.2).
  useEffect(() => {
    if (!enabled) stopAndReset();
    return () => stopAndReset();
  }, [enabled, project.id, artboard.id, locale, stopAndReset]);

  useEffect(() => {
    const stage = stageRef.current;

    /** Remove every fragment overlay and restore the base text nodes. */
    const teardownOverlays = () => {
      for (const overlay of overlaysRef.current.values()) {
        overlay.container.remove();
        overlay.container.destroy();
        overlay.baseNode?.visible(overlay.baseWasVisible);
      }
      overlaysRef.current.clear();
    };

    const resetAll = () => {
      for (const id of touchedRef.current) {
        const node = wrapperRefs.current.get(id);
        if (node) resetWrapper(node);
      }
      touchedRef.current.clear();
      teardownOverlays();
      stage?.batchDraw();
    };

    if (!enabled) {
      resetAll();
      return;
    }

    const boxes = new Map<string, LayerBox>();
    collectBoxes(artboard.layers, boxes);
    const compiled = compileClipCached({
      projectId: project.id,
      artboard: artboardWithPreview(artboard, preview),
      locale,
      fps,
      measurerFor: (font) => createCanvasMeasurer(font),
    }).clip;

    // Build text-reveal overlays for this compile: one fragment container per
    // reveal layer, added inside the layer's wrapper with its base node hidden.
    teardownOverlays();
    for (const fragmentAnim of compiled.fragments ?? []) {
      const wrapper = wrapperRefs.current.get(fragmentAnim.layerId);
      const layer = artboard.layers.find((l) => l.id === fragmentAnim.layerId);
      if (!wrapper || !layer) continue;
      const handles = buildFragmentContainer(layer, fragmentAnim);
      if (!handles) continue;
      handles.container.setAttrs({ x: layer.x, y: layer.y, rotation: layer.rotation, opacity: layer.opacity });
      const baseNode = nodeRefs.current.get(fragmentAnim.layerId);
      const baseWasVisible = baseNode?.visible() ?? true;
      baseNode?.visible(false);
      wrapper.add(handles.container);
      overlaysRef.current.set(fragmentAnim.layerId, {
        ...handles,
        baseNode,
        baseWasVisible,
        overrides: handles.wrappers.map(() => createIdentityOverride()),
      });
    }

    const draw = (tMs: number) => {
      const overrides = evaluateClipInto(compiled, tMs, overridesRef.current);
      const nextTouched = new Set<string>();
      for (const layerAnim of compiled.layers) {
        const node = wrapperRefs.current.get(layerAnim.layerId);
        const box = boxes.get(layerAnim.layerId);
        const override = overrides.get(layerAnim.layerId);
        if (!node || !box || !override) continue;
        applyWrapperOverride(node, override, box);
        nextTouched.add(layerAnim.layerId);
      }
      // Reset wrappers that were animated last frame but not this one.
      for (const id of touchedRef.current) {
        if (!nextTouched.has(id)) {
          const node = wrapperRefs.current.get(id);
          if (node) resetWrapper(node);
        }
      }
      touchedRef.current = nextTouched;
      // Drive text-reveal fragments.
      for (const [layerId, overlay] of overlaysRef.current) {
        const fragmentAnim = compiled.fragments?.find((f) => f.layerId === layerId);
        if (!fragmentAnim) continue;
        evaluateFragmentsInto(fragmentAnim, tMs, overlay.overrides);
        for (let i = 0; i < overlay.wrappers.length; i++) {
          const o = overlay.overrides[i];
          if (o) applyWrapperOverride(overlay.wrappers[i], o, overlay.boxes[i]);
        }
      }
      stage?.batchDraw();
    };

    if (status !== 'playing') {
      // Paused / idle / preview: draw once at the current playhead.
      draw(preview ? Math.min(seekTime, sceneDuration) : seekTime);
      return teardownOverlays;
    }

    // Playing: run a RAF loop from an origin anchored to the current playhead.
    const originPerf = performance.now();
    const originMs = seekTime >= sceneDuration ? 0 : seekTime;
    let lastReport = 0;
    const tick = () => {
      const elapsed = performance.now() - originPerf;
      // Loop continuously for live preview (exports never loop — §4.5).
      const tMs = sceneDuration > 0 ? (originMs + elapsed) % sceneDuration : 0;
      draw(tMs);
      // Throttle the store update (~20 Hz) so the transport re-renders cheaply.
      if (elapsed - lastReport > 50) {
        lastReport = elapsed;
        reportTime(tMs);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      teardownOverlays();
    };
    // A seek re-runs this effect and re-anchors the RAF origin to the new
    // playhead; the loop reads `seekTime` once as that origin.
  }, [
    enabled,
    status,
    seekTime,
    preview,
    project.id,
    artboard,
    locale,
    fps,
    sceneDuration,
    nodeRefs,
    wrapperRefs,
    stageRef,
    reportTime,
  ]);
}

export { createIdentityOverride };
