import { useTranslation } from 'react-i18next';

export interface NamedWeightBase {
  weight: number;
  /** i18n key for the compact pill label (e.g. "Bold"). */
  shortKey: string;
  /** i18n key for the long label / tooltip. */
  longKey: string;
}

export interface NamedWeight extends NamedWeightBase {
  short: string;
  long: string;
}

/** The standard CSS weight buckets. */
export const NAMED_WEIGHTS: NamedWeightBase[] = [
  { weight: 100, shortKey: 'weight_thin', longKey: 'weight_thin' },
  { weight: 200, shortKey: 'weight_extraLight', longKey: 'weight_extraLight' },
  { weight: 300, shortKey: 'weight_light', longKey: 'weight_light' },
  { weight: 400, shortKey: 'weight_regular', longKey: 'weight_regular' },
  { weight: 500, shortKey: 'weight_medium', longKey: 'weight_medium' },
  { weight: 600, shortKey: 'weight_semiBold', longKey: 'weight_semiBold' },
  { weight: 700, shortKey: 'weight_bold', longKey: 'weight_bold' },
  { weight: 800, shortKey: 'weight_extraBold', longKey: 'weight_extraBold' },
  { weight: 900, shortKey: 'weight_black', longKey: 'weight_black' },
];

/** Map a CSS weight to its named bucket. */
export function weightBucket(weight: number): number {
  const w = Math.max(100, Math.min(900, Math.round(weight / 100) * 100));
  return NAMED_WEIGHTS.some((n) => n.weight === w) ? w : 400;
}

/** Hook that returns the localized weight bucket table for the current
 * language. */
export function useNamedWeights(): NamedWeight[] {
  const { t } = useTranslation('editor');
  return NAMED_WEIGHTS.map((n) => ({
    ...n,
    short: t(`properties.${n.shortKey}`),
    long: t(`properties.${n.longKey}`),
  }));
}
