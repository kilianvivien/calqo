import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pipette } from 'lucide-react';
import { assetStorage } from '@/lib/adapters';
import {
  updateLayerInActiveArtboard,
  editProject,
  replaceLayerAsset,
} from '@/editor/commands/projectCommands';
import { findLayerInArtboard } from '@/editor/utils/layers';
import { ARTBOARD_PRESET_LIST } from '@/lib/schema/presets';
import { useActiveProject, useActiveArtboard } from '@/lib/state/selectors';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { useUiStore } from '@/lib/state/uiStore';
import type { CalqoLayer, Fill } from '@/lib/schema';
import { ColorPickerPopover } from './ColorPickerPopover';

const COLOR_SWATCHES = [
  '#007AFF',
  '#28C840',
  '#FF9500',
  '#FF3B30',
  '#AF52DE',
  '#111827',
  '#FFFFFF',
  '#000000',
];

function measureImage(file: File): Promise<{ width?: number; height?: number }> {
  if (file.type === 'image/svg+xml') return Promise.resolve({});
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({});
    };
    image.src = url;
  });
}

export function PropertiesPane() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const artboard = useActiveArtboard();
  const selectedIds = useSelectionStore((s) => s.selectedLayerIds);
  const activeTool = useUiStore((s) => s.activeTool);
  const snapEnabled = useUiStore((s) => s.snapEnabled);
  const setSnapEnabled = useUiStore((s) => s.setSnapEnabled);

  if (!project || !artboard) {
    return (
      <p className="text-[12px] text-[var(--calqo-text-3)]">
        {t('workspace.empty')}
      </p>
    );
  }

  const selected = selectedIds
    .map((id) => findLayerInArtboard(artboard, id))
    .filter((layer): layer is CalqoLayer => Boolean(layer));
  const layer = selected.length === 1 ? selected[0] : null;

  return (
    <div className="flex flex-col gap-4">
      <Section title={t('properties.tool')}>
        <Row label={t('properties.active')} value={activeTool} mono />
        <label className="flex items-center justify-between px-2 py-1.5 text-[12px]">
          <span className="text-[var(--calqo-text-3)]">{t('properties.snap')}</span>
          <input
            type="checkbox"
            checked={snapEnabled}
            onChange={(event) => setSnapEnabled(event.target.checked)}
          />
        </label>
      </Section>

      {!layer && selected.length > 1 && (
        <Section title={t('properties.selection')}>
          <Row label={t('properties.layers')} value={`${selected.length}`} mono />
        </Section>
      )}

      {layer ? (
        <LayerControls projectId={project.id} layer={layer} locale={project.activeContentLocale} />
      ) : selected.length === 0 ? (
        <Section title={t('properties.selection')}>
          <p className="px-2 py-1.5 text-[12px] text-[var(--calqo-text-3)]">
            {t('properties.noLayerSelected')}
          </p>
        </Section>
      ) : null}
    </div>
  );
}

