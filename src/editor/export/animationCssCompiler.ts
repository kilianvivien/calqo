import type { CompiledClip } from '@/editor/animation/types';
import { evaluateClipInto } from '@/editor/animation/evaluator';
import type { WrapperOverride } from '@/editor/animation/types';
import { wipeClipRect, type LayerBox } from '@/editor/animation/wrapperNode';
import { frameCountFor } from './animatedFrameExport';
import { round } from './styleConversions';

/**
 * CSS animation compiler (plan §6.3 / AN-3.1). Converts the runtime keyframe IR
 * (the same {@link CompiledClip} the evaluator uses for MP4/GIF) into scoped
 * `@keyframes` rules for the editable HTML export. The evaluator remains the
 * single source of truth: this compiler *samples the evaluator on the clip's own
 * fps frame grid*, so an animated HTML file is frame-identical to the MP4 at
 * every sampled timestamp (§6.2 "the CSS compiled for the HTML export is a second
 * implementation of the same IR … conformance tests sample both at identical
 * timestamps"). Composition (§4.2): the wrapper element carries the animation
 * transform around the layer centre; the inner element keeps document geometry.
 *
 * Reveal props map to CSS: `wipe-progress` → `clip-path`, `blur` → `filter`.
 * Both are always expressible, so the CSS path itself never downgrades; the only
 * animated-HTML downgrade is a rasterized group swallowing child animation, which
 * the HTML exporter (not this compiler) reports.
 *
 * All animation is gated behind `@media (prefers-reduced-motion: no-preference)`.
 * Outside that query no animation applies and the wrapper renders at identity, so
 * reduced-motion viewers see the finished design with no flash of hidden content
 * (plan §9 / AN-3.1).
 */

export interface AnimationCssInput {
  clip: CompiledClip;
  /** Layer box in its own containing-block coordinates (artboard-local for
   * top-level layers, group-local for children — the HTML export nests children
   * inside the group element, so stored x/y/w/h are exactly right). */
  boxes: Map<string, LayerBox>;
  sceneDurationMs: number;
  /** Stable, collision-resistant scope for keyframe/class names across the whole
   * exported document (derived from project/artboard/locale). */
  scopeId: string;
}

export interface AnimationCssBinding {
  /** Class applied to the wrapper element (also the keyframes name). */
  wrapperClass: string;
}

export interface AnimationCssResult {
  /** Ready-to-embed CSS: always-on wrapper origin rules plus a reduced-motion-
   * gated block of keyframes + animation assignments. Empty when nothing animates. */
  css: string;
  /** layerId → wrapper binding, for layers that actually animate. */
  bindings: Map<string, AnimationCssBinding>;
}

/** djb2 → base36, a short deterministic hash for collision-resistant names. */
function shortHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/** CSS-identifier-safe suffix from a layer id (ids are arbitrary strings). */
function sanitizeId(layerId: string): string {
  const cleaned = layerId.replace(/[^a-zA-Z0-9_-]/g, '-');
  // Keep it short but collision-resistant by appending a hash of the raw id.
  return `${cleaned.slice(0, 32)}-${shortHash(layerId)}`;
}

