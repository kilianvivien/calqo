import type { CalqoLayer } from '@/lib/schema';

/** Locked layers remain visible but do not participate in canvas hit testing.
 * This lets the Stage receive clicks through a locked, artboard-sized backdrop
 * and preserves the editor's existing rule that locked layers are selected
 * from the layer tree rather than directly on the canvas. */
export function layerListensForCanvasEvents(layer: CalqoLayer): boolean {
  return !layer.locked;
}
