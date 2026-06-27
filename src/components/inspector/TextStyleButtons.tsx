import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils/cn';
import type { StrokeStyle } from '@/lib/schema';

interface TextStyleButtonsProps {
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline';
  /** Current text fill — X paints a stroke in this colour so the text reads
   * as "really extra bold" even on fonts whose 700/800 faces are visually
   * close (e.g. Marianne). */
  color: string;
  /** True if the family has at least one italic face. When false, the italic
   * button is disabled (greyed out). */
  hasItalic: boolean;
  /** Weights the family actually has installed. When non-empty, each weight
   * button is disabled if its weight is not in this list (so a font without
   * ExtraBold doesn't expose a non-functional X toggle). When empty (e.g.
   * the browser prototype can't introspect the family), all weight buttons
   * stay enabled. */
  availableWeights?: number[];
  onChange: (patch: {
    fontWeight?: number;
    fontStyle?: 'normal' | 'italic';
    textDecoration?: 'none' | 'underline';
    /** Pass `undefined` to clear any existing stroke (X is deselected, or
     * B/L replaced it). The schema's `stroke` field is `optional()`, so
     * `undefined` removes it on the next immer patch. */
    stroke?: StrokeStyle | undefined;
  }) => void;
  className?: string;
}

interface WeightButton {
  weight: number;
  label: string;
  /** CSS font-weight applied to the label glyph itself, so the letter
   * visually hints at the weight it represents. */
  labelWeight: number;
  key: string;
  /** Width (in layer units) of the synthesized stroke X paints when active.
   * Set to `undefined` for the non-X buttons — they never touch stroke. */
  strokeWidth?: number;
}

const WEIGHT_BUTTONS: WeightButton[] = [
  { weight: 300, label: 'L', labelWeight: 300, key: 'light' },
  { weight: 700, label: 'B', labelWeight: 700, key: 'bold' },
  // X applies a 1.5-layer-unit stroke in the text colour on top of weight 800.
  // This is how we make "extra bold" visibly distinct from "bold" on fonts
  // where the 700 and 800 faces are close (the OS/2 usWeightClass on
  // Marianne reports both, but the glyph difference is subtle).
  { weight: 800, label: 'X', labelWeight: 800, key: 'extraBold', strokeWidth: 1.5 },
];

const DEFAULT_WEIGHT = 400;

/** Five compact buttons in a row: L (light, 300), B (bold, 700), X (extra
 * bold, 800), I (italic), U (underline). Each weight is a toggle — clicking
 * an active weight resets to Regular (400); clicking another weight switches
 * to it. Italic and any weight the family doesn't actually have are greyed
 * out (so a font without ExtraBold doesn't expose a non-functional X
 * button). X also paints a stroke in the text colour so it reads as
 * "really extra bold" even on fonts whose 700/800 faces are visually
 * close. The weight letters render in their own weight as a tiny preview
 * of the face they set. */
export function TextStyleButtons({
  fontWeight,
  fontStyle,
  textDecoration,
  color,
  hasItalic,
  availableWeights,
  onChange,
  className,
}: TextStyleButtonsProps) {
  const { t } = useTranslation('editor');
  const currentWeight = Math.round(fontWeight / 100) * 100;
  const weightSet =
    availableWeights && availableWeights.length > 0
      ? new Set(availableWeights)
      : null;

  const onWeightClick = (button: WeightButton) => {
    const active = currentWeight === button.weight;
    if (active) {
      // Clicking the active weight resets to Regular and clears any stroke X
      // painted (so B and L don't leave an unwanted outline behind).
      onChange({ fontWeight: DEFAULT_WEIGHT, stroke: undefined });
      return;
    }
    const patch: Parameters<NonNullable<TextStyleButtonsProps['onChange']>>[0] = {
      fontWeight: button.weight,
    };
    if (button.strokeWidth !== undefined) {
      // X synthesizes a stroke in the text colour. We pass it through the
      // normal style patch so the user can see and tweak it in the
      // inspector afterwards.
      patch.stroke = { color, width: button.strokeWidth };
    } else {
      // B and L are pure weight toggles — clear any stroke X may have left.
      patch.stroke = undefined;
    }
    onChange(patch);
  };

  return (
    <div
      className={cn(
        'glass-thin inline-flex items-center gap-0.5 rounded-[var(--calqo-radius-sm)] p-0.5',
        className,
      )}
      role="group"
      aria-label={t('properties.style')}
    >
      {WEIGHT_BUTTONS.map((button) => {
        const active = currentWeight === button.weight;
        const available = weightSet === null || weightSet.has(button.weight);
        const label = t(`properties.weight_${button.key}`);
        const title = available
          ? label
          : t('properties.weightNotAvailable', { weight: label });
        return (
          <button
            key={button.key}
            type="button"
            role="checkbox"
            aria-checked={active}
            aria-label={label}
            title={title}
            disabled={!available}
            onClick={() => onWeightClick(button)}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-[6px] text-[12.5px] transition-colors duration-[var(--calqo-t-fast)]',
              !available && 'cursor-not-allowed opacity-40',
              available && active
                ? 'bg-[var(--calqo-accent)] text-[var(--calqo-text-on-accent)]'
                : available
                  ? 'text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]'
                  : 'text-[var(--calqo-text-3)]',
            )}
            style={{ fontWeight: button.labelWeight }}
          >
            {button.label}
          </button>
        );
      })}
      <span
        aria-hidden
        className="mx-0.5 h-4 w-px bg-[var(--calqo-divider)]"
      />
      <button
        type="button"
        role="checkbox"
        aria-checked={fontStyle === 'italic'}
        aria-label={t('properties.italic')}
        title={hasItalic ? t('properties.italic') : t('properties.italicNotAvailable')}
        disabled={!hasItalic}
        onClick={() =>
          onChange({ fontStyle: fontStyle === 'italic' ? 'normal' : 'italic' })
        }
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-[6px] text-[12.5px] italic transition-colors duration-[var(--calqo-t-fast)]',
          !hasItalic && 'cursor-not-allowed opacity-40',
          hasItalic && fontStyle === 'italic'
            ? 'bg-[var(--calqo-accent)] text-[var(--calqo-text-on-accent)]'
            : hasItalic
              ? 'text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]'
              : 'text-[var(--calqo-text-3)]',
        )}
        style={{
          fontStyle: 'italic',
          fontWeight: fontStyle === 'italic' ? 700 : 400,
        }}
      >
        I
      </button>
      <button
        type="button"
        role="checkbox"
        aria-checked={textDecoration === 'underline'}
        aria-label={t('properties.underline')}
        title={t('properties.underline')}
        onClick={() =>
          onChange({
            textDecoration: textDecoration === 'underline' ? 'none' : 'underline',
          })
        }
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-[6px] text-[12.5px] underline transition-colors duration-[var(--calqo-t-fast)]',
          textDecoration === 'underline'
            ? 'bg-[var(--calqo-accent)] text-[var(--calqo-text-on-accent)]'
            : 'text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]',
        )}
      >
        U
      </button>
    </div>
  );
}
