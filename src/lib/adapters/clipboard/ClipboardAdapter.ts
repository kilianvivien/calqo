/** Image clipboard boundary. Browser support for writing images is uneven, so
 * callers must handle a `false` result (fall back to download). */
export interface ClipboardAdapter {
  canWriteImages(): boolean;
  writeImage(blob: Blob): Promise<boolean>;
}
