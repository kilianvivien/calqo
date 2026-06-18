export interface FontDef {
  family: string;
  /** CSS font stack to apply when this family is selected. */
  stack: string;
}

/** Font availability boundary. The browser prototype exposes a small bundled
 * list; Tauri (or the Local Font Access API) can enumerate system fonts later. */
export interface FontAdapter {
  listFonts(): Promise<FontDef[]>;
}
