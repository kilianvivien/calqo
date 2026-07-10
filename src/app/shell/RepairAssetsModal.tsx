import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileWarning, ImageOff, Link2, Trash2, X } from 'lucide-react';
import { GlassButton, GlassIconButton, ModalOverlay } from '@/components/glass';
import {
  relinkAsset,
  removeLayersForAsset,
} from '@/editor/commands/projectCommands';
import { measureImageFile } from '@/lib/utils/imageAsset';
import {
  refreshMissingAssets,
  useMissingAssetsStore,
} from '@/editor/assets/missingAssetsStore';
import type { MissingAsset } from '@/editor/assets/missingAssets';
import { useActiveProject } from '@/lib/state/selectors';
import { projectStore } from '@/lib/state/projectStore';
import { useUiStore } from '@/lib/state/uiStore';

// Stable fallback so the store selector never mints a new array per snapshot
// (a fresh [] would loop useSyncExternalStore re-renders).
const NO_MISSING: MissingAsset[] = [];

function refSummary(item: MissingAsset): string {
  const names = item.layerRefs.map((ref) =>
    ref.layerName
      ? `${ref.layerName} (${ref.artboardName})`
      : ref.artboardName,
  );
  return [...new Set(names)].join(', ');
}

/** Repair broken asset references: relink each missing asset to a replacement
 * file, remove the layers that use it, or keep the canvas placeholder. Never
 * blocks editing — it is a dismissable modal (plan: five-key-features §1). */
export function RepairAssetsModal() {
  const { t } = useTranslation('editor');
  const open = useUiStore((s) => s.repairAssetsOpen);
  const setOpen = useUiStore((s) => s.setRepairAssetsOpen);
  const project = useActiveProject();
  const missing =
    useMissingAssetsStore((s) =>
      project ? s.byProject[project.id] : undefined,
    ) ?? NO_MISSING;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<MissingAsset | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open || !project) return null;

  const close = () => setOpen(false);

  const pickReplacement = (item: MissingAsset) => {
    setPending(item);
    fileInputRef.current?.click();
  };

  // Re-detect against the post-command project state — the render-scope
  // `project` still holds the broken reference the command just rewrote.
  const refresh = () =>
    refreshMissingAssets(projectStore.getState().projects[project.id] ?? project);

  const handleFile = async (file: File) => {
    if (!pending) return;
    setBusy(true);
    try {
      const kind = file.type === 'image/svg+xml' ? 'svg' : 'raster';
      const measured = await measureImageFile(file);
      await relinkAsset(project.id, pending.assetId, file, {
        kind,
        name: file.name,
        mimeType: file.type,
        width: measured.width,
        height: measured.height,
      });
      await refresh();
    } finally {
      setPending(null);
      setBusy(false);
    }
  };

  const removeLayers = async (item: MissingAsset) => {
    removeLayersForAsset(project.id, item.assetId);
    await refresh();
  };

  return (
    <ModalOverlay
      open={open}
      onClose={close}
      labelledBy="repair-assets-title"
      className="glass glass-strong flex max-h-[80vh] w-[min(560px,100%)] flex-col rounded-[28px] border border-[var(--calqo-divider)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
    >
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2
            id="repair-assets-title"
            className="flex items-center gap-2 text-[16px] font-semibold text-[var(--calqo-text)]"
          >
            <FileWarning size={17} className="text-[#B7791F]" />
            {t('repairAssets.title')}
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--calqo-text-3)]">
            {t('repairAssets.subtitle', { count: missing.length })}
          </p>
        </div>
        <GlassIconButton label={t('export.close')} onClick={close}>
          <X size={15} />
        </GlassIconButton>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        accept={pending?.kind === 'svg' ? '.svg,image/svg+xml' : 'image/*'}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.currentTarget.value = '';
        }}
      />

      <div className="calqo-scroll min-h-0 flex-1 overflow-y-auto pr-1">
        {missing.length === 0 ? (
          <p className="px-1 py-8 text-center text-[13px] text-[var(--calqo-text-3)]">
            {t('repairAssets.allResolved')}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {missing.map((item) => (
              <li
                key={item.assetId}
                className="flex items-center gap-3 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] p-2.5"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--calqo-radius-sm)] border border-[#FF5F57]/40 bg-[#FF5F57]/10 text-[#B42318]">
                  <ImageOff size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-[var(--calqo-text)]">
                    {item.name ?? t('repairAssets.unknownAsset', { kind: item.kind })}
                  </p>
                  <p className="truncate text-[11px] text-[var(--calqo-text-3)]">
                    {t('repairAssets.usedBy', { layers: refSummary(item) })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <GlassButton disabled={busy} onClick={() => pickReplacement(item)}>
                    <Link2 size={13} />
                    {t('repairAssets.relink')}
                  </GlassButton>
                  <GlassIconButton
                    label={t('repairAssets.removeLayers')}
                    disabled={busy}
                    onClick={() => void removeLayers(item)}
                  >
                    <Trash2 size={14} />
                  </GlassIconButton>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--calqo-divider)] pt-4">
        <p className="text-[11px] text-[var(--calqo-text-3)]">
          {t('repairAssets.keepHint')}
        </p>
        <GlassButton onClick={close}>{t('repairAssets.keepPlaceholders')}</GlassButton>
      </footer>
    </ModalOverlay>
  );
}
