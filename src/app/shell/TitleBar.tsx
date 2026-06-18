import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  Download,
  FilePlus2,
  FolderOpen,
  Moon,
  Redo2,
  Save,
  Share,
  Sun,
  Undo2,
} from 'lucide-react';
import { GlassButton, GlassIconButton } from '@/components/glass';
import { useHistoryStore } from '@/lib/state/historyStore';
import { useProjectStore } from '@/lib/state/projectStore';
import { useUiStore } from '@/lib/state/uiStore';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import { useActiveArtboard, useActiveProject } from '@/lib/state/selectors';
import {
  duplicateProject,
  redoProject,
  renameProject,
  undoProject,
} from '@/editor/commands/projectCommands';
import { exportProjectFile, importProjectFile } from '@/editor/export/calqoFile';
import { shareArtboardPng } from '@/editor/export/share';

/** Top chrome: Tauri-ready drag region with a centered document title and
 * global action cluster. */
export function TitleBar({
  onExport,
  onNewProject,
}: {
  onExport: () => void;
  onNewProject: () => void;
}) {
  const { t } = useTranslation(['common', 'editor']);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const project = useActiveProject();
  const artboard = useActiveArtboard();

  const handleShare = () => {
    if (!project || !artboard) return;
    void shareArtboardPng(project, artboard).catch((error) => {
      console.error('[Calqo] share failed', error);
    });
  };
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const activeProjectName = useProjectStore((s) =>
    activeProjectId ? s.projects[activeProjectId]?.name : null,
  );
  const history = useHistoryStore((s) =>
    activeProjectId ? s.histories[activeProjectId] : undefined,
  );
  const canUndo = (history?.past.length ?? 0) > 0;
  const canRedo = (history?.future.length ?? 0) > 0;

  return (
    <header
      className="flex h-11 items-center gap-3 border-b border-[var(--calqo-divider)] px-3"
      data-tauri-drag-region
    >
      <div className="flex shrink-0 items-center gap-2 pl-1">
        <img
          src="/calqo-icon.png"
          srcSet="/calqo-icon.png 1x, /calqo-icon@2x.png 2x"
          alt=""
          width={22}
          height={22}
          className="rounded-[6px]"
        />
        <span className="text-[13px] font-semibold tracking-tight text-[var(--calqo-text)]">
          {t('app.webName')}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 justify-center">
        {editingName && activeProjectId ? (
          <input
            autoFocus
            defaultValue={activeProjectName ?? ''}
            aria-label={t('editor:title.rename')}
            onFocus={(event) => event.target.select()}
            onBlur={(event) => {
              renameProject(activeProjectId, event.target.value);
              setEditingName(false);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') setEditingName(false);
            }}
            className="w-[34ch] max-w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-accent)] bg-[var(--calqo-glass)] px-3 py-1 text-center text-[13px] font-semibold text-[var(--calqo-text)] outline-none ring-2 ring-[var(--calqo-accent-ring)]"
          />
        ) : (
          <button
            type="button"
            disabled={!activeProjectId}
            title={activeProjectId ? t('editor:title.rename') : undefined}
            onClick={() => activeProjectId && setEditingName(true)}
            className="block max-w-[34ch] truncate rounded-full px-3 py-1 text-center text-[13px] font-semibold text-[var(--calqo-text)] transition-colors hover:bg-[var(--calqo-hover)] disabled:hover:bg-transparent"
          >
            {activeProjectName ?? t('app.name')}
          </button>
        )}
      </div>

      {/* Global actions. */}
      <div className="flex shrink-0 items-center justify-end gap-1">
        <GlassIconButton label={t('actions.new')} onClick={onNewProject}>
          <FilePlus2 size={16} />
        </GlassIconButton>
        <input
          ref={importInputRef}
          type="file"
          accept=".calqo,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void importProjectFile(file).catch((error) => {
                console.error('[Calqo] import failed', error);
                window.alert(t('editor:export.importFailed'));
              });
            }
            event.currentTarget.value = '';
          }}
        />
        <GlassIconButton
          label={t('editor:export.import')}
          onClick={() => importInputRef.current?.click()}
        >
          <FolderOpen size={16} />
        </GlassIconButton>
        <GlassIconButton
          label={t('editor:title.saveFile')}
          disabled={!activeProjectId}
          onClick={() => activeProjectId && void exportProjectFile(activeProjectId)}
        >
          <Save size={16} />
        </GlassIconButton>
        <span className="mx-1 h-5 w-px bg-[var(--calqo-divider)]" />
        <GlassIconButton
          label={t('actions.undo')}
          disabled={!activeProjectId || !canUndo}
          onClick={() => activeProjectId && undoProject(activeProjectId)}
        >
          <Undo2 size={16} />
        </GlassIconButton>
        <GlassIconButton
          label={t('actions.redo')}
          disabled={!activeProjectId || !canRedo}
          onClick={() => activeProjectId && redoProject(activeProjectId)}
        >
          <Redo2 size={16} />
        </GlassIconButton>
        <GlassIconButton
          label={t('actions.duplicate')}
          disabled={!activeProjectId}
          onClick={() => activeProjectId && void duplicateProject(activeProjectId)}
        >
          <Copy size={16} />
        </GlassIconButton>
        <span className="mx-1 h-5 w-px bg-[var(--calqo-divider)]" />
        <GlassIconButton
          label={t('editor:title.share')}
          disabled={!activeProjectId}
          onClick={handleShare}
        >
          <Share size={16} />
        </GlassIconButton>
        <GlassIconButton label={t('theme.toggle')} onClick={toggleTheme}>
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </GlassIconButton>
        <GlassButton
          variant="primary"
          className="ml-1"
          disabled={!activeProjectId}
          onClick={onExport}
        >
          <Download size={15} />
          {t('actions.export')}
        </GlassButton>
      </div>
    </header>
  );
}
