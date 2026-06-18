import { useEffect, useRef, useState } from 'react';
import type Konva from 'konva';
import type { TextLayer } from '@/lib/schema';

interface TextEditOverlayProps {
  layer: TextLayer;
  locale: string;
  node: Konva.Node | null;
  stageScale: number;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

export function TextEditOverlay({
  layer,
  locale,
  node,
  stageScale,
  onCommit,
  onCancel,
}: TextEditOverlayProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(
    layer.text[locale] ?? Object.values(layer.text)[0] ?? '',
  );
  const [style, setStyle] = useState<React.CSSProperties | null>(null);

  useEffect(() => {
    const textNode = node;
    const stage = textNode?.getStage();
    const container = stage?.container();
    if (!textNode || !container) return;
    if (!stage) return;
    const box = textNode.getClientRect({ relativeTo: stage });
    const containerBox = container.getBoundingClientRect();
    setStyle({
      position: 'fixed',
      left: containerBox.left + box.x,
      top: containerBox.top + box.y,
      width: Math.max(40, box.width),
      minHeight: Math.max(32, box.height),
      transform: `rotate(${layer.rotation}deg)`,
      transformOrigin: 'top left',
      fontFamily: layer.style.fontFamily,
      fontSize: layer.style.fontSize * stageScale,
      fontWeight: layer.style.fontWeight,
      lineHeight: layer.style.lineHeight,
      letterSpacing: layer.style.letterSpacing * stageScale,
      color: layer.style.color,
      textAlign: layer.style.align === 'justify' ? 'left' : layer.style.align,
    });
  }, [layer, node, stageScale]);

  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;
    textarea.focus();
    textarea.select();
  }, []);

  if (!style) return null;

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onCommit(value);
        }
      }}
      className="z-50 resize-none rounded-[var(--calqo-radius-xs)] border border-[var(--calqo-accent)] bg-white/95 p-1 outline-none ring-4 ring-[var(--calqo-accent-ring)]"
      style={style}
    />
  );
}