/** Round a unitless factor (scale/opacity) to a stable, compact precision. */
function factor(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Whether an override composes to the document-geometry identity. */
function isIdentity(o: WrapperOverride): boolean {
  return (
    o.dx === 0 &&
    o.dy === 0 &&
    o.scaleX === 1 &&
    o.scaleY === 1 &&
    o.rotation === 0 &&
    o.opacity === 1 &&
    o.wipeProgress === 1 &&
    o.blur === 0
  );
}

/** The declaration body (no braces) realizing one override over a layer box.
 * `transform-origin` is carried by the always-on wrapper rule, not repeated per
 * keyframe. Order matches the Konva wrapper: translate, then rotate, then scale,
 * all about the centre origin (§4.2 / wrapperNode.ts). */
function overrideDeclarations(override: WrapperOverride, box: LayerBox): string {
  const parts: string[] = [];

  const transforms: string[] = [];
  if (override.dx !== 0 || override.dy !== 0) {
    transforms.push(`translate(${round(override.dx)}px, ${round(override.dy)}px)`);
  }
  if (override.rotation !== 0) {
    transforms.push(`rotate(${round(override.rotation)}deg)`);
  }
  if (override.scaleX !== 1 || override.scaleY !== 1) {
    transforms.push(`scale(${factor(override.scaleX)}, ${factor(override.scaleY)})`);
  }
  parts.push(`transform:${transforms.length ? transforms.join(' ') : 'none'};`);

  parts.push(`opacity:${factor(override.opacity)};`);

  if (override.blur > 0) {
    parts.push(`filter:blur(${round(override.blur)}px);`);
  } else {
    parts.push('filter:none;');
  }

  const clip = wipeClipRect(box, override.wipeProgress, override.wipeDirection);
  if (clip) {
    const x1 = round(clip.x);
    const y1 = round(clip.y);
    const x2 = round(clip.x + clip.width);
    const y2 = round(clip.y + clip.height);
    parts.push(
      `clip-path:polygon(${x1}px ${y1}px, ${x2}px ${y1}px, ${x2}px ${y2}px, ${x1}px ${y2}px);`,
    );
  } else {
    parts.push('clip-path:none;');
  }

  return parts.join('');
}

/** Compile one layer's sampled frames into a `@keyframes` body. Consecutive
 * frames with identical declarations collapse into one stop, so a long hold (or
 * a static gap) costs a single keyframe rather than one per frame. Returns null
 * when the layer never leaves identity. */
function keyframesBody(
  clip: CompiledClip,
  layerId: string,
  box: LayerBox,
  sceneDurationMs: number,
): string | null {
  const frames = frameCountFor(sceneDurationMs, clip.fps);
  const overrides = new Map<string, WrapperOverride>();
  const samples: { pct: number; decls: string }[] = [];
  let sawNonIdentity = false;

  // Sample i = 0 … frames inclusive so the final sample lands exactly on the
  // settled scene-end state (100%), matching the MP4's last rendered frame.
  for (let i = 0; i <= frames; i++) {
    const tMs = Math.min((i / clip.fps) * 1000, sceneDurationMs);
    evaluateClipInto(clip, tMs, overrides);
    const override = overrides.get(layerId);
    if (!override) return null;
    if (!isIdentity(override)) sawNonIdentity = true;
    const decls = overrideDeclarations(override, box);
    // 6 decimal places of percent: enough that reconstructing the timestamp from
    // the percentage is lossless for conformance and steep-ramp fidelity.
    const pct = Math.round((tMs / sceneDurationMs) * 1e8) / 1e6;
    samples.push({ pct, decls });
  }

  if (!sawNonIdentity) return null;

  // Run-length collapse: keep the first and last sample of every constant run
  // (and every singleton). Linear interpolation between the endpoints of a flat
  // run reproduces a hold; the endpoints of a changing run reproduce the ramp.
  const stops: { pct: number; decls: string }[] = [];
  for (let k = 0; k < samples.length; k++) {
    const changedFromPrev = k === 0 || samples[k - 1].decls !== samples[k].decls;
    const changesToNext =
      k === samples.length - 1 || samples[k + 1].decls !== samples[k].decls;
    if (changedFromPrev || changesToNext) stops.push(samples[k]);
  }

  return stops.map((s) => `  ${s.pct}% { ${s.decls} }`).join('\n');
}

/** Compile a clip into scoped animated-HTML CSS. Pure and deterministic. */
export function compileAnimationCss(input: AnimationCssInput): AnimationCssResult {
  const { clip, boxes, sceneDurationMs, scopeId } = input;
  const bindings = new Map<string, AnimationCssBinding>();
  const baseRules: string[] = [];
  const keyframeBlocks: string[] = [];
  const animationRules: string[] = [];

  for (const layerAnim of clip.layers) {
    const box = boxes.get(layerAnim.layerId);
    if (!box) continue;
    const body = keyframesBody(clip, layerAnim.layerId, box, sceneDurationMs);
    if (!body) continue;

    const name = `calqo-a${scopeId}-${sanitizeId(layerAnim.layerId)}`;
    bindings.set(layerAnim.layerId, { wrapperClass: name });

    const cx = round(box.x + box.w / 2);
    const cy = round(box.y + box.h / 2);
    // Always-on: position + centre origin so identity (reduced-motion / no-JS)
    // renders exactly like the un-animated layer.
    baseRules.push(
      `.${name} { position:absolute; inset:0; pointer-events:none; transform-origin:${cx}px ${cy}px; }`,
    );
    keyframeBlocks.push(`@keyframes ${name} {\n${body}\n}`);
    animationRules.push(
      `  .${name} { animation:${name} ${round(sceneDurationMs)}ms linear both; will-change:transform, opacity; }`,
    );
  }

  if (bindings.size === 0) {
    return { css: '', bindings };
  }

  const css = [
    '/* Calqo animation (AN-3). Reduced-motion viewers see the settled design. */',
    baseRules.join('\n'),
    '@media (prefers-reduced-motion: no-preference) {',
    keyframeBlocks.join('\n'),
    animationRules.join('\n'),
    '}',
  ].join('\n');

  return { css, bindings };
}
