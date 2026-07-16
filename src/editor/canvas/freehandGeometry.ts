/** Geometry for pressure-sensitive freehand strokes. Konva lines and SVG paths
 * only support one stroke width, so a variable-width stroke (Apple Pencil /
 * stylus force) is drawn as a closed, filled ribbon: the centerline is offset
 * perpendicular by half the local width on each side. Shared by the canvas
 * renderer, the raster exporter, and the SVG exporter so all three agree. */

/** Width multiplier bounds for the pressure→width mapping. A light touch thins
 * the line, a heavy press fattens it; pressure 0.5 (the PointerEvent default
 * for devices without force) maps exactly to the base brush width. */
const MIN_WIDTH_FACTOR = 0.3;
const MAX_WIDTH_FACTOR = 1.7;

/** Floor so a zero-force sample still leaves visible ink. */
const MIN_POINT_WIDTH = 0.5;

/** Stylus pressure (0–1) for a brush sample, or null when the device reports
 * none (mouse, trackpad, finger — their constant readings carry no signal).
 * Pens surface as PointerEvents with `pressure`; Apple Pencil through Safari
 * touch events reports `Touch.force` with `touchType: 'stylus'`. */
export function stylusPressure(evt: MouseEvent | TouchEvent): number | null {
  if ('touches' in evt) {
    const touch = evt.touches[0] as (Touch & { touchType?: string }) | undefined;
    if (!touch || touch.touchType !== 'stylus') return null;
    return Math.min(1, Math.max(0, touch.force ?? 0));
  }
  const pointer = evt as MouseEvent & Partial<PointerEvent>;
  if (pointer.pointerType === 'pen' && typeof pointer.pressure === 'number') {
    return Math.min(1, Math.max(0, pointer.pressure));
  }
  return null;
}

/** In-flight pressure samples for a brush stroke, aligned with its points.
 * `real` flips once any sample came from an actual force-reporting device. */
export type PressureTrace = { values: number[]; real: boolean };

export function appendPressure(trace: PressureTrace, evt: MouseEvent | TouchEvent): void {
  const pressure = stylusPressure(evt);
  trace.values.push(pressure ?? 0.5);
  if (pressure != null) trace.real = true;
}

/** Map raw pressure samples (0–1) onto per-point stroke widths in px. */
export function pressuresToWidths(pressures: number[], baseWidth: number): number[] {
  return pressures.map((pressure) => {
    const t = Math.min(1, Math.max(0, pressure));
    const width = baseWidth * (MIN_WIDTH_FACTOR + (MAX_WIDTH_FACTOR - MIN_WIDTH_FACTOR) * t);
    return Math.max(MIN_POINT_WIDTH, Math.round(width * 100) / 100);
  });
}

/** Named width treatments that give each brush style a distinct body. A
 * profile maps per-point base widths (the flat brush size, or pressure-derived
 * widths when a stylus reported force) to the widths stored on the layer —
 * and since the canvas renderer and both exporters all consume `pointWidths`,
 * every output agrees for free.
 * - `taper`: ink-pen entry/exit — the stroke eases in from and out to a point.
 * - `chisel`: 45° calligraphy nib — one diagonal draws broad, the other thin.
 * - `grain` / `grain-soft`: dry media — jittered widths roughen the ribbon
 *   edge (chalk crumbles harder than wax). */
export type BrushProfile = 'taper' | 'chisel' | 'grain' | 'grain-soft';

/** Cumulative arc-length parameter (0–1) per point pair. */
function arcParams(points: number[]): number[] {
  const n = Math.floor(points.length / 2);
  const t = new Array<number>(n).fill(0);
  let total = 0;
  for (let i = 1; i < n; i += 1) {
    total += Math.hypot(points[i * 2] - points[i * 2 - 2], points[i * 2 + 1] - points[i * 2 - 1]);
    t[i] = total;
  }
  if (total > 0) for (let i = 0; i < n; i += 1) t[i] /= total;
  return t;
}

function smoothstep(edge: number, x: number): number {
  const c = Math.min(1, Math.max(0, x / edge));
  return c * c * (3 - 2 * c);
}

/** Deterministic per-stroke PRNG (mulberry32) seeded from the geometry, so a
 * grain profile paints the same edge on every repaint and in every export. */
