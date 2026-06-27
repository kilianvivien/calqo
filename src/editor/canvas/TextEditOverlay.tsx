import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type Konva from 'konva';
import type { TextStyle } from '@/lib/schema';

interface TextEditOverlayProps {
  initialValue: string;
  textStyle: TextStyle;
  rotation: number;
  /** Inset (stage units) of the editable text column from the left of the
   * node's box — used by list layers to clear the marker column. */
  insetLeft?: number;
  node: Konva.Node | null;
  stageScale: number;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

export function TextEditOverlay({
  initialValue,
  textStyle,
  rotation,
  insetLeft = 0,
  node,
  stageScale,
  onCommit,
  onCancel,
}: TextEditOverlayProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initialValue);
  const valueRef = useRef(initialValue);
  const [style, setStyle] = useState<React.CSSProperties | null>(null);

  // Keep a ref in sync so onBlur/keydown always commit the latest value even
  // if a stale render closure is active.
  const update = (next: string) => {
    valueRef.current = next;
    setValue(next);
  };

  useEffect(() => {
    const textNode = node;
    const stage = textNode?.getStage();
    const container = stage?.container();
    if (!textNode || !container || !stage) return;
    const box = textNode.getClientRect({ relativeTo: stage });
    const containerBox = container.getBoundingClientRect();
    const leftInsetPx = insetLeft * stageScale;
    setStyle({
      position: 'fixed',
      left: containerBox.left + box.x + leftInsetPx,
      top: containerBox.top + box.y,
      width: Math.max(40, box.width - leftInsetPx),
      minHeight: Math.max(32, box.height),
      transform: `rotate(${rotation}deg)`,
      transformOrigin: 'top left',
      fontFamily: textStyle.fontFamily,
      fontSize: textStyle.fontSize * stageScale,
      fontWeight: textStyle.fontWeight,
      fontStyle: textStyle.fontStyle,
      textDecoration: textStyle.textDecoration,
      lineHeight: textStyle.lineHeight,
      letterSpacing: textStyle.letterSpacing * stageScale,
      color: textStyle.color,
      textAlign: textStyle.align === 'justify' ? 'left' : textStyle.align,
      overflow: 'hidden',
    });
  }, [node, stageScale, insetLeft, textStyle, rotation]);

  // Auto-grow the textarea so every line is visible while editing. Without this
  // pressing Enter (which adds a row for lists) scrolls the new line out of view
  // and the edit feels unreliable.
  useLayoutEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [value, style]);

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.focus();
    textarea.select();
  }, []);

  if (!style) return null;

  const commit = () => onCommit(valueRef.current);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(event) => update(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          commit();
        }
      }}
      className="z-50 resize-none rounded-[var(--calqo-radius-xs)] border border-[var(--calqo-accent)] bg-white/95 p-1 outline-none ring-4 ring-[var(--calqo-accent-ring)]"
      style={style}
    />
  );
}
