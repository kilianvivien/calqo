import { useEffect, useState } from 'react';
import { fonts, type FontVariant } from '@/lib/adapters';

export interface FontVariants {
  /** Weights the family actually has installed, in ascending order. */
  weights: number[];
  /** True when at least one face in the family is italic/oblique. */
  hasItalic: boolean;
}

const FALLBACK: FontVariants = { weights: [], hasItalic: false };

/** Read the installed weights and italic availability for a given font family.
 * Re-runs whenever the family changes. While the call is in flight, returns
 * the previous result (or the fallback) so the picker doesn't flicker. */
export function useFontVariants(family: string | undefined): FontVariants {
  const [variants, setVariants] = useState<FontVariants>(FALLBACK);
  useEffect(() => {
    if (!family) {
      setVariants(FALLBACK);
      return;
    }
    let cancelled = false;
    void fonts.getFontVariants(family).then((list) => {
      if (cancelled) return;
      const weights = Array.from(new Set(list.map((v: FontVariant) => v.weight))).sort(
        (a, b) => a - b,
      );
      const hasItalic = list.some((v) => v.italic);
      setVariants({ weights, hasItalic });
    });
    return () => {
      cancelled = true;
    };
  }, [family]);
  return variants;
}
