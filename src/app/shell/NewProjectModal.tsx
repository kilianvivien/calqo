import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { GlassIconButton } from '@/components/glass';
import { ARTBOARD_PRESET_LIST, type ArtboardPresetId } from '@/lib/schema/presets';

/** Proportional preset cards for choosing a social-media format. Shared by the
 * New-project modal and the empty-canvas state. */
export function FormatGrid({
  onSelect,
}: {
  onSelect: (preset: ArtboardPresetId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {ARTBOARD_PRESET_LIST.map((preset) => {
        const ratio = preset.width / preset.height;
        return (
          <button
            key={preset.id}
            type="button"
            aria-label={`${preset.name} ${preset.width} x ${preset.height}`}
            onClick={() => onSelect(preset.id as ArtboardPresetId)}
            className="min-w-0 rounded-[12px] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] p-3 text-left transition-[border-color,background,box-shadow,transform] duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-out)] hover:-translate-y-0.5 hover:border-[var(--calqo-accent)] hover:bg-[var(--calqo-accent-soft)] hover:shadow-[0_0_0_2px_var(--calqo-accent-ring)]"
          >
            <span className="mb-3 flex h-16 items-center justify-center">
              <span
                className="block rounded-[5px] border border-[var(--calqo-accent)] bg-white/85 shadow-[0_6px_20px_rgba(0,0,0,0.18)]"
                style={
                  ratio >= 1
                    ? { width: '46px', height: `${Math.max(18, 46 / ratio)}px` }
                    : { height: '52px', width: `${Math.max(18, 52 * ratio)}px` }
                }
              />
            </span>
            <span className="block truncate text-[12px] font-semibold text-[var(--calqo-text)]">
              {preset.name}
            </span>
            <span className="mono mt-0.5 block truncate text-[10px] text-[var(--calqo-text-3)]">
              {preset.width} x {preset.height}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function NewProjectModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (preset: ArtboardPresetId) => void;
}) {
  const { t } = useTranslation('editor');

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(0,0,0,0.45)] p-6 backdrop-blur-md"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
        className="glass glass-strong w-[min(620px,100%)] rounded-[28px] border border-[var(--calqo-divider)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
      >
        <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2
              id="new-project-title"
              className="text-[16px] font-semibold text-[var(--calqo-text)]"
            >
              {t('newProject.title')}
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--calqo-text-3)]">
              {t('newProject.subtitle')}
            </p>
          </div>
          <GlassIconButton label={t('export.close')} onClick={onClose}>
            <X size={15} />
          </GlassIconButton>
        </header>
        <FormatGrid onSelect={onSelect} />
      </section>
    </div>,
    document.body,
  );
}
