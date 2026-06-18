import type { FontAdapter, FontDef } from './FontAdapter';

/** A conservative bundled list using web-safe and system stacks — no remote font
 * loading or local enumeration in the browser prototype (plan §15.4). */
const BUNDLED_FONTS: FontDef[] = [
  { family: 'Inter', stack: '"Inter", system-ui, sans-serif' },
  { family: 'System', stack: 'system-ui, -apple-system, sans-serif' },
  { family: 'Helvetica', stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { family: 'Georgia', stack: 'Georgia, "Times New Roman", serif' },
  { family: 'Courier', stack: '"Courier New", ui-monospace, monospace' },
];

export const browserFontAdapter: FontAdapter = {
  async listFonts(): Promise<FontDef[]> {
    return BUNDLED_FONTS;
  },
};

export { BUNDLED_FONTS };
