import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import {
  setArtboardBackgroundColor,
  updateLayerInActiveArtboard,
} from '@/editor/commands/projectCommands';
import type { CalqoArtboard, CalqoLayer, CalqoProject } from '@/lib/schema';
import { BottomSheet } from '@/components/mobile';
import { cn } from '@/lib/utils/cn';

interface ColorSheetProps {
  open: boolean;
  onClose: () => void;
  project: CalqoProject;
  artboard: CalqoArtboard;
  layer: CalqoLayer | null;
}

/** Layers whose colour the phone UI can recolour with a single flat colour. */
function isRecolorable(layer: CalqoLayer | null): boolean {
  return (
    layer?.type === 'text' ||
    layer?.type === 'list' ||
    layer?.type === 'shape' ||
    layer?.type === 'svg'
  );
}

function currentLayerColor(layer: CalqoLayer): string | undefined {
  if (layer.type === 'text' || layer.type === 'list') return layer.style.color;
  if (layer.type === 'shape') {
    return layer.fill.type === 'solid' ? layer.fill.color : undefined;
  }
  if (layer.type === 'svg') return layer.color;
  return undefined;
}

function recolorLayer(projectId: string, layer: CalqoLayer, color: string): void {
  if (layer.type === 'text' || layer.type === 'list') {
    updateLayerInActiveArtboard(projectId, layer.id, { style: { color } });
  } else if (layer.type === 'shape') {
    updateLayerInActiveArtboard(projectId, layer.id, {
      fill: { type: 'solid', color },
    });
  } else if (layer.type === 'svg') {
    updateLayerInActiveArtboard(projectId, layer.id, { color });
  }
}

function Swatch({
  color,
  active,
  onClick,
}: {
  color: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={color}
      className={cn(
        'relative h-11 w-11 shrink-0 rounded-full border transition-transform active:scale-95',
        active
          ? 'border-[var(--calqo-accent)] ring-2 ring-[var(--calqo-accent-ring)]'
          : 'border-[var(--calqo-divider)]',
      )}
      style={{ background: color }}
    >
      {active && (
        <Check
          size={16}
          className="absolute inset-0 m-auto text-white mix-blend-difference"
        />
      )}
    </button>
  );
}

function ColorField({
  label,
  value,
  palette,
  onPick,
}: {
  label: string;
  value: string | undefined;
  palette: string[];
  onPick: (color: string) => void;
}) {
  const { t } = useTranslation('editor');
  const swatches = [...new Set([...palette, '#000000', '#FFFFFF'])];
  return (
    <section className="py-2">
      <p className="mb-2 text-[12px] font-medium text-[var(--calqo-text-2)]">
        {label}
      </p>
      <div className="calqo-scroll flex items-center gap-2 overflow-x-auto pb-1">
        <label
          className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full border border-[var(--calqo-divider)] text-[10px] font-medium text-[var(--calqo-text-3)]"
          style={{ background: value ?? 'transparent' }}
        >
          {!value && t('mobile.color.custom')}
          <input
            type="color"
            value={value ?? '#000000'}
            onChange={(event) => onPick(event.target.value)}
            className="absolute h-0 w-0 opacity-0"
          />
        </label>
        {swatches.map((color) => (
          <Swatch
            key={color}
            color={color}
            active={value?.toLowerCase() === color.toLowerCase()}
            onClick={() => onPick(color)}
          />
        ))}
      </div>
    </section>
  );
}

/** Quick recolour controls: the selected element's flat colour (when it has
 * one) and the artboard background, both seeded from the project palette. */
export function ColorSheet({ open, onClose, project, artboard, layer }: ColorSheetProps) {
  const { t } = useTranslation('editor');
  const recolorable = isRecolorable(layer);
  const background =
    artboard.background.type === 'solid' ? artboard.background.color : undefined;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('mobile.color.title')}
      bodyClassName="pb-4"
    >
      {recolorable && layer && (
        <ColorField
          label={t('mobile.color.element')}
          value={currentLayerColor(layer)}
          palette={project.palette}
          onPick={(color) => recolorLayer(project.id, layer, color)}
        />
      )}
      <ColorField
        label={t('mobile.color.background')}
        value={background}
        palette={project.palette}
        onPick={(color) =>
          setArtboardBackgroundColor(project.id, artboard.id, color)
        }
      />
    </BottomSheet>
  );
}
