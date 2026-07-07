import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ImageUp, X } from 'lucide-react';
import { GlassButton, GlassIconButton } from '@/components/glass';
import { useUiStore } from '@/lib/state/uiStore';

const AUTO_DISMISS_MS = 10_000;

/** Non-blocking notice raised when an oversized raster asset is imported.
 * Points at the optimize-assets flow; never interrupts editing. */
export function AssetHealthToast() {
  const { t } = useTranslation('editor');
  const notice = useUiStore((s) => s.assetHealthNotice);
  const setNotice = useUiStore((s) => s.setAssetHealthNotice);
  const setOptimizeOpen = useUiStore((s) => s.setOptimizeAssetsOpen);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notice, setNotice]);

  if (!notice) return null;

  return (
    <div
      role="status"
      className="glass glass-strong fixed bottom-12 left-1/2 z-50 flex w-[min(460px,calc(100%-32px))] -translate-x-1/2 items-center gap-3 rounded-[var(--calqo-radius-md)] border border-[#E8B339]/40 p-3 shadow-[0_12px_48px_rgba(0,0,0,0.28)]"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--calqo-radius-sm)] bg-[#E8B339]/15 text-[#B7791F]">
        <ImageUp size={15} />
      </span>
      <p className="min-w-0 flex-1 text-[12px] text-[var(--calqo-text-2)]">
        {t('optimizeAssets.importNotice', {
          name: notice.name,
          width: notice.width,
          height: notice.height,
        })}
      </p>
      <GlassButton
        onClick={() => {
          setNotice(null);
          setOptimizeOpen(true);
        }}
      >
        {t('optimizeAssets.open')}
      </GlassButton>
      <GlassIconButton label={t('export.close')} onClick={() => setNotice(null)}>
        <X size={13} />
      </GlassIconButton>
    </div>
  );
}
