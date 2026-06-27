import { useEffect, useState } from 'react';
import { fonts, type FontDef } from '@/lib/adapters';

const FALLBACK_FONTS: FontDef[] = [
  { family: 'Inter', stack: '"Inter", system-ui, sans-serif' },
  { family: 'System', stack: 'system-ui, -apple-system, sans-serif' },
];

export function useFontOptions(currentFamily?: string): FontDef[] {
  const [availableFonts, setAvailableFonts] = useState<FontDef[]>(FALLBACK_FONTS);

  useEffect(() => {
    let cancelled = false;
    void fonts.listFonts().then((next) => {
      if (!cancelled && next.length > 0) setAvailableFonts(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (
    currentFamily &&
    !availableFonts.some((font) => font.family === currentFamily)
  ) {
    return [
      { family: currentFamily, stack: `"${currentFamily}", system-ui, sans-serif` },
      ...availableFonts,
    ];
  }

  return availableFonts;
}
