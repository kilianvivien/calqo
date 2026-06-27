import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  AlignCenter,
  AlignLeft,
  AlignRight,
  Minus,
  Plus,
} from 'lucide-react';
import {
  commitListInlineEdit,
  recomputeOverflow,
  setActiveContentLocale,
  updateLayerInActiveArtboard,
  updateTextForLocale,
} from '@/editor/commands/projectCommands';
import { localeLabel } from '@/editor/i18n-content/contentLocaleService';
import { useFontOptions } from '@/lib/hooks/useFontOptions';
import { useFontVariants } from '@/lib/hooks/useFontVariants';
import type { CalqoLayer, CalqoProject, LocaleCode, TextStyle } from '@/lib/schema';
import { BottomSheet } from '@/components/mobile';
import { GlassButton } from '@/components/glass';
import { FontMenu, TextStyleButtons } from '@/components/inspector';
import { cn } from '@/lib/utils/cn';

const ALIGNS: { value: TextStyle['align']; icon: typeof AlignLeft }[] = [
  { value: 'left', icon: AlignLeft },
  { value: 'center', icon: AlignCenter },
  { value: 'right', icon: AlignRight },
];

interface TextEditSheetProps {
  open: boolean;
  onClose: () => void;
  project: CalqoProject;
  /** The text or list layer being edited. */
  layer: CalqoLayer;
}

function readValue(layer: CalqoLayer, locale: LocaleCode): string {
  if (layer.type === 'list') {
    return layer.items
      .map((row) => row.text[locale] ?? Object.values(row.text)[0] ?? '')
      .join('\n');
  }
  if (layer.type === 'text') {
    return layer.text[locale] ?? Object.values(layer.text)[0] ?? '';
  }
  return '';
}

/** Bottom-sheet text editing for the active content locale, with chips to jump
 * between locale variants. The textarea is uncontrolled and keyed by layer +
 * locale so typing never re-seeds it (which on iOS dropped focus every
 * keystroke); edits commit on blur / locale switch / close (PRD §5.9). */
export function TextEditSheet({ open, onClose, project, layer }: TextEditSheetProps) {
  const { t } = useTranslation('editor');
  const locale = project.activeContentLocale;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const commit = () => {
    const value = textareaRef.current?.value;
    if (value === undefined || value === readValue(layer, locale)) return;
    if (layer.type === 'list') {
      commitListInlineEdit(project.id, layer.id, locale, value.split('\n'));
    } else {
      updateTextForLocale(project.id, layer.id, locale, value);
    }
    recomputeOverflow(project.id);
  };

  const switchLocale = (next: LocaleCode) => {
    commit();
    setActiveContentLocale(project.id, next);
  };

  const done = () => {
    commit();
    onClose();
  };

  const style =
    layer.type === 'text' || layer.type === 'list' ? layer.style : null;
  const fontOptions = useFontOptions(style?.fontFamily);
  const fontVariants = useFontVariants(style?.fontFamily);
  const patchStyle = (patch: Partial<TextStyle>) =>
    updateLayerInActiveArtboard(project.id, layer.id, { style: patch });

  const overflow =
    layer.type === 'text'
      ? layer.overflow?.hasOverflow
      : layer.type === 'list'
        ? layer.items.some((row) => row.overflow?.hasOverflow)
        : false;

  return (
    <BottomSheet
      open={open}
      onClose={done}
      title={t('mobile.text.title')}
      subtitle={t('mobile.text.editingLocale', { locale: localeLabel(locale) })}
      bodyClassName="pb-4"
      footer={
        <GlassButton variant="primary" className="w-full" onClick={done}>
          {t('mobile.common.done')}
        </GlassButton>
      }
    >
      {project.contentLocales.length > 1 && (
        <div className="calqo-scroll mb-3 flex gap-1.5 overflow-x-auto pb-1">
          {project.contentLocales.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => switchLocale(code)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
                code === locale
                  ? 'bg-[var(--calqo-accent)] text-[var(--calqo-text-on-accent)]'
                  : 'bg-[var(--calqo-hover)] text-[var(--calqo-text-2)]',
              )}
            >
              {localeLabel(code)}
            </button>
          ))}
        </div>
      )}

      <textarea
        // Remount only when the target layer or locale changes, so React
        // re-seeds the value then — never mid-typing.
        key={`${layer.id}:${locale}`}
        ref={textareaRef}
        autoFocus
        defaultValue={readValue(layer, locale)}
        onBlur={commit}
        rows={layer.type === 'list' ? 6 : 4}
        className="w-full resize-y rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] p-3 text-[15px] leading-snug text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
        placeholder={t('mobile.text.placeholder')}
      />

      {layer.type === 'list' && (
        <p className="mt-2 text-[11.5px] text-[var(--calqo-text-3)]">
          {t('mobile.text.listHint')}
        </p>
      )}

      {style && (
        <section className="mt-4 space-y-3">
          <span className="eyebrow">{t('mobile.text.style')}</span>

          <label className="block">
            <span className="mb-1 block text-[12px] font-medium text-[var(--calqo-text-2)]">
              {t('mobile.text.font')}
            </span>
            <FontMenu
              value={style.fontFamily}
              fonts={fontOptions}
              onChange={(fontFamily) => patchStyle({ fontFamily })}
            />
          </label>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] font-medium text-[var(--calqo-text-2)]">
              {t('mobile.text.size')}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={t('mobile.text.sizeDown')}
                onClick={() =>
                  patchStyle({ fontSize: Math.max(8, Math.round(style.fontSize - 4)) })
                }
                className="grid h-10 w-10 place-items-center rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] text-[var(--calqo-text-2)] active:bg-[var(--calqo-hover)]"
              >
                <Minus size={16} />
              </button>
              <span className="w-12 text-center text-[14px] font-medium tabular-nums text-[var(--calqo-text)]">
                {Math.round(style.fontSize)}
              </span>
              <button
                type="button"
                aria-label={t('mobile.text.sizeUp')}
                onClick={() =>
                  patchStyle({ fontSize: Math.min(400, Math.round(style.fontSize + 4)) })
                }
                className="grid h-10 w-10 place-items-center rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] text-[var(--calqo-text-2)] active:bg-[var(--calqo-hover)]"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] font-medium text-[var(--calqo-text-2)]">
              {t('mobile.text.style')}
            </span>
            <TextStyleButtons
              fontWeight={Number(style.fontWeight) || 400}
              fontStyle={style.fontStyle}
              textDecoration={style.textDecoration}
              color={style.color}
              hasItalic={fontVariants.hasItalic}
              availableWeights={fontVariants.weights}
              onChange={(patch) => patchStyle(patch)}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] font-medium text-[var(--calqo-text-2)]">
              {t('mobile.text.align')}
            </span>
            <div className="flex gap-1 rounded-full bg-[var(--calqo-hover)] p-0.5">
              {ALIGNS.map(({ value: alignValue, icon: Icon }) => (
                <button
                  key={alignValue}
                  type="button"
                  aria-label={alignValue}
                  onClick={() => patchStyle({ align: alignValue })}
                  className={cn(
                    'grid h-9 w-10 place-items-center rounded-full transition-colors',
                    style.align === alignValue
                      ? 'bg-[var(--calqo-accent)] text-[var(--calqo-text-on-accent)]'
                      : 'text-[var(--calqo-text-2)]',
                  )}
                >
                  <Icon size={16} />
                </button>
              ))}
            </div>
          </div>
        </section>
      )}

      {overflow && (
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-[#B7791F]">
          <AlertTriangle size={14} />
          {t('mobile.text.overflow')}
        </p>
      )}
    </BottomSheet>
  );
}
