import { useEffect, useState } from 'react';
import { assetStorage } from '@/lib/adapters';

export function useAssetImage(assetId: string | null): {
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

    void assetStorage.getAssetBlob(assetId).then((blob) => {
      if (!alive) return;
      if (!blob) {
        setMissing(true);
        return;
      }
      url = URL.createObjectURL(blob);
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
  }, [assetId]);

  return { image, missing };
}
