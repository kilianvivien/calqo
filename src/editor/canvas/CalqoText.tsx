import { forwardRef, useImperativeHandle, useRef } from 'react';
import type Konva from 'konva';
import { Text } from 'react-konva';
import type { TextConfig } from 'konva/lib/shapes/Text';

type BaseProps = Omit<TextConfig, 'fontStyle'> & {
  fontWeight?: number | string;
  fontStyle?: TextConfig['fontStyle'];
  textDecoration?: TextConfig['textDecoration'];
  children?: React.ReactNode;
};

/** Thin react-konva wrapper that stores `fontWeight` as a custom Konva
 * attribute so the patched `_getContextFont` can include it in the canvas
 * font string. Konva 9 has no first-class fontWeight prop, so we keep it as
 * a side-channel and rely on the patch in `konvaTextFont.ts`.
 *
 * We pass `fontWeight` as a regular prop (cast to bypass Konva's TextConfig,
 * which doesn't declare the slot) so react-konva's `applyNodeProps` sets it
 * on the node as part of the normal render flow — that guarantees the node
 * is attached to a layer when the attribute is written, and react-konva
 * already calls `updatePicture` (i.e. `batchDraw`) for us. The previous
 * `useEffect` + `setAttr` path was unreliable in some WebKit builds. */
export const CalqoText = forwardRef<Konva.Text, BaseProps>(function CalqoText(
  { fontWeight, ...rest },
  ref,
) {
  const innerRef = useRef<Konva.Text | null>(null);
  useImperativeHandle(ref, () => innerRef.current as Konva.Text);
  return (
    <Text
      ref={innerRef}
      {...rest}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fontWeight={fontWeight as any}
    />
  );
});
