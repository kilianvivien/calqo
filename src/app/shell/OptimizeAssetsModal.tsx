import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shrink, X } from 'lucide-react';
import { GlassButton, GlassIconButton, ModalOverlay } from '@/components/glass';
import { assetStorage } from '@/lib/adapters';
import {
  buildAssetHealthReport,
  downscaleImageBlob,
  downscaleTargetSize,
  type AssetHealthEntry,
} from '@/editor/assets/assetHealth';
import { relinkAsset } from '@/editor/commands/projectCommands';
import { useActiveProject } from '@/lib/state/selectors';
import { useUiStore } from '@/lib/state/uiStore';

function formatBytes(bytes?: number): string {
  if (bytes === undefined) return '—';
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Rows the user can act on: assets that would actually shrink. */
function actionable(entries: AssetHealthEntry[]): AssetHealthEntry[] {
  return entries.filter((entry) => entry.canDownscale);
}

/** Per-asset, user-approved downscaling of oversized rasters. Each approved row
 * is replaced through {@link relinkAsset}, so the swap rewrites references,
 * gets a fresh id, and stays undoable — originals are never modified in place
 * (plan: five-key-features §2). */
export function OptimizeAssetsModal() {
  const { t } = useTranslation('editor');
  const open = useUiStore((s) => s.optimizeAssetsOpen);
  const setOpen = useUiStore((s) => s.setOptimizeAssetsOpen);
  const thresholds = useUiStore((s) => s.assetHealthThresholds);
  const project = useActiveProject();
  const [entries, setEntries] = useState<AssetHealthEntry[] | null>(null);
  const [approved, setApproved] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const projectId = project?.id ?? null;
  const assetSignature = project?.assets.map((ref) => ref.id).join('|') ?? '';

  useEffect(() => {
    if (!open || !project) return undefined;
    let alive = true;
    setEntries(null);
    setStatus(null);
    void (async () => {
      const bytes = new Map<string, number>();
      await Promise.all(
        project.assets.map(async (ref) => {
          const blob = await assetStorage.getAssetBlob(ref.id).catch(() => null);
          if (blob) bytes.set(ref.id, blob.size);
        }),
      );
      if (!alive) return;
      const report = actionable(buildAssetHealthReport(project, bytes, thresholds));
      setEntries(report);
      setApproved(
        Object.fromEntries(report.map((entry) => [entry.ref.id, entry.oversized])),
      );
    })();
    return () => {
      alive = false;
    };
    // Reload when the modal opens or the project's asset set changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, assetSignature]);

  if (!open || !project) return null;

  const close = () => setOpen(false);
  const selected = entries?.filter((entry) => approved[entry.ref.id]) ?? [];

  const apply = async () => {
    if (!projectId || selected.length === 0) return;
    setBusy(true);
    setStatus(null);
    try {
      for (const entry of selected) {
        const blob = await assetStorage.getAssetBlob(entry.ref.id);
        if (!blob) continue;
        const result = await downscaleImageBlob(
          blob,
          entry.recommendedMaxEdge,
          entry.ref.mimeType,
        );
        await relinkAsset(projectId, entry.ref.id, result.blob, {
          kind: 'raster',
          name: entry.ref.name,
          mimeType: result.blob.type || entry.ref.mimeType,
          width: result.width,
          height: result.height,
        });
      }
      setStatus(t('optimizeAssets.done', { count: selected.length }));
    } catch (error) {
      console.error('[Calqo] asset optimization failed', error);
      setStatus(t('optimizeAssets.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalOverlay
      open={open}
      onClose={close}
      labelledBy="optimize-assets-title"
      className="glass glass-strong flex max-h-[80vh] w-[min(620px,100%)] flex-col rounded-[28px] border border-[var(--calqo-divider)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
    >
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2
            id="optimize-assets-title"
            className="flex items-center gap-2 text-[16px] font-semibold text-[var(--calqo-text)]"
          >
            <Shrink size={17} className="text-[var(--calqo-accent)]" />
            {t('optimizeAssets.title')}
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--calqo-text-3)]">
            {t('optimizeAssets.subtitle')}
          </p>
        </div>
        <GlassIconButton label={t('export.close')} onClick={close}>
          <X size={15} />
        </GlassIconButton>
      </header>

      <div className="calqo-scroll min-h-0 flex-1 overflow-y-auto pr-1">
        {entries === null ? (
          <p className="px-1 py-8 text-center text-[13px] text-[var(--calqo-text-3)]">
            {t('optimizeAssets.loading')}
          </p>
        ) : entries.length === 0 ? (
          <p className="px-1 py-8 text-center text-[13px] text-[var(--calqo-text-3)]">
            {t('optimizeAssets.empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {entries.map((entry) => {
              const target = downscaleTargetSize(
                entry.ref.width ?? 0,
                entry.ref.height ?? 0,
                entry.recommendedMaxEdge,
              );
              return (
                <li
                  key={entry.ref.id}
                  className="flex items-center gap-3 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] p-2.5"
                >
                  <input
                    type="checkbox"
                    aria-label={t('optimizeAssets.approve', { name: entry.ref.name })}
                    checked={approved[entry.ref.id] ?? false}
                    onChange={(event) =>
                      setApproved((prev) => ({
                        ...prev,
                        [entry.ref.id]: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 shrink-0 accent-[var(--calqo-accent)]"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-medium text-[var(--calqo-text)]">
                      {entry.ref.name}
                    </p>
                    <p className="mono truncate text-[11px] text-[var(--calqo-text-3)]">
                      {entry.ref.width}×{entry.ref.height}px · {formatBytes(entry.bytes)}
                      {' → '}
                      {target.width}×{target.height}px
                    </p>
                  </div>
                  {entry.oversized && (
                    <span className="shrink-0 rounded-full bg-[#E8B339]/15 px-2 py-0.5 text-[10.5px] font-medium text-[#B7791F]">
                      {t('optimizeAssets.oversized')}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--calqo-divider)] pt-4">
        <span className="text-[12px] text-[var(--calqo-text-3)]">{status}</span>
        <div className="flex items-center gap-2">
          <GlassButton onClick={close}>{t('export.close')}</GlassButton>
          <GlassButton
            variant="primary"
            disabled={busy || selected.length === 0}
            loading={busy}
            onClick={() => void apply()}
          >
            {!busy && <Shrink size={14} />}
            {busy
              ? t('optimizeAssets.working')
              : t('optimizeAssets.apply', { count: selected.length })}
          </GlassButton>
        </div>
      </footer>
    </ModalOverlay>
  );
}
