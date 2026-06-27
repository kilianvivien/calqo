import type { ImageFrame, ShadowStyle } from '@/lib/schema';

/** Symmetric-ish content inset the image is shrunk by so the frame sits around
 * the photo, not over it. */
export interface FrameInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** A declarative frame node, rendered by the live renderer (react-konva), the
 * raster export (imperative Konva), and the SVG export so the three never
 * diverge. */
export type FrameNodeSpec =
  | {
      kind: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      cornerRadius?: number;
      /** Dash pattern (perforations / tape edges). */
      dash?: number[];
      /** Rotation in degrees about the rect's top-left corner. */
      rotation?: number;
      opacity?: number;
      shadow?: ShadowStyle;
    }
  | {
      kind: 'ellipse';
      x: number;
      y: number;
      w: number;
      h: number;
      stroke: string;
      strokeWidth: number;
      shadow?: ShadowStyle;
    }
  | {
      kind: 'path';
      /** SVG path data, shared verbatim by Konva.Path and the SVG export. */
      data: string;
      fill?: string;
      stroke?: string;
      strokeWidth?: number;
      opacity?: number;
      shadow?: ShadowStyle;
    }
  | {
      kind: 'caption';
      x: number;
      y: number;
      w: number;
      h: number;
      text: string;
      color: string;
      fontSize: number;
    };

export interface FrameRender {
  /** How far to inset the image content on each edge. */
  inset: FrameInset;
  /** Drawn behind the image content (e.g. polaroid card background). */
  behind: FrameNodeSpec[];
  /** Drawn in front of the image content (border strokes, caption). */
  front: FrameNodeSpec[];
}

function uniformInset(value: number): FrameInset {
  return { top: value, right: value, bottom: value, left: value };
}

/** Round a number for compact, stable path data. */
function r(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Build a closed rounded-scallop outline around a `w`×`h` box. `scallop` is the
 * bump radius. Deterministic, so live / raster / SVG render identically. */
function scallopPath(w: number, h: number, scallop: number): string {
  const radius = Math.max(6, scallop);
  const segs = (len: number) => Math.max(1, Math.round(len / (radius * 2)));
  const parts: string[] = [`M 0 0`];
  // top edge → right edge → bottom edge → left edge, each a row of outward arcs.
  const run = (n: number, dx: number, dy: number) => {
    const sx = dx / n;
    const sy = dy / n;
    for (let i = 0; i < n; i++) {
      // sweep flag 0 bulges outward relative to walking direction.
      parts.push(`a ${r(radius)} ${r(radius)} 0 0 1 ${r(sx)} ${r(sy)}`);
    }
  };
  run(segs(w), w, 0);
  run(segs(h), 0, h);
  run(segs(w), -w, 0);
  run(segs(h), 0, -h);
  parts.push('Z');
  return parts.join(' ');
}

/** Build a closed jagged "torn paper" outline around a `w`×`h` box. `jag` is the
 * tear depth. Uses a fixed seed so every render matches. */
function tearPath(w: number, h: number, jag: number): string {
  const depth = Math.max(4, jag);
  // Cheap deterministic PRNG (mulberry32) seeded by a constant.
  let s = 0x9e3779b9;
  const rand = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pts: Array<[number, number]> = [];
  const step = depth * 1.6;
  const edge = (x0: number, y0: number, x1: number, y1: number, inward: [number, number]) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const jx = inward[0] * rand() * depth;
      const jy = inward[1] * rand() * depth;
      pts.push([x0 + (x1 - x0) * t + jx, y0 + (y1 - y0) * t + jy]);
    }
  };
  edge(0, 0, w, 0, [0, 1]);
  edge(w, 0, w, h, [-1, 0]);
  edge(w, h, 0, h, [0, -1]);
  edge(0, h, 0, 0, [1, 0]);
  return (
    `M ${r(pts[0][0])} ${r(pts[0][1])} ` +
    pts
      .slice(1)
      .map(([x, y]) => `L ${r(x)} ${r(y)}`)
      .join(' ') +
    ' Z'
  );
}

/** Build the frame geometry for an image layer of size `w`×`h`. `caption` is the
 * resolved active-locale caption string (polaroid only). */
