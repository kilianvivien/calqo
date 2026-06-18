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
  fill?: Fill;
  stroke?: ShapeLayer['stroke'];
  fit?: ImageLayer['fit'];
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
    if (patch.fill) layer.fill = patch.fill;
    if (patch.stroke !== undefined) layer.stroke = patch.stroke;
  }
  if (layer.type === 'image' && patch.fit) layer.fit = patch.fit;
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
