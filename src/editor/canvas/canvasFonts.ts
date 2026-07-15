import { useEffect, useMemo, useState } from 'react';
import type { CalqoArtboard, TextStyle } from '@/lib/schema';
import { flattenLayers } from '@/editor/utils/layers';

export interface CanvasFontFace {
  family: string;
  weight: number | string;
  style: TextStyle['fontStyle'];
}

interface FontLoader {
  load(font: string, text?: string): Promise<unknown>;
}

const fontLoadCache = new Map<string, Promise<void>>();

function faceKey(face: CanvasFontFace): string {
  return `${face.style}:${face.weight}:${face.family}`;
}

function quoteFontFamily(family: string): string {
  return `"${family.replaceAll('"', '\\"')}"`;
}

/** Exact faces needed to render one artboard, including nested group layers. */
export function collectCanvasFontFaces(
  artboard: CalqoArtboard,
): CanvasFontFace[] {
  const faces = new Map<string, CanvasFontFace>();
  for (const layer of flattenLayers(artboard.layers)) {
    if (layer.type !== 'text' && layer.type !== 'list') continue;
    const face = {
      family: layer.style.fontFamily,
      weight: layer.style.fontWeight,
      style: layer.style.fontStyle,
    } satisfies CanvasFontFace;
    faces.set(faceKey(face), face);
  }
  return [...faces.values()].sort((a, b) =>
    faceKey(a).localeCompare(faceKey(b)),
  );
}

/** Load every face before Konva performs its first text measurement. Canvas
 * does not repaint itself when a web font finishes downloading, so allowing a
 * fallback first paint makes the next click appear to change typography. */
export function loadCanvasFontFaces(
  faces: CanvasFontFace[],
  loader: FontLoader | undefined = typeof document === 'undefined'
    ? undefined
    : document.fonts,
): Promise<void> {
  if (!loader || faces.length === 0) return Promise.resolve();
  const signature = faces.map(faceKey).join('|');
  const cached = fontLoadCache.get(signature);
  if (cached) return cached;

  const pending = Promise.allSettled(
    faces.map((face) =>
      loader.load(
        `${face.style} ${face.weight} 16px ${quoteFontFamily(face.family)}`,
        'BESbswy',
      ),
    ),
  ).then(() => undefined);
  fontLoadCache.set(signature, pending);
  return pending;
}

/** True only once all faces used by the current artboard have settled. The
 * signature comparison gates synchronously when switching artboards, avoiding
 * a one-frame fallback flash before the loading effect runs. */
export function useCanvasFontsReady(artboard: CalqoArtboard): boolean {
  const faces = useMemo(() => collectCanvasFontFaces(artboard), [artboard]);
  const signature = faces.map(faceKey).join('|');
  const hasLoader = typeof document !== 'undefined' && Boolean(document.fonts);
  const [loadedSignature, setLoadedSignature] = useState<string | null>(null);

  useEffect(() => {
    if (!hasLoader || signature.length === 0) return;
    let active = true;
    void loadCanvasFontFaces(faces).then(() => {
      if (active) setLoadedSignature(signature);
    });
    return () => {
      active = false;
    };
  }, [faces, hasLoader, signature]);

  return !hasLoader || signature.length === 0 || loadedSignature === signature;
}
