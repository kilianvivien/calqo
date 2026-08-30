/** Generous social-design limits, shared by disk/AI imports and raster exports.
 * Check raw input iteratively before migration, cloning, or recursive Zod parsing. */
export const DOCUMENT_LIMITS = {
  fileBytes: 128 * 1024 * 1024,
  assetBytes: 32 * 1024 * 1024,
  assets: 512,
  artboards: 100,
  layers: 5_000,
  depth: 64,
  nodes: 250_000,
  stringLength: 1_000_000,
  dimension: 16_384,
  rasterPixels: 32_000_000,
} as const;

export function documentBudgetError(raw: unknown): string | null {
  const stack = [{ value: raw, depth: 0 }];
  let nodes = 0;
  let layers = 0;
  while (stack.length) {
    const { value, depth } = stack.pop()!;
    if (++nodes > DOCUMENT_LIMITS.nodes || depth > DOCUMENT_LIMITS.depth)
      return 'Project is too complex or nested too deeply.';
    if (
      typeof value === 'string' &&
      value.length > DOCUMENT_LIMITS.stringLength
    )
      return 'Project contains text exceeding the supported size.';
    if (typeof value === 'number' && !Number.isFinite(value))
      return 'Project contains an unsupported numeric value.';
    if (!value || typeof value !== 'object') continue;
    if (Array.isArray(value)) {
      if (value.length > DOCUMENT_LIMITS.nodes)
        return 'Project contains an oversized collection.';
      for (const child of value) stack.push({ value: child, depth: depth + 1 });
      continue;
    }
    const record = value as Record<string, unknown>;
    if (
      Array.isArray(record.artboards) &&
      record.artboards.length > DOCUMENT_LIMITS.artboards
    )
      return 'Project contains too many artboards (maximum 100).';
    if (
      Array.isArray(record.assets) &&
      record.assets.length > DOCUMENT_LIMITS.assets
    )
      return 'Project contains too many assets (maximum 512).';
    if (
      typeof record.type === 'string' &&
      'w' in record &&
      'h' in record &&
      ++layers > DOCUMENT_LIMITS.layers
    )
      return 'Project contains too many layers (maximum 5,000).';
    const width = record.w ?? record.width;
    const height = record.h ?? record.height;
    if (
      ('w' in record || Array.isArray(record.layers)) &&
      typeof width === 'number' &&
      typeof height === 'number' &&
      (Math.abs(width) > DOCUMENT_LIMITS.dimension ||
        Math.abs(height) > DOCUMENT_LIMITS.dimension ||
        Math.abs(width * height) > DOCUMENT_LIMITS.rasterPixels)
    ) {
      return 'Project dimensions exceed the supported canvas budget.';
    }
    const entries = Object.values(record);
    if (entries.length > DOCUMENT_LIMITS.nodes)
      return 'Project contains an oversized object.';
    for (const child of entries) stack.push({ value: child, depth: depth + 1 });
  }
  return null;
}

export function rasterBudgetError(
  width: number,
  height: number,
  scale: number,
): boolean {
  const w = Math.ceil(width * scale);
  const h = Math.ceil(height * scale);
  return (
    ![width, height, scale, w, h].every((n) => Number.isFinite(n) && n > 0) ||
    w > DOCUMENT_LIMITS.dimension ||
    h > DOCUMENT_LIMITS.dimension ||
    w * h > DOCUMENT_LIMITS.rasterPixels
  );
}

export function assertRasterBudget(
  width: number,
  height: number,
  scale: number,
): void {
  if (rasterBudgetError(width, height, scale)) {
    throw new Error(
      'Export exceeds the canvas budget. Choose a lower scale or smaller artboard.',
    );
  }
}
