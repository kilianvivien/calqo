import { useEffect, useState } from 'react';
import { assetStorage } from '@/lib/adapters';
import { recolorSvg } from '@/lib/utils/svg';

export function useAssetImage(
  assetId: string | null,
  /** When set and the asset is an SVG, re-tint its fills/strokes before render. */
  tint?: string,
): {
  image: HTMLImageElement | null;
  missing: boolean;
} {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    let url: string | null = null;
    setImage(null);
    setMissing(false);
    if (!assetId) return undefined;

    void assetStorage.getAssetBlob(assetId).then(async (blob) => {
      if (!alive) return;
      if (!blob) {
        setMissing(true);
        return;
      }
      let source = blob;
      if (tint && blob.type.includes('svg')) {
        try {
          const text = await blob.text();
          source = new Blob([recolorSvg(text, tint)], { type: 'image/svg+xml' });
        } catch {
          source = blob;
        }
        if (!alive) return;
      }
      url = URL.createObjectURL(source);
      const next = new Image();
      next.onload = () => {
        if (alive) setImage(next);
      };
      next.onerror = () => {
        if (alive) setMissing(true);
      };
      next.src = url;
    });

    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [assetId, tint]);

  return { image, missing };
}
