import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useActiveArtboard, useActiveProject } from '@/lib/state/selectors';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { useUiStore } from '@/lib/state/uiStore';
import { useAnimationPlaybackStore } from '@/lib/state/animationPlaybackStore';
import { findLayerInArtboard } from '@/editor/utils/layers';
import {
  beginHistoryCoalescing,
  clearArtboardAnimation,
  clearLayerAnimation,
  endHistoryCoalescing,
  setClipFps,
  setLayerPreset,
  setSceneDuration,
  updateLayerPresetParams,
} from '@/editor/commands/projectCommands';
import {
  EMPHASIS_PRESET_KINDS,
  ENTER_EXIT_PRESET_KINDS,
  MAX_SCENE_DURATION_MS,
  MIN_SCENE_DURATION_MS,
  type ClipSettings,
  type Easing,
  type LayerAnimation,
  type PresetInstance,
  type PresetKind,
} from '@/lib/schema';
import {
  PRESET_CATALOG,
  type PresetDirection,
  type PresetSlot,
} from '@/editor/animation/presets';
import { defaultPresetInstance } from '@/editor/animation/validate';
import { ScenesPanel } from './ScenesPanel';

const SLOTS: PresetSlot[] = ['enter', 'emphasis', 'exit'];
const EASINGS: Easing[] = [
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'overshoot',
  'bounce',
];
const DIRECTIONS: PresetDirection[] = ['up', 'down', 'left', 'right'];
const FPS_OPTIONS: ClipSettings['fps'][] = [24, 30, 60];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

/** The Animate-mode inspector: scene timing + per-slot preset authoring for the
 * selected layer. Preset knowledge is read from `PRESET_CATALOG`, never
 * duplicated here (§6.1). Hover previews are transient and never enter history. */