export function DocumentControls() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const artboard = useActiveArtboard();

  if (!project || !artboard) {
    return (
      <p className="text-[12px] text-[var(--calqo-text-3)]">
        {t('workspace.empty')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ArtboardControls
        projectId={project.id}
        artboardId={artboard.id}
        artboard={artboard}
      />
    </div>
  );
}

function ArtboardControls({
  projectId,
  artboardId,
  artboard,
}: {
  projectId: string;
  artboardId: string;
  artboard: NonNullable<ReturnType<typeof useActiveArtboard>>;
}) {
  const { t } = useTranslation('editor');
  const background =
    artboard.background.type === 'solid' ? artboard.background.color : '#ffffff';
  const applyPreset = (presetId: string) => {
    const preset = ARTBOARD_PRESET_LIST.find((candidate) => candidate.id === presetId);
    if (!preset) return;
    editProject(
      projectId,
      (draft) => {
        const target = draft.artboards.find((candidate) => candidate.id === artboardId);
        if (!target) return;
        target.preset = preset.id;
        target.name = preset.name;
        target.width = preset.width;
        target.height = preset.height;
      },
      { undoable: true },
    );
  };

  return (
    <>
      <Section title={t('properties.artboard')}>
        <Row label={t('properties.name')} value={artboard.name} />
        <Row label={t('properties.size')} value={`${artboard.width} x ${artboard.height}`} mono />
        <PresetField
          label={t('properties.format')}
          activeId={artboard.preset}
          onChange={applyPreset}
        />
      </Section>
      <Section title={t('properties.background')}>
        <ColorField
          label={t('properties.color')}
          value={background}
          onChange={(color) =>
            editProject(
              projectId,
              (draft) => {
                const target = draft.artboards.find((candidate) => candidate.id === artboardId);
                if (target) target.background = { type: 'solid', color };
              },
              { undoable: true },
            )
          }
        />
      </Section>
    </>
  );
}

function LayerControls({
  projectId,
  layer,
  locale,
}: {
  projectId: string;
  layer: CalqoLayer;
  locale: string;
}) {
  const { t } = useTranslation('editor');
  const update = (patch: Parameters<typeof updateLayerInActiveArtboard>[2]) =>
    updateLayerInActiveArtboard(projectId, layer.id, patch);
  return (
    <>
      <Section title={layer.name}>
        <Row label={t('properties.type')} value={layer.type} mono />
        <NumberField label="X" value={layer.x} onChange={(x) => update({ x })} />
        <NumberField label="Y" value={layer.y} onChange={(y) => update({ y })} />
        <NumberField label="W" value={layer.w} min={1} onChange={(w) => update({ w })} />
        <NumberField label="H" value={layer.h} min={1} onChange={(h) => update({ h })} />
        <NumberField
          label={t('properties.rotate')}
          value={layer.rotation}
          onChange={(rotation) => update({ rotation })}
        />
        <NumberField
          label={t('properties.opacity')}
          value={Math.round(layer.opacity * 100)}
          min={0}
          max={100}
          onChange={(opacity) => update({ opacity: opacity / 100 })}
        />
      </Section>

      {layer.type === 'shape' && (
        <Section title={t('properties.shape')}>
          <ColorField
            label={t('properties.fill')}
            value={layer.fill.type === 'solid' ? layer.fill.color : '#ffffff'}
            onChange={(color) => update({ fill: { type: 'solid', color } satisfies Fill })}
          />
          <ColorField
            label={t('properties.stroke')}
            value={layer.stroke?.color ?? '#007AFF'}
            onChange={(color) =>
              update({ stroke: { color, width: layer.stroke?.width ?? 2 } })
            }
          />
          <NumberField
            label={t('properties.stroke')}
            value={layer.stroke?.width ?? 0}
            min={0}
            onChange={(width) =>
              update({ stroke: width > 0 ? { color: layer.stroke?.color ?? '#007AFF', width } : undefined })
            }
          />
        </Section>
      )}


      {layer.type === 'text' && (
        <Section title={t('properties.text')}>
          <textarea
            value={layer.text[locale] ?? ''}
            onChange={(event) => update({ text: { [locale]: event.target.value } })}
            className="min-h-20 w-full resize-y rounded-[var(--calqo-radius-xs)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 py-1.5 text-[12px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
          />
          <NumberField
            label={t('properties.size')}
            value={layer.style.fontSize}
            min={1}
            onChange={(fontSize) => update({ style: { fontSize } })}
          />
          <ColorField
            label={t('properties.color')}
            value={layer.style.color}
            onChange={(color) => update({ style: { color } })}
          />
        </Section>
      )}

      {layer.type === 'image' && (
        <Section title={t('properties.image')}>
          <label className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1.5 text-[12px]">
            <span className="text-[var(--calqo-text-3)]">{t('properties.fit')}</span>
            <select
              value={layer.fit}
              onChange={(event) =>
                update({ fit: event.target.value as 'cover' | 'contain' | 'stretch' })
              }
              className="rounded-[var(--calqo-radius-xs)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 py-1 text-[12px]"
            >
              <option value="cover">{t('properties.cover')}</option>
              <option value="contain">{t('properties.contain')}</option>
              <option value="stretch">{t('properties.stretch')}</option>
            </select>
          </label>
          <ReplaceAssetButton projectId={projectId} layer={layer} />
        </Section>
      )}

      {layer.type === 'svg' && (
        <Section title={t('properties.svg')}>
          <ReplaceAssetButton projectId={projectId} layer={layer} />
        </Section>
      )}
    </>
  );
}

function ReplaceAssetButton({
  projectId,
  layer,
}: {
  projectId: string;
  layer: Extract<CalqoLayer, { type: 'image' | 'svg' }>;
}) {
  const { t } = useTranslation('editor');
  const inputRef = useRef<HTMLInputElement>(null);
  const accept =
    layer.type === 'svg' ? 'image/svg+xml' : 'image/png,image/jpeg,image/webp';
  return (
    <div className="px-2 py-1.5">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          void measureImage(file).then(async (measured) => {
            const asset = await assetStorage.saveAsset(projectId, file, {
              kind: file.type === 'image/svg+xml' ? 'svg' : 'raster',
              name: file.name,
              mimeType: file.type,
              width: measured.width,
              height: measured.height,
            });
            replaceLayerAsset(projectId, layer.id, asset);
          });
          event.currentTarget.value = '';
        }}
      />
      <button
        type="button"
        className="w-full rounded-[var(--calqo-radius-xs)] border border-[var(--calqo-divider)] px-2 py-1.5 text-[12px] text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)]"
        onClick={() => inputRef.current?.click()}
      >
        {t('properties.replaceAsset')}
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2">
        <span className="eyebrow">{title}</span>
      </div>
      <div className="glass-thin rounded-[var(--calqo-radius-sm)] p-1">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1.5 text-[12px]">
      <span className="text-[var(--calqo-text-3)]">{label}</span>
      <span className={`truncate text-[var(--calqo-text-2)] ${mono ? 'mono text-[11px]' : ''}`}>
        {value}
      </span>
    </div>
  );
}

