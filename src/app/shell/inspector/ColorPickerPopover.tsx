import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pipette } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  isStageSampling,
  isStageSamplerAvailable,
  sampleColorFromStage,
} from '@/editor/canvas/stageSampler';

interface HSV {
  h: number;
  s: number;
  v: number;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

interface EyeDropperResult {
  sRGBHex: string;
}

interface EyeDropperConstructor {
  new (): { open: () => Promise<EyeDropperResult> };
}

declare global {
  interface Window {
    EyeDropper?: EyeDropperConstructor;
  }
}

const POPOVER_WIDTH = 240;
const POPOVER_HEIGHT = 280;
const GAP = 6;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function rgbToHex({ r, g, b }: RGB): string {
  const to = (n: number) => Math.round(n * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

function hexToRgb(hex: string): RGB | null {
  const match = /^#?([\da-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >> 8) & 0xff) / 255,
    b: (n & 0xff) / 255,
  };
}

function rgbToHsv({ r, g, b }: RGB): HSV {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r1, g1, b1] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return { r: r1 + m, g: g1 + m, b: b1 + m };
}

function hsvFromHex(hex: string): HSV {
  const rgb = hexToRgb(hex);
  return rgb ? rgbToHsv(rgb) : { h: 0, s: 0, v: 0 };
}

function hexFromHsv(hsv: HSV): string {
  return rgbToHex(hsvToRgb(hsv));
}

function clampPosition(top: number, left: number) {
  const maxLeft = window.innerWidth - POPOVER_WIDTH - 8;
  const maxTop = window.innerHeight - POPOVER_HEIGHT - 8;
  return {
    top: Math.min(Math.max(8, top), Math.max(8, maxTop)),
    left: Math.min(Math.max(8, left), Math.max(8, maxLeft)),
  };
}

export function ColorPickerPopover({
  open,
  anchorRef,
  value,
  onChange,
  onClose,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  value: string;
  onChange: (hex: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('editor');
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [hsv, setHsv] = useState<HSV>(() => hsvFromHex(value));
  const [hexDraft, setHexDraft] = useState(value.toUpperCase());
  const containerRef = useRef<HTMLDivElement>(null);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setHsv(hsvFromHex(value));
    setHexDraft(value.toUpperCase());
  }, [open, value]);

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPosition(
      clampPosition(rect.bottom + GAP, rect.left + rect.width / 2 - POPOVER_WIDTH / 2),
    );
  }, [anchorRef, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      // A click on the canvas while sampling is the eyedropper at work, not a
      // dismissal — keep the popover open so the picked colour is visible.
      if (isStageSampling()) return;
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [anchorRef, onClose, open]);

  const commit = (next: HSV) => {
    setHsv(next);
    const hex = hexFromHsv(next);
    setHexDraft(hex);
    onChange(hex);
  };

  const startSvDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const node = svRef.current;
    if (!node) return;
    node.setPointerCapture(event.pointerId);
    const update = (clientX: number, clientY: number) => {
      const rect = node.getBoundingClientRect();
      commit({
        ...hsv,
        s: clamp01((clientX - rect.left) / rect.width),
        v: 1 - clamp01((clientY - rect.top) / rect.height),
      });
    };
    update(event.clientX, event.clientY);
  };

  const startHueDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const node = hueRef.current;
    if (!node) return;
    node.setPointerCapture(event.pointerId);
    const rect = node.getBoundingClientRect();
    commit({ ...hsv, h: clamp01((event.clientX - rect.left) / rect.width) * 360 });
  };

  const handleHexChange = (raw: string) => {
    setHexDraft(raw);
    const rgb = hexToRgb(raw);
    if (!rgb) return;
    const next = rgbToHsv(rgb);
    if (next.s === 0) next.h = hsv.h;
    setHsv(next);
    onChange(rgbToHex(rgb));
  };

  const pickWithEyedropper = async () => {
    // Prefer the native EyeDropper (Chromium); it samples anywhere on screen.
    if (window.EyeDropper) {
      try {
        const result = await new window.EyeDropper().open();
        handleHexChange(result.sRGBHex);
      } catch {
        /* user cancelled */
      }
      return;
    }
    // Safari/WebKit has no EyeDropper — sample from the design canvas instead.
    const hex = await sampleColorFromStage();
    if (hex) handleHexChange(hex);
  };

  if (!open || !position) return null;

  const eyedropperAvailable =
    typeof window !== 'undefined' && (!!window.EyeDropper || isStageSamplerAvailable());

  const hueColor = hexFromHsv({ h: hsv.h, s: 1, v: 1 });
  const previewColor = hexFromHsv(hsv);

  return createPortal(
    <div
      ref={containerRef}
      role="dialog"
      aria-label={t('color.pick')}
      className="glass fixed z-[60] rounded-[var(--calqo-radius-md)] bg-[var(--calqo-surface-modal)] p-3 text-[var(--calqo-text)] shadow-[0_24px_60px_rgba(0,0,0,0.38)]"
      style={{ top: position.top, left: position.left, width: POPOVER_WIDTH }}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        ref={svRef}
        onPointerDown={startSvDrag}
        onPointerMove={(event) => {
          if (event.buttons === 1) startSvDrag(event);
        }}
        className="relative h-[150px] w-full cursor-crosshair rounded-[8px]"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
          touchAction: 'none',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            background: previewColor,
          }}
        />
      </div>
      <div
        ref={hueRef}
        onPointerDown={startHueDrag}
        onPointerMove={(event) => {
          if (event.buttons === 1) startHueDrag(event);
        }}
        className="relative mt-3 h-3 w-full cursor-pointer rounded-full"
        style={{
          background:
            'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)',
          touchAction: 'none',
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
          style={{ left: `${(hsv.h / 360) * 100}%`, background: hueColor }}
        />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div
          aria-hidden
          className="h-7 w-7 shrink-0 rounded-[7px] border border-[var(--calqo-divider)]"
          style={{ background: previewColor }}
        />
        <input
          aria-label={t('color.hex')}
          value={hexDraft}
          onChange={(event) => handleHexChange(event.target.value)}
          spellCheck={false}
          className="mono min-w-0 flex-1 rounded-[7px] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] px-2 py-1.5 text-[12px] uppercase tracking-wide text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent-ring)]"
        />
        {eyedropperAvailable && (
          <button
            type="button"
            aria-label={t('color.pickFromScreen')}
            onClick={pickWithEyedropper}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] text-[var(--calqo-text-2)] transition-colors hover:text-[var(--calqo-text)]"
          >
            <Pipette size={13} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