export function AnimationInspector() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const artboard = useActiveArtboard();
  const selectedIds = useSelectionStore((s) => s.selectedLayerIds);
  const setToast = useUiStore((s) => s.setToast);
  const setPreview = useAnimationPlaybackStore((s) => s.setPreview);
  const play = useAnimationPlaybackStore((s) => s.play);
  const stopAndReset = useAnimationPlaybackStore((s) => s.stopAndReset);

  const layer = useMemo(() => {
    const id = selectedIds[0];
    return id && selectedIds.length === 1
      ? findLayerInArtboard(artboard ?? undefined, id)
      : null;
  }, [artboard, selectedIds]);

  const animation: Extract<LayerAnimation, { mode: 'preset' }> | null =
    layer?.animation?.mode === 'preset' ? layer.animation : null;

  const commit = useCallback(
    (slot: PresetSlot, instance: PresetInstance | null) => {
      if (!project || !layer) return;
      const result = setLayerPreset(project.id, layer.id, slot, instance);
      if (!result.ok) setToast(t(`animate.errors.${result.code}`));
    },
    [project, layer, setToast, t],
  );

  const previewSlot = useCallback(
    (slot: PresetSlot, kind: PresetKind) => {
      if (!layer) return;
      const instance = defaultPresetInstance(kind);
      setPreview({ layerId: layer.id, slot, instance });
      if (!prefersReducedMotion()) play();
    },
    [layer, setPreview, play],
  );

  const endPreview = useCallback(() => {
    setPreview(null);
    stopAndReset();
  }, [setPreview, stopAndReset]);

  if (!project || !artboard) {
    return <p className="p-1 text-[12px] text-[var(--calqo-text-3)]">{t('animate.errors.no-artboard')}</p>;
  }

  const sceneDuration = artboard.timing?.duration ?? 5000;
  const fps = project.clipSettings?.fps ?? 30;

  return (
    <div className="flex flex-col gap-4">
      {/* Multi-scene clip sequencing (AN-4.2) ------------------------------- */}
      <ScenesPanel />

      {/* Scene timing + fps ------------------------------------------------- */}
      <section className="flex flex-col gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--calqo-text-3)]">
          {t('animate.inspector.sceneTitle')}
        </h3>
        <label className="flex items-center justify-between gap-2 text-[12px] text-[var(--calqo-text-2)]">
          <span>{t('animate.inspector.sceneDuration')}</span>
          <span className="tabular-nums text-[var(--calqo-text)]">
            {t('animate.inspector.seconds', { value: (sceneDuration / 1000).toFixed(1) })}
          </span>
        </label>
        <input
          type="range"
          aria-label={t('animate.inspector.sceneDuration')}
          min={MIN_SCENE_DURATION_MS}
          max={MAX_SCENE_DURATION_MS}
          step={250}
          value={sceneDuration}
          onPointerDown={() => beginHistoryCoalescing()}
          onPointerUp={() => endHistoryCoalescing()}
          onChange={(e) => setSceneDuration(project.id, Number(e.target.value))}
          className="w-full accent-[var(--calqo-accent)]"
        />
        <label className="flex items-center justify-between gap-2 text-[12px] text-[var(--calqo-text-2)]">
          <span>{t('animate.inspector.fps')}</span>
          <select
            aria-label={t('animate.inspector.fps')}
            value={fps}
            onChange={(e) =>
              setClipFps(project.id, Number(e.target.value) as ClipSettings['fps'])
            }
            className="rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 py-1 text-[12px] text-[var(--calqo-text)]"
          >
            {FPS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </section>

      {/* Per-layer slots --------------------------------------------------- */}
      {!layer ? (
        <p className="text-[12px] text-[var(--calqo-text-3)]">
          {t('animate.inspector.empty')}
        </p>
      ) : (
        <>
          {SLOTS.map((slot) => (
            <SlotSection
              key={slot}
              slot={slot}
              current={animation?.[slot] ?? null}
              onSelectKind={(kind) =>
                commit(slot, kind ? defaultPresetInstance(kind) : null)
              }
              onParamChange={(patch) => {
                // Coalescing boundaries are owned by the slider's pointer down/up;
                // discrete selects (direction/easing) are single undoable edits.
                updateLayerPresetParams(project.id, layer.id, slot, patch);
              }}
              onHover={(kind) => previewSlot(slot, kind)}
              onHoverEnd={endPreview}
            />
          ))}
          {animation && (
            <button
              type="button"
              onClick={() => clearLayerAnimation(project.id, layer.id)}
              className="mt-1 inline-flex items-center gap-1.5 self-start rounded-[var(--calqo-radius-sm)] px-2 py-1 text-[12px] text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]"
            >
              <Trash2 size={13} />
              {t('animate.inspector.clearLayer')}
            </button>
          )}
        </>
      )}

      <button
        type="button"
        onClick={() => clearArtboardAnimation(project.id)}
        className="inline-flex items-center gap-1.5 self-start rounded-[var(--calqo-radius-sm)] px-2 py-1 text-[11.5px] text-[var(--calqo-text-3)] hover:text-[var(--calqo-text-2)]"
      >
        {t('animate.inspector.clearArtboard')}
      </button>
    </div>
  );
}

interface SlotSectionProps {
  slot: PresetSlot;
  current: PresetInstance | null;
  onSelectKind: (kind: PresetKind | null) => void;
  onParamChange: (patch: Partial<PresetInstance>, coalesce: boolean) => void;
  onHover: (kind: PresetKind) => void;
  onHoverEnd: () => void;
}