function PresetField({
  label,
  activeId,
  onChange,
}: {
  label: string;
  activeId: string;
  onChange: (presetId: string) => void;
}) {
  return (
    <div className="px-2 py-1.5">
      <div className="mb-2 text-[12px] text-[var(--calqo-text-3)]">{label}</div>
      <div className="grid grid-cols-2 gap-1.5">
        {ARTBOARD_PRESET_LIST.map((preset) => {
          const active = preset.id === activeId;
          const ratio = preset.width / preset.height;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={active}
              aria-label={`${preset.name} ${preset.width} x ${preset.height}`}
              onClick={() => onChange(preset.id)}
              className={[
                'min-w-0 rounded-[10px] border p-2 text-left transition-[border-color,background,box-shadow,transform] duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-out)] hover:-translate-y-0.5',
                active
                  ? 'border-[var(--calqo-accent)] bg-[var(--calqo-accent-soft)] shadow-[0_0_0_2px_var(--calqo-accent-ring)]'
                  : 'border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] hover:bg-[var(--calqo-hover)]',
              ].join(' ')}
            >
              <span className="mb-2 flex h-12 items-center justify-center">
                <span
                  className="block rounded-[4px] border border-current bg-white/80 text-[var(--calqo-accent)] shadow-[0_5px_18px_rgba(0,0,0,0.16)]"
                  style={
                    ratio >= 1
                      ? { width: '34px', height: `${Math.max(16, 34 / ratio)}px` }
                      : { height: '38px', width: `${Math.max(16, 38 * ratio)}px` }
                  }
                />
              </span>
              <span className="block truncate text-[11.5px] font-semibold text-[var(--calqo-text)]">
                {preset.name}
              </span>
              <span className="mono mt-0.5 block truncate text-[10px] text-[var(--calqo-text-3)]">
                {preset.width} x {preset.height}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1.5 text-[12px]">
      <span className="text-[var(--calqo-text-3)]">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
        className="w-full rounded-[var(--calqo-radius-xs)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 py-1 text-[12px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation('editor');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pipetteStatus, setPipetteStatus] = useState<string | null>(null);
  const pickerRef = useRef<HTMLButtonElement>(null);
  const normalized = value.toUpperCase();
  const swatches = COLOR_SWATCHES.includes(normalized)
    ? COLOR_SWATCHES
    : [normalized, ...COLOR_SWATCHES].slice(0, 8);
  const pickWithEyedropper = async () => {
    if (!window.EyeDropper) {
      setPipetteStatus(t('color.pickUnavailable'));
      return;
    }
    setPipetteStatus(t('color.pickWaiting'));
    try {
      const result = await new window.EyeDropper().open();
      onChange(result.sRGBHex.toUpperCase());
      setPipetteStatus(t('color.picked'));
      window.setTimeout(() => setPipetteStatus(null), 1400);
    } catch {
      setPipetteStatus(t('color.pickCancelled'));
    }
  };

  return (
    <div className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-2 px-2 py-1.5 text-[12px]">
      <span className="text-[var(--calqo-text-3)]">{label}</span>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {swatches.map((color) => {
            const active = color.toLowerCase() === normalized.toLowerCase();
            return (
              <button
                key={color}
                type="button"
                aria-label={`${label} ${color}`}
                onClick={() => onChange(color)}
                className={[
                  'h-7 w-7 shrink-0 rounded-[8px] border transition-transform duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-spring)] hover:scale-[1.1]',
                  active
                    ? 'border-[var(--calqo-accent)] ring-2 ring-[var(--calqo-accent-ring)]'
                    : 'border-black/10',
                ].join(' ')}
                style={{ background: color }}
              />
            );
          })}
          <button
            ref={pickerRef}
            type="button"
            aria-label={`${label} ${t('color.custom')}`}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            onClick={() => setPickerOpen((open) => !open)}
            className="h-7 w-7 shrink-0 rounded-[8px] border border-[var(--calqo-divider)] shadow-[0_0_0_2px_var(--calqo-glass-thin)_inset] transition-transform duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-spring)] hover:scale-[1.1]"
            style={{
              background:
                'conic-gradient(from 90deg, #ff3b30, #ffcc00, #34c759, #32ade6, #5856d6, #ff2d55, #ff3b30)',
            }}
          />
          <button
            type="button"
            aria-label={`${label} ${t('color.pickFromScreen')}`}
            onClick={pickWithEyedropper}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] text-[var(--calqo-text-2)] transition-colors hover:text-[var(--calqo-text)]"
          >
            <Pipette size={13} />
          </button>
        </div>
        {pipetteStatus && (
          <p className="mt-1 text-[10.5px] text-[var(--calqo-text-3)]">
            {pipetteStatus}
          </p>
        )}
        <ColorPickerPopover
          open={pickerOpen}
          anchorRef={pickerRef}
          value={value}
          onChange={onChange}
          onClose={() => setPickerOpen(false)}
        />
      </div>
    </div>
  );
}
