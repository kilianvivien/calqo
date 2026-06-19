import { createId } from '@/lib/utils/ids';
import type {
  CalqoArtboard,
  CalqoLayer,
  Fill,
  GroupLayer,
  ImageLayer,
  ShapeLayer,
  SvgLayer,
  TextLayer,
} from '@/lib/schema';

export type LayerPatch = Partial<
  Omit<CalqoLayer, 'id' | 'type' | 'children'>
> & {
  text?: TextLayer['text'];
  style?: Partial<TextLayer['style']>;
  shape?: ShapeLayer['shape'];
  fill?: Fill;
  stroke?: ShapeLayer['stroke'];
  cornerRadius?: number;
  points?: ShapeLayer['points'] | null;
  fit?: ImageLayer['fit'];
  /** Group-only: bake a Konva transform scale into the group's children. */
  groupScale?: { sx: number; sy: number };
};

export function isGroupLayer(layer: CalqoLayer): layer is GroupLayer {
  return layer.type === 'group';
}

export function flattenLayers(layers: CalqoLayer[]): CalqoLayer[] {
  return layers.flatMap((layer) =>
    isGroupLayer(layer) ? [layer, ...flattenLayers(layer.children)] : [layer],
  );
}

export function findLayer(
  layers: CalqoLayer[],
  id: string,
): CalqoLayer | null {
  for (const layer of layers) {
    if (layer.id === id) return layer;
    if (isGroupLayer(layer)) {
      const child = findLayer(layer.children, id);
      if (child) return child;
    }
  }
  return null;
}

export function findLayerInArtboard(
  artboard: CalqoArtboard | undefined,
  id: string,
): CalqoLayer | null {
  return artboard ? findLayer(artboard.layers, id) : null;
}

export function updateLayer(
  layers: CalqoLayer[],
  id: string,
  updater: (layer: CalqoLayer) => void,
): boolean {
  for (const layer of layers) {
    if (layer.id === id) {
      updater(layer);
      return true;
    }
    if (isGroupLayer(layer) && updateLayer(layer.children, id, updater)) {
      return true;
    }
  }
  return false;
}

export function removeLayer(
  layers: CalqoLayer[],
  id: string,
): CalqoLayer | null {
  const index = layers.findIndex((layer) => layer.id === id);
  if (index >= 0) {
    return layers.splice(index, 1)[0] ?? null;
  }
  for (const layer of layers) {
    if (isGroupLayer(layer)) {
      const removed = removeLayer(layer.children, id);
      if (removed) return removed;
    }
  }
  return null;
}

export function applyLayerPatch(layer: CalqoLayer, patch: LayerPatch): void {
  if (patch.name !== undefined) layer.name = patch.name;
  if (patch.x !== undefined) layer.x = patch.x;
  if (patch.y !== undefined) layer.y = patch.y;
  if (patch.w !== undefined) layer.w = Math.max(1, patch.w);
  if (patch.h !== undefined) layer.h = Math.max(1, patch.h);
  if (patch.rotation !== undefined) layer.rotation = patch.rotation;
  if (patch.opacity !== undefined) {
    layer.opacity = Math.min(1, Math.max(0, patch.opacity));
  }
  if (patch.visible !== undefined) layer.visible = patch.visible;
  if (patch.locked !== undefined) layer.locked = patch.locked;

  if (layer.type === 'text') {
    if (patch.text) layer.text = { ...layer.text, ...patch.text };
    if (patch.style) layer.style = { ...layer.style, ...patch.style };
  }
  if (layer.type === 'shape') {
    if (patch.shape !== undefined) layer.shape = patch.shape;
    if (patch.fill) layer.fill = patch.fill;
    if (patch.stroke !== undefined) layer.stroke = patch.stroke;
    if (patch.cornerRadius !== undefined) layer.cornerRadius = patch.cornerRadius;
    if (patch.points !== undefined) {
      if (patch.points === null) delete layer.points;
      else layer.points = patch.points;
    }
  }
  if (layer.type === 'image' && patch.fit) layer.fit = patch.fit;
  if (isGroupLayer(layer) && patch.groupScale) {
    const { sx, sy } = patch.groupScale;
    layer.children.forEach((child) => scaleLayerTree(child, sx, sy));
  }
}

export function layerLabel(layer: CalqoLayer): string {
  if (layer.type === 'shape') return `${layer.shape} shape`;
  return layer.type;
}

export function isRasterImageLayer(layer: CalqoLayer): layer is ImageLayer {
  return layer.type === 'image';
}

export function isSvgLayer(layer: CalqoLayer): layer is SvgLayer {
  return layer.type === 'svg';
}

/** Deep-clone a layer (and its group children) under freshly minted ids, so a
 * duplicate/paste never aliases the original's identity. */
export function cloneLayerWithNewIds(layer: CalqoLayer): CalqoLayer {
  const clone = structuredClone(layer);
  const reassign = (target: CalqoLayer) => {
    target.id = createId('layer');
    if (isGroupLayer(target)) target.children.forEach(reassign);
  };
  reassign(clone);
  return clone;
}

/** Axis-aligned bounding box of a set of layers in their parent's coordinates.
 * Rotation is ignored for the prototype (uses the unrotated x/y/w/h box). */
export function boundingBox(layers: CalqoLayer[]): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  if (layers.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const layer of layers) {
    minX = Math.min(minX, layer.x);
    minY = Math.min(minY, layer.y);
    maxX = Math.max(maxX, layer.x + layer.w);
    maxY = Math.max(maxY, layer.y + layer.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Scale a layer subtree about its parent origin (used when a group node is
 * resized: Konva scales children visually, so we bake that into the schema). */
export function scaleLayerTree(layer: CalqoLayer, sx: number, sy: number): void {
  layer.x *= sx;
  layer.y *= sy;
  layer.w = Math.max(1, layer.w * sx);
  layer.h = Math.max(1, layer.h * sy);
  if (layer.type === 'text') {
    layer.style.fontSize = Math.max(1, layer.style.fontSize * Math.sqrt(sx * sy));
  }
  if (layer.type === 'shape' && layer.points) {
    layer.points = layer.points.map((value, i) => value * (i % 2 === 0 ? sx : sy));
  }
  if (isGroupLayer(layer)) {
    layer.children.forEach((child) => scaleLayerTree(child, sx, sy));
  }
}

/** Move an item within an array from one index to another, returning a new
 * array (top-level layer reordering for the layers panel). */
export function moveInArray<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