function strokeRandom(points: number[]): () => number {
  let seed = 2166136261;
  const step = Math.max(2, Math.floor(points.length / 32) * 2);
  for (let i = 0; i < points.length; i += step) {
    seed ^= Math.round(points[i] * 10) & 0xffff;
    seed = Math.imul(seed, 16777619);
  }
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Apply a brush profile to per-point base widths (one per x/y pair). */
export function brushProfileWidths(
  profile: BrushProfile,
  points: number[],
  baseWidths: number[],
): number[] {
  const n = Math.min(Math.floor(points.length / 2), baseWidths.length);
  const widths = baseWidths.slice(0, n);
  if (n < 2) return widths;
  if (profile === 'taper') {
    const t = arcParams(points);
    return widths.map((w, i) => {
      const ramp = Math.min(smoothstep(0.22, t[i]), smoothstep(0.22, 1 - t[i]));
      return Math.max(MIN_POINT_WIDTH, w * (0.18 + 0.82 * ramp));
    });
  }
  if (profile === 'chisel') {
    const nib = Math.PI / 4;
    return widths.map((w, i) => {
      const from = Math.max(0, i - 1) * 2;
      const to = Math.min(n - 1, i + 1) * 2;
      const angle = Math.atan2(points[to + 1] - points[from + 1], points[to] - points[from]);
      return Math.max(MIN_POINT_WIDTH, w * (0.35 + 0.85 * Math.abs(Math.sin(angle - nib))));
    });
  }
  const amp = profile === 'grain' ? 0.42 : 0.22;
  const rand = strokeRandom(points);
  return widths.map((w) =>
    Math.max(MIN_POINT_WIDTH, w * (1 - amp + rand() * amp * 2)),
  );
}

interface StrokeSample {
  x: number;
  y: number;
  w: number;
}

/** Pair up a flat point list with per-point widths, padding a short width list
 * with its last value and dropping near-duplicate samples (they produce
 * degenerate normals). */
function toSamples(points: number[], widths: number[]): StrokeSample[] {
  const samples: StrokeSample[] = [];
  for (let i = 0; i * 2 + 1 < points.length; i += 1) {
    const x = points[i * 2];
    const y = points[i * 2 + 1];
    const w = widths[Math.min(i, widths.length - 1)] ?? MIN_POINT_WIDTH;
    const prev = samples[samples.length - 1];
    if (prev && Math.hypot(x - prev.x, y - prev.y) < 0.05) {
      prev.w = Math.max(prev.w, w);
      continue;
    }
    samples.push({ x, y, w: Math.max(MIN_POINT_WIDTH, w) });
  }
  return samples;
}

/** One pass of a 3-tap moving average over widths, so pressure jitter between
 * consecutive samples doesn't scallop the ribbon edge. */
function smoothWidths(samples: StrokeSample[]): void {
  if (samples.length < 3) return;
  const w = samples.map((s) => s.w);
  for (let i = 1; i < samples.length - 1; i += 1) {
    samples[i].w = (w[i - 1] + w[i] + w[i + 1]) / 3;
  }
}

/** Chaikin corner cutting on the centerline (widths interpolated alongside):
 * gives the smooth curvature Konva's `tension` would, but on plain polygon
 * data the offsetting step and exporters can consume directly. */
function chaikin(samples: StrokeSample[]): StrokeSample[] {
  if (samples.length < 3) return samples;
  const out: StrokeSample[] = [samples[0]];
  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = samples[i];
    const b = samples[i + 1];
    out.push(
      { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25, w: a.w * 0.75 + b.w * 0.25 },
      { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75, w: a.w * 0.25 + b.w * 0.75 },
    );
  }
  out.push(samples[samples.length - 1]);
  return out;
}

/** Build the closed outline polygon (flat x/y list) for a variable-width
 * stroke: centerline `points` plus one width per point pair. Returns [] when
 * there is not enough geometry for a ribbon — callers fall back to a
 * constant-width line. */
export function pressureOutlinePoints(points: number[], widths: number[]): number[] {
  let samples = toSamples(points, widths);
  if (samples.length < 2) return [];
  smoothWidths(samples);
  smoothWidths(samples);
  samples = chaikin(chaikin(samples));

  const n = samples.length;
  const left: number[] = [];
  const right: number[] = [];
  const direction = (i: number): { x: number; y: number } => {
    const from = samples[Math.max(0, i - 1)];
    const to = samples[Math.min(n - 1, i + 1)];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  };

  for (let i = 0; i < n; i += 1) {
    const { x, y, w } = samples[i];
    const dir = direction(i);
    const half = w / 2;
    left.push(x - dir.y * half, y + dir.x * half);
    right.unshift(x + dir.y * half, y - dir.x * half);
  }

  // Tip points along the tangent give the ends a rounded-cap silhouette.
  const startDir = direction(0);
  const endDir = direction(n - 1);
  const start = samples[0];
  const end = samples[n - 1];
  return [
    start.x - startDir.x * (start.w / 2),
    start.y - startDir.y * (start.w / 2),
    ...left,
    end.x + endDir.x * (end.w / 2),
    end.y + endDir.y * (end.w / 2),
    ...right,
  ];
}
