export interface FontDef {
  family: string;
  /** CSS font stack to apply when this family is selected. */
  stack: string;
}

/** One installed face of a font family. `weight` is the OS-resolved CSS
 * weight (100…900) and `italic` is true for any slanted face. The Tauri
 * adapter returns one of these per installed face; the browser adapter
 * returns the bundled defaults. */
export interface FontVariant {
  weight: number;
  italic: boolean;
}

/** Font availability boundary. The browser prototype exposes a small bundled
 * list; Tauri (or the Local Font Access API) can enumerate system fonts later. */
export interface FontAdapter {
  listFonts(): Promise<FontDef[]>;
  /** Available weights + italic flag for a given family. Returns an empty
   * array when the family isn't installed or the platform can't introspect
   * it, so callers can fall back to the schema's defaults. */
  getFontVariants(family: string): Promise<FontVariant[]>;
}
