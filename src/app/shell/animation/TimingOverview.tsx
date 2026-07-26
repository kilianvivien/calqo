import { useTranslation } from 'react-i18next';
import type { CalqoArtboard, CalqoLayer, LayerAnimation } from '@/lib/schema';
import { resolvePreset, type PresetSlot } from '@/editor/animation/presets';

/** Read-only per-layer timing bars (§6.1). v1 bars are display-only — the
 * numbers are edited in the inspector, not by dragging here. */

interface Bar {
  slot: PresetSlot;
  /** 0–1 fractions of the scene. */
  start: number;
  end: number;
}

const SLOT_COLOR: Record<PresetSlot, string> = {
  enter: 'var(--calqo-accent)',
  emphasis: 'var(--calqo-text-3)',
  exit: 'var(--calqo-accent)',
};

/** Preset slot windows as scene fractions, mirroring the compiler's anchoring
 * (enter at scene start, exit at scene end, emphasis fills the hold). */
function layerBars(
  animation: Extract<LayerAnimation, { mode: 'preset' }>,
  sceneDuration: number,
): Bar[] {
  const bars: Bar[] = [];
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  let enterEnd = 0;
  let exitStart = sceneDuration;
  if (animation.enter) {
    const p = resolvePreset(animation.enter);
    enterEnd = Math.min(p.delay + p.duration, sceneDuration);
    bars.push({ slot: 'enter', start: clamp01(p.delay / sceneDuration), end: clamp01(enterEnd / sceneDuration) });
  }
  if (animation.exit) {
    const p = resolvePreset(animation.exit);
    const end = sceneDuration - p.delay;
    exitStart = Math.max(end - p.duration, 0);
    bars.push({ slot: 'exit', start: clamp01(exitStart / sceneDuration), end: clamp01(end / sceneDuration) });
  }
  if (animation.emphasis) {
    const p = resolvePreset(animation.emphasis);
    const start = Math.min(enterEnd + p.delay, sceneDuration);
    if (start < exitStart) {
      bars.push({ slot: 'emphasis', start: clamp01(start / sceneDuration), end: clamp01(exitStart / sceneDuration) });
    }
  }
  return bars;
}

function animatedLayers(layers: CalqoLayer[]): CalqoLayer[] {
  const out: CalqoLayer[] = [];
  const walk = (list: CalqoLayer[]) => {
    for (const layer of list) {
      if (layer.animation?.mode === 'preset') out.push(layer);
      if (layer.type === 'group') walk(layer.children);
    }
  };
  walk(layers);
  return out;
}

export function TimingOverview({ artboard }: { artboard: CalqoArtboard }) {
  const { t } = useTranslation('editor');
  const sceneDuration = artboard.timing?.duration ?? 5000;
  const rows = animatedLayers(artboard.layers);
  if (rows.length === 0) return null;

  return (
    <div
      className="flex max-h-[76px] flex-col gap-1 overflow-y-auto calqo-scroll"
      aria-label={t('animate.transport.timingTitle')}
    >
      {rows.map((layer) => {
        const anim = layer.animation as Extract<LayerAnimation, { mode: 'preset' }>;
        const bars = layerBars(anim, sceneDuration);
        return (
          <div key={layer.id} className="flex items-center gap-2">
            <span className="w-20 shrink-0 truncate text-[10.5px] text-[var(--calqo-text-3)]">
              {layer.name}
            </span>
            <div className="relative h-2 flex-1 rounded-full bg-[var(--calqo-hover)]">
              {bars.map((bar, i) => (
                <div
                  key={`${bar.slot}-${i}`}
                  className="absolute top-0 h-2 rounded-full opacity-80"
                  style={{
                    left: `${bar.start * 100}%`,
                    width: `${Math.max(0, bar.end - bar.start) * 100}%`,
                    background: SLOT_COLOR[bar.slot],
                  }}
                  title={t(`animate.slots.${bar.slot}`)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
