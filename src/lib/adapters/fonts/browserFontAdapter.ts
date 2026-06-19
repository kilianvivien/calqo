import type { FontAdapter, FontDef } from './FontAdapter';

/** Browser prototype font menu: web-safe stacks plus Google Fonts loaded from
 * index.html. Tauri/local enumeration can replace this list later. */
const BUNDLED_FONTS: FontDef[] = [
  { family: 'Inter', stack: '"Inter", system-ui, sans-serif' },
  { family: 'System', stack: 'system-ui, -apple-system, sans-serif' },
  { family: 'Helvetica', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { family: 'Roboto', stack: '"Roboto", system-ui, sans-serif' },
  { family: 'DM Sans', stack: '"DM Sans", system-ui, sans-serif' },
  { family: 'Source Sans 3', stack: '"Source Sans 3", system-ui, sans-serif' },
  { family: 'Poppins', stack: '"Poppins", system-ui, sans-serif' },
  { family: 'Montserrat', stack: '"Montserrat", system-ui, sans-serif' },
  { family: 'Raleway', stack: '"Raleway", system-ui, sans-serif' },
  { family: 'Nunito', stack: '"Nunito", system-ui, sans-serif' },
  { family: 'Manrope', stack: '"Manrope", system-ui, sans-serif' },
  { family: 'Archivo', stack: '"Archivo", system-ui, sans-serif' },
  { family: 'Barlow', stack: '"Barlow", system-ui, sans-serif' },
  { family: 'Space Grotesk', stack: '"Space Grotesk", system-ui, sans-serif' },
  { family: 'Oswald', stack: '"Oswald", "Arial Narrow", sans-serif' },
  { family: 'Bebas Neue', stack: '"Bebas Neue", "Arial Narrow", sans-serif' },
  { family: 'Anton', stack: '"Anton", Impact, sans-serif' },
  { family: 'Georgia', stack: 'Georgia, "Times New Roman", serif' },
  { family: 'Playfair Display', stack: '"Playfair Display", Georgia, serif' },
  { family: 'Merriweather', stack: '"Merriweather", Georgia, serif' },
  { family: 'Lora', stack: '"Lora", Georgia, serif' },
  { family: 'Source Serif 4', stack: '"Source Serif 4", Georgia, serif' },
  { family: 'Pacifico', stack: '"Pacifico", cursive' },
  { family: 'Caveat', stack: '"Caveat", cursive' },
  { family: 'Permanent Marker', stack: '"Permanent Marker", cursive' },
  { family: 'Courier', stack: '"Courier New", ui-monospace, monospace' },
];

export const browserFontAdapter: FontAdapter = {
  async listFonts(): Promise<FontDef[]> {
    return BUNDLED_FONTS;
  },
};

export { BUNDLED_FONTS };
