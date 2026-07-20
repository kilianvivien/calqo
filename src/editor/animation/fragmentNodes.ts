import { Group } from 'konva/lib/Group';
import { Text } from 'konva/lib/shapes/Text';
import type { CalqoLayer, TextStyle } from '@/lib/schema';
import type { LayerBox } from './wrapperNode';
import type { CompiledFragmentAnimation } from './types';

/**
 * Shared text-reveal fragment rendering (AN-3.5). A text/list layer whose enter
 * slot is a reveal preset is drawn as one Konva node per fragment (character for
 * typewriter, word for word-rise), each nested in its own animation sub-wrapper
 * `Group`. Both the live canvas (`useAnimationPlayback`) and the offscreen MP4
 * scene build the exact same nodes from the same {@link CompiledFragmentAnimation}
 * that the HTML/CSS exporter reads, so all three renderers agree.
 *
 * The container sits where the layer's base text node would (same layer-local
 * origin), so the settled state (every fragment revealed) reproduces the static
 * layout. Sub-wrapper transforms compose around each fragment's centre, matching
 * `wrapperNode`/the CSS `transform-origin`.
 */

/** One fragment's render inputs, independent of Konva — unit-testable. */
export interface FragmentNodeSpec {
  index: number;
  text: string;
  /** Fragment box in layer-local coordinates. */
  box: LayerBox;
}

/** Pure: the ordered fragment specs a renderer turns into nodes. */
export function fragmentNodeSpecs(
  fragmentAnim: CompiledFragmentAnimation,
): FragmentNodeSpec[] {
  return fragmentAnim.fragments.map((f, index) => ({
    index,
    text: f.text,
    box: { x: f.x, y: f.y, w: f.w, h: f.h },
  }));
}

/** The typography a fragment Text node needs, drawn from the layer style. */
function textAttrs(style: TextStyle) {
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontStyle: style.fontStyle,
    textDecoration: style.textDecoration,
    // Read by the konvaTextFont patch (Konva has no fontWeight prop).
    fontWeight: style.fontWeight,
    letterSpacing: style.letterSpacing,
    fill: style.color,
    stroke: style.stroke?.color,
    strokeWidth: style.stroke?.width ?? 0,
    shadowColor: style.shadow?.color,
    shadowBlur: style.shadow?.blur,
    shadowOffsetX: style.shadow?.offsetX,
    shadowOffsetY: style.shadow?.offsetY,
    shadowOpacity: style.shadow?.opacity,
  };
}

export interface FragmentNodeHandles {
  /** Container to place where the layer's base text node would sit. */
  container: Group;
  /** Per-fragment sub-wrapper groups, index-aligned with the compiled fragments. */
  wrappers: Group[];
  /** Fragment boxes (layer-local) for {@link wrapperNode.applyWrapperOverride}. */
  boxes: LayerBox[];
}

/** The layer's text style, or null when it carries no reveal-eligible text. */
function revealStyle(layer: CalqoLayer): TextStyle | null {
  if (layer.type === 'text' || layer.type === 'list') return layer.style;
  return null;
}

/**
 * Build the Konva fragment container for a reveal-animated text/list layer. Each
 * fragment is a `Text` at its layer-local box inside an identity sub-wrapper the
 * playback/export loop drives. Returns null for a non-text layer.
 */
export function buildFragmentContainer(
  layer: CalqoLayer,
  fragmentAnim: CompiledFragmentAnimation,
): FragmentNodeHandles | null {
  const style = revealStyle(layer);
  if (!style) return null;

  const container = new Group({ listening: false });
  const wrappers: Group[] = [];
  const boxes: LayerBox[] = [];
  const attrs = textAttrs(style);

  for (const fragment of fragmentAnim.fragments) {
    const wrapper = new Group();
    // The Text sits at the fragment box; the sub-wrapper animates around it.
    wrapper.add(
      new Text({ x: fragment.x, y: fragment.y, text: fragment.text, ...attrs }),
    );
    container.add(wrapper);
    wrappers.push(wrapper);
    boxes.push({ x: fragment.x, y: fragment.y, w: fragment.w, h: fragment.h });
  }

  return { container, wrappers, boxes };
}