export function frameRender(frame: ImageFrame, w: number, h: number, caption = ''): FrameRender {
  const width = frame.width;
  const color = frame.color;
  const padding = frame.padding ?? 0;

  switch (frame.kind) {
    case 'centered': {
      // Stroke centred on the box edge: half sits outside, half over content.
      return {
        inset: uniformInset(width / 2),
        behind: [],
        front: [{ kind: 'rect', x: 0, y: 0, w, h, stroke: color, strokeWidth: width, shadow: frame.shadow }],
      };
    }
    case 'outside': {
      return {
        inset: uniformInset(0),
        behind: [
          {
            kind: 'rect',
            x: -width / 2,
            y: -width / 2,
            w: w + width,
            h: h + width,
            stroke: color,
            strokeWidth: width,
            shadow: frame.shadow,
          },
        ],
        front: [],
      };
    }
    case 'rounded': {
      const inset = width;
      return {
        inset: uniformInset(inset),
        behind: [],
        front: [
          {
            kind: 'rect',
            x: width / 2,
            y: width / 2,
            w: w - width,
            h: h - width,
            stroke: color,
            strokeWidth: width,
            cornerRadius: frame.radius ?? 24,
            shadow: frame.shadow,
          },
        ],
      };
    }
    case 'circle': {
      const inset = width;
      return {
        inset: uniformInset(inset),
        behind: [],
        front: [
          {
            kind: 'ellipse',
            x: 0,
            y: 0,
            w,
            h,
            stroke: color,
            strokeWidth: width,
            shadow: frame.shadow,
          },
        ],
      };
    }
    case 'double-line': {
      const innerWidth = Math.max(1, width / 2);
      const inset = width + padding + innerWidth;
      return {
        inset: uniformInset(inset),
        behind: [],
        front: [
          { kind: 'rect', x: width / 2, y: width / 2, w: w - width, h: h - width, stroke: color, strokeWidth: width, shadow: frame.shadow },
          {
            kind: 'rect',
            x: width + padding + innerWidth / 2,
            y: width + padding + innerWidth / 2,
            w: w - 2 * (width + padding) - innerWidth,
            h: h - 2 * (width + padding) - innerWidth,
            stroke: color,
            strokeWidth: innerWidth,
          },
        ],
      };
    }
    case 'polaroid': {
      // White card; thicker bottom strip for the caption.
      const side = width;
      const captionStrip = Math.max(width * 2.5, 48);
      const inset: FrameInset = { top: side, right: side, bottom: captionStrip, left: side };
      const behind: FrameNodeSpec[] = [
        { kind: 'rect', x: 0, y: 0, w, h, fill: color, shadow: frame.shadow },
      ];
      const front: FrameNodeSpec[] = [];
      if (caption) {
        front.push({
          kind: 'caption',
          x: side,
          y: h - captionStrip,
          w: w - side * 2,
          h: captionStrip,
          text: caption,
          color: '#111827',
          fontSize: Math.min(captionStrip * 0.42, 28),
        });
      }
      return { inset, behind, front };
    }
    case 'soft-mat': {
      // Thick filled mat the photo sits inside, with a thin inner bevel line.
      const mat = width + padding;
      return {
        inset: uniformInset(mat),
        behind: [{ kind: 'rect', x: 0, y: 0, w, h, fill: color, shadow: frame.shadow }],
        front: [
          {
            kind: 'rect',
            x: mat - 1.5,
            y: mat - 1.5,
            w: w - 2 * mat + 3,
            h: h - 2 * mat + 3,
            stroke: 'rgba(0,0,0,0.18)',
            strokeWidth: 1.5,
          },
        ],
      };
    }
    case 'thick-poster-border': {
      // Heavy outer border with a hairline echo just inside it.
      const inner = Math.max(2, width * 0.18);
      const gap = Math.max(width * 0.4, 8);
      return {
        inset: uniformInset(width),
        behind: [],
        front: [
          { kind: 'rect', x: width / 2, y: width / 2, w: w - width, h: h - width, stroke: color, strokeWidth: width, shadow: frame.shadow },
          {
            kind: 'rect',
            x: width + gap,
            y: width + gap,
            w: w - 2 * (width + gap),
            h: h - 2 * (width + gap),
            stroke: color,
            strokeWidth: inner,
          },
        ],
      };
    }
    case 'shadowed-cutout': {
      // Small white border + a strong drop shadow, like a lifted cutout.
      const border = Math.max(2, width);
      return {
        inset: uniformInset(border),
        behind: [
          {
            kind: 'rect',
            x: 0,
            y: 0,
            w,
            h,
            fill: color,
            shadow: frame.shadow ?? { color: '#000000', blur: 24, offsetX: 0, offsetY: 14, opacity: 0.35 },
          },
        ],
        front: [],
      };
    }
    case 'tape-corners': {
      // Photo sits flush; translucent tape strips pin the corners.
      const tape = Math.max(width * 4, 56);
      const tw = tape;
      const th = Math.max(width * 1.4, 20);
      const o = 0.7;
      const corner = (x: number, y: number, rot: number): FrameNodeSpec => ({
        kind: 'rect',
        x,
        y,
        w: tw,
        h: th,
        fill: color,
        opacity: o,
        rotation: rot,
        shadow: frame.shadow,
      });
      return {
        inset: uniformInset(0),
        behind: [],
        front: [
          corner(-tw * 0.32, th * 0.4, -45),
          corner(w - tw * 0.68, -th * 0.4, 45),
          corner(-tw * 0.32, h - th * 1.4, 45),
          corner(w - tw * 0.68, h - th * 0.6, -45),
        ],
      };
    }
    case 'postage-stamp': {
      // White stamp paper with a perforated dotted ring around the photo edge.
      const dot = Math.max(2, width * 0.5);
      return {
        inset: uniformInset(width),
        behind: [{ kind: 'rect', x: 0, y: 0, w, h, fill: color, shadow: frame.shadow }],
        front: [
          {
            kind: 'rect',
            x: width * 0.55,
            y: width * 0.55,
            w: w - width * 1.1,
            h: h - width * 1.1,
            stroke: 'rgba(0,0,0,0.45)',
            strokeWidth: dot,
            dash: [0.1, dot * 2.4],
          },
        ],
      };
    }
    case 'scalloped-edges': {
      const scallop = frame.radius ?? Math.max(14, width);
      const inset = scallop + padding;
      return {
        inset: uniformInset(inset),
        behind: [
          {
            kind: 'path',
            data: scallopPath(w, h, scallop),
            fill: color,
            shadow: frame.shadow,
          },
        ],
        front: [],
      };
    }
    case 'torn-paper': {
      const jag = Math.max(8, width);
      return {
        inset: uniformInset(jag + padding),
        behind: [
          {
            kind: 'path',
            data: tearPath(w, h, jag),
            fill: color,
            shadow: frame.shadow,
          },
        ],
        front: [],
      };
    }
    case 'photo-booth-strip': {
      // Tall white card with film sprocket holes down each side.
      const side = width;
      const top = Math.max(width * 1.6, 28);
      const captionStrip = caption ? Math.max(width * 2.5, 48) : top;
      const inset: FrameInset = { top, right: side, bottom: captionStrip, left: side };
      const behind: FrameNodeSpec[] = [{ kind: 'rect', x: 0, y: 0, w, h, fill: color, shadow: frame.shadow }];
      const front: FrameNodeSpec[] = [];
      const hole = Math.max(4, side * 0.32);
      const holeGap = hole * 2.2;
      const count = Math.max(2, Math.floor((h - top) / holeGap));
      for (let i = 0; i < count; i++) {
        const cy = top + holeGap * 0.5 + i * holeGap;
        if (cy > h - captionStrip * 0.5) break;
        front.push(
          { kind: 'rect', x: side * 0.5 - hole / 2, y: cy - hole / 2, w: hole, h: hole, fill: '#1f2937', cornerRadius: hole * 0.3 },
          { kind: 'rect', x: w - side * 0.5 - hole / 2, y: cy - hole / 2, w: hole, h: hole, fill: '#1f2937', cornerRadius: hole * 0.3 },
        );
      }
      if (caption) {
        front.push({
          kind: 'caption',
          x: side,
          y: h - captionStrip,
          w: w - side * 2,
          h: captionStrip,
          text: caption,
          color: '#111827',
          fontSize: Math.min(captionStrip * 0.42, 28),
        });
      }
      return { inset, behind, front };
    }
    case 'inset':
    default: {
      return {
        inset: uniformInset(width),
        behind: [],
        front: [
          {
            kind: 'rect',
            x: width / 2,
            y: width / 2,
            w: w - width,
            h: h - width,
            stroke: color,
            strokeWidth: width,
            shadow: frame.shadow,
          },
        ],
      };
    }
  }
}
