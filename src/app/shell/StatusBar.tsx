import { useTranslation } from 'react-i18next';
import { CircleHelp, Settings } from 'lucide-react';
import { GlassIconButton } from '@/components/glass';
import { useActiveSaveState } from '@/lib/state/selectors';
import type { SaveState } from '@/lib/state/projectStore';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { useUiStore } from '@/lib/state/uiStore';
import { APP_VERSION } from '@/lib/appInfo';

const DOT_COLOR: Record<SaveState, string> = {
  saved: '#28c840',
  saving: '#febc2e',
  unsaved: '#febc2e',
  error: '#ff5f57',
};

const STATUS_KEY: Record<SaveState, string> = {
  saved: 'status.saved',
  saving: 'status.saving',
  unsaved: 'status.unsaved',
  error: 'status.saveFailed',
};

/** Bottom status bar — mono meta in the calm GeoCarto register. */
export function StatusBar({
  onOpenSettings,
  onOpenShortcuts,
}: {
  onOpenSettings: () => void;
  onOpenShortcuts: () => void;
}) {
  const { t } = useTranslation(['common', 'editor']);
  const save = useActiveSaveState();
  const selectedCount = useSelectionStore((s) => s.selectedLayerIds.length);
  const zoom = useUiStore((s) => s.zoom);
  const snapEnabled = useUiStore((s) => s.snapEnabled);
  const setSnapEnabled = useUiStore((s) => s.setSnapEnabled);
  const state: SaveState = save ?? 'saved';

  return (
    <footer className="flex h-7 items-center justify-between border-t border-[var(--calqo-divider)] px-4 mono text-[10.5px] text-[var(--calqo-text-3)]">
      <div className="flex items-center gap-3">
        <span title={t('common:app.versionLabel', { version: APP_VERSION })}>
          v{APP_VERSION}
        </span>
        <span className="h-3 w-px bg-[var(--calqo-divider)]" />
        <span className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{
              background: DOT_COLOR[state],
              boxShadow: `0 0 6px ${DOT_COLOR[state]}`,
            }}
          />
          {t(`editor:${STATUS_KEY[state]}`)}
        </span>
        <span className="h-3 w-px bg-[var(--calqo-divider)]" />
        <label className="flex cursor-pointer items-center gap-1.5 hover:text-[var(--calqo-text-2)]">
          <input
            type="checkbox"
            checked={snapEnabled}
            onChange={(event) => setSnapEnabled(event.target.checked)}
            className="h-3 w-3 accent-[var(--calqo-accent)]"
          />
          {t('editor:status.snap')}
        </label>
      </div>
      <div className="flex items-center gap-3">
        <span>
          {t('editor:status.selection')}: {selectedCount || '—'}
        </span>
        <span>
          {t('editor:status.zoom')}: {Math.round(zoom * 100)}%
        </span>
        <GlassIconButton
          label={t('common:shortcuts.open')}
          size={22}
          shortcut="?"
          onClick={onOpenShortcuts}
        >
          <CircleHelp size={13} />
        </GlassIconButton>
        <GlassIconButton
          label={t('common:settings.open')}
          size={22}
          onClick={onOpenSettings}
        >
          <Settings size={13} />
        </GlassIconButton>
      </div>
    </footer>
  );
}
