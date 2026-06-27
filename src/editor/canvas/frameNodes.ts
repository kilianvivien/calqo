import type { ImageFrame, ShadowStyle } from '@/lib/schema';

/** Symmetric-ish content inset the image is shrunk by so the frame sits around
 * the photo, not over it. */
export interface FrameInset {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** A declarative frame node, rendered by both the live renderer (react-konva)
 * and the raster export (imperative Konva) so the two never diverge. */
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
