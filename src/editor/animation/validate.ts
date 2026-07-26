import {
  layerAnimationSchema,
  type LayerAnimation,
  type PresetInstance,
} from '@/lib/schema';
import {
  PRESET_CATALOG,
  isPresetEnabled,
  presetSupportsLayerKind,
  presetSupportsSlot,
  resolvePreset,
  type PresetLayerKind,
  type PresetSlot,
} from './presets';

/** Structured reason a candidate animation was rejected by the command layer.
 * Localized at the UI boundary (§6.3 structured warnings). */
export type AnimationValidationCode =
  | 'invalid'
  | 'preset-disabled'
  | 'unsupported-slot'
  | 'unsupported-layer-kind'
  | 'window-exceeds-scene'
  | 'slot-window-overlap';

export type AnimationValidation =
  | { ok: true; animation: LayerAnimation }
  | { ok: false; code: AnimationValidationCode; slot?: PresetSlot };

/** A default preset instance for a kind, filled from catalog metadata. */
export function defaultPresetInstance(
  kind: PresetInstance['kind'],
): PresetInstance {
  const { defaults } = PRESET_CATALOG[kind];
  const instance: PresetInstance = {
    kind,
    duration: defaults.duration,
    delay: defaults.delay,
    easing: defaults.easing,
  };
  if (defaults.direction) instance.direction = defaults.direction;
  if (defaults.distance !== undefined) instance.distance = defaults.distance;
  return instance;
}

/** The scene-relative [start, end] window a preset slot would occupy. */
function slotWindow(
  slot: PresetSlot,
  instance: PresetInstance,
  sceneDuration: number,
): { start: number; end: number } {
  const p = resolvePreset(instance);
  if (slot === 'exit') {
    const end = sceneDuration - p.delay;
    return { start: end - p.duration, end };
  }
  // enter (emphasis fills the hold and cannot exceed the scene by construction).
  return { start: p.delay, end: p.delay + p.duration };
}

/**
 * Validate a candidate preset-authored `LayerAnimation` for a layer, in one
 * place shared by the command layer and tests. Runs the same strict Zod gate as
 * import (§4.4), then the semantic checks the schema cannot express alone:
 * preset enabled, slot/layer-kind compatibility, window fits the scene, and no
 * enter/exit overlap.
 */
export function validatePresetAnimation(
  animation: LayerAnimation,
  layerKind: PresetLayerKind,
  sceneDuration: number,
): AnimationValidation {
  const parsed = layerAnimationSchema.safeParse(animation);
  if (!parsed.success) return { ok: false, code: 'invalid' };
  const anim = parsed.data;
  if (anim.mode !== 'preset') return { ok: true, animation: anim };

  const slots: PresetSlot[] = ['enter', 'emphasis', 'exit'];
  for (const slot of slots) {
    const instance = anim[slot];
    if (!instance) continue;
    if (!isPresetEnabled(instance.kind)) {
      return { ok: false, code: 'preset-disabled', slot };
    }
    if (!presetSupportsSlot(instance.kind, slot)) {
      return { ok: false, code: 'unsupported-slot', slot };
    }
    if (!presetSupportsLayerKind(instance.kind, layerKind)) {
      return { ok: false, code: 'unsupported-layer-kind', slot };
    }
    const w = slotWindow(slot, instance, sceneDuration);
    if (w.start < 0 || w.end > sceneDuration) {
      return { ok: false, code: 'window-exceeds-scene', slot };
    }
  }

  // Enter/exit share props (opacity, translate…); overlapping in time is
  // forbidden by construction (§4.2).
  if (anim.enter && anim.exit) {
    const enterEnd = slotWindow('enter', anim.enter, sceneDuration).end;
    const exitStart = slotWindow('exit', anim.exit, sceneDuration).start;
    if (enterEnd > exitStart) {
      return { ok: false, code: 'slot-window-overlap' };
    }
  }

  return { ok: true, animation: anim };
}
