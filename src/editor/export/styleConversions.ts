import type { CalqoLayer, Fill, ShadowStyle, TextStyle } from '@/lib/schema';

/** Shared geometry/style conversion helpers used by the SVG serializer and the
 * editable HTML/CSS serializer, so the two document-driven exporters never
 * drift apart (plan: five-key-features §5). */

/** Round to 2 decimals for compact, stable markup. */
export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Escape a string for XML/HTML text and attribute contexts. */
export function escapeMarkup(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** CSS background for a fill. Solid and linear/radial gradients convert
 * faithfully; pattern and image fills return null (callers fall back). */
export function fillToCss(fill: Fill): string | null {
  if (fill.type === 'solid') return fill.color;
  if (fill.type === 'linear') {
    const stops = fill.stops
      .map((stop) => `${stop.color} ${round(stop.offset * 100)}%`)
      .join(', ');
    // Calqo's linear angle is degrees clockwise from the +x axis; CSS gradient
    // angles are clockwise from the +y (up) axis.
    return `linear-gradient(${round(fill.angle + 90)}deg, ${stops})`;
  }
  if (fill.type === 'radial') {
    const stops = fill.stops
      .map((stop) => `${stop.color} ${round(stop.offset * 100)}%`)
      .join(', ');
    return `radial-gradient(circle, ${stops})`;
  }
  return null;
}

/** CSS transform for a layer's rotation (Konva rotates about the top-left
 * corner of the layer box). */
export function rotationToCss(layer: Pick<CalqoLayer, 'rotation'>): string {
  return layer.rotation
    ? `transform:rotate(${round(layer.rotation)}deg);transform-origin:top left;`
    : '';
}

/** CSS `box-shadow` / `filter: drop-shadow` value for a layer effect shadow. */
export function shadowToCssDropShadow(shadow: ShadowStyle): string {
  return `drop-shadow(${round(shadow.offsetX)}px ${round(shadow.offsetY)}px ${round(shadow.blur)}px ${shadow.color})`;
}

/** CSS `text-shadow` value for a text-style shadow. */
export function shadowToCssTextShadow(shadow: ShadowStyle): string {
  return `${round(shadow.offsetX)}px ${round(shadow.offsetY)}px ${round(shadow.blur)}px ${shadow.color}`;
}

/** Inline CSS declarations for a Calqo text style (family, size, weight, style,
 * decoration, colour, alignment, line height, letter spacing, shadow). */
export function textStyleToCss(style: TextStyle): string {
  const parts = [
    `font-family:${JSON.stringify(style.fontFamily)}, system-ui, sans-serif`,
    `font-size:${round(style.fontSize)}px`,
    `font-weight:${style.fontWeight}`,
    `color:${style.color}`,
    `text-align:${style.align}`,
    `line-height:${round(style.lineHeight)}`,
    `letter-spacing:${round(style.letterSpacing)}px`,
  ];
  if (style.fontStyle === 'italic') parts.push('font-style:italic');
  if (style.textDecoration === 'underline') parts.push('text-decoration:underline');
  if (style.shadow) parts.push(`text-shadow:${shadowToCssTextShadow(style.shadow)}`);
  if (style.stroke && style.stroke.width > 0) {
    parts.push(
      `-webkit-text-stroke:${round(style.stroke.width)}px ${style.stroke.color}`,
    );
  }
  return `${parts.join(';')};`;
}
