import { useTranslation } from 'react-i18next';
import { FontMenu } from './FontMenu';
import type { FontDef } from '@/lib/adapters';

interface FontMenuFieldProps {
  label: string;
  value: string;
  fonts: FontDef[];
  onChange: (family: string) => void;
}

/** Label + FontMenu laid out to match the rest of the inspector's 88px label
 * column (`SelectField`, `SliderField`, etc.). */
export function FontMenuField({
  label,
  value,
  fonts,
  onChange,
}: FontMenuFieldProps) {
  const { t } = useTranslation('editor');
  return (
    <label className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1 text-[12px]">
      <span className="text-[var(--calqo-text-3)]">{label}</span>
      <FontMenu
        value={value}
        fonts={fonts}
        onChange={onChange}
        ariaLabel={t('properties.font')}
      />
    </label>
  );
}
