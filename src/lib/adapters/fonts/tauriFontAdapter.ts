import { browserFontAdapter } from './browserFontAdapter';
import type { FontAdapter, FontDef, FontVariant } from './FontAdapter';

function fontDef(family: string): FontDef {
  return { family, stack: `"${family}", system-ui, sans-serif` };
}

export const tauriFontAdapter: FontAdapter = {
  async listFonts(): Promise<FontDef[]> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const nativeFonts = await invoke<string[]>('list_system_fonts');
      const browserFonts = await browserFontAdapter.listFonts();
      const families = new Map<string, FontDef>();
      for (const font of browserFonts) families.set(font.family, font);
      for (const family of nativeFonts) families.set(family, fontDef(family));
      return [...families.values()].sort((a, b) =>
        a.family.localeCompare(b.family),
      );
    } catch (error) {
      console.error('[Calqo] local font enumeration failed', error);
      return browserFontAdapter.listFonts();
    }
  },
  async getFontVariants(family: string): Promise<FontVariant[]> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<FontVariant[]>('list_font_variants', { family });
    } catch (error) {
      console.error('[Calqo] local font variant enumeration failed', error);
      return browserFontAdapter.getFontVariants(family);
    }
  },
};