function SlotSection({
  slot,
  current,
  onSelectKind,
  onParamChange,
  onHover,
  onHoverEnd,
}: SlotSectionProps) {
  const { t } = useTranslation('editor');
  const kinds: readonly PresetKind[] =
    slot === 'emphasis' ? EMPHASIS_PRESET_KINDS : ENTER_EXIT_PRESET_KINDS;
  const meta = current ? PRESET_CATALOG[current.kind] : null;

  return (
    <section
      className="flex flex-col gap-2 rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] p-2.5"
      aria-label={t(`animate.slots.${slot}`)}
    >
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--calqo-text-3)]">
        {t(`animate.slots.${slot}`)}
      </h3>
      <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label={t(`animate.slots.${slot}`)}>
        <PresetCard
          label={t('animate.slots.none')}
          active={!current}
          onClick={() => onSelectKind(null)}
        />
        {kinds.map((kind) => (
          <PresetCard
            key={kind}
            label={t(`animate.presets.${kind}`)}
            active={current?.kind === kind}
            onClick={() => onSelectKind(kind)}
            onMouseEnter={() => onHover(kind)}
            onFocus={() => onHover(kind)}
            onMouseLeave={onHoverEnd}
            onBlur={onHoverEnd}
          />
        ))}
      </div>

      {current && meta && (
        <div className="flex flex-col gap-2 pt-1">
          {meta.directional && (
            <ParamRow label={t('animate.params.direction')}>
              <select
                aria-label={t('animate.params.direction')}
                value={current.direction ?? 'up'}
                onChange={(e) =>
                  onParamChange({ direction: e.target.value as PresetDirection }, false)
                }
                className="rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 py-1 text-[12px] text-[var(--calqo-text)]"
              >
                {DIRECTIONS.map((dir) => (
                  <option key={dir} value={dir}>
                    {t(`animate.directions.${dir}`)}
                  </option>
                ))}
              </select>
            </ParamRow>
          )}
          {meta.usesDistance && (
            <SliderRow
              label={t('animate.params.distance')}
              value={current.distance ?? meta.defaults.distance ?? 0}
              min={0}
              max={500}
              step={4}
              display={t('animate.params.px', { value: Math.round(current.distance ?? 0) })}
              onChange={(value, coalesce) => onParamChange({ distance: value }, coalesce)}
            />
          )}
          <SliderRow
            label={t('animate.params.duration')}
            value={current.duration}
            min={100}
            max={4000}
            step={50}
            display={t('animate.params.ms', { value: Math.round(current.duration) })}
            onChange={(value, coalesce) => onParamChange({ duration: value }, coalesce)}
          />
          <SliderRow
            label={t('animate.params.delay')}
            value={current.delay}
            min={0}
            max={4000}
            step={50}
            display={t('animate.params.ms', { value: Math.round(current.delay) })}
            onChange={(value, coalesce) => onParamChange({ delay: value }, coalesce)}
          />
          <ParamRow label={t('animate.params.easing')}>
            <select
              aria-label={t('animate.params.easing')}
              value={current.easing ?? meta.defaults.easing}
              onChange={(e) => onParamChange({ easing: e.target.value as Easing }, false)}
              className="rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 py-1 text-[12px] text-[var(--calqo-text)]"
            >
              {EASINGS.map((easing) => (
                <option key={easing} value={easing}>
                  {t(`animate.easings.${easing}`)}
                </option>
              ))}
            </select>
          </ParamRow>
        </div>
      )}
    </section>
  );
}

function PresetCard({
  label,
  active,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      className={cn(
        'rounded-[var(--calqo-radius-sm)] border px-2 py-1.5 text-[11.5px] font-medium transition-colors',
        active
          ? 'border-[var(--calqo-accent)] bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]'
          : 'border-[var(--calqo-divider)] text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]',
      )}
    >
      {label}
    </button>
  );
}

function ParamRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-[12px] text-[var(--calqo-text-2)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number, coalesce: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[12px] text-[var(--calqo-text-2)]">
        <span>{label}</span>
        <span className="tabular-nums text-[var(--calqo-text)]">{display}</span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={() => beginHistoryCoalescing()}
        onPointerUp={() => endHistoryCoalescing()}
        onChange={(e) => onChange(Number(e.target.value), true)}
        className="w-full accent-[var(--calqo-accent)]"
      />
    </div>
  );
}
