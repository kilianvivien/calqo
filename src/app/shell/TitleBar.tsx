import { useTranslation } from 'react-i18next';
import {
  Copy,
  Download,
  FilePlus2,
  Moon,
  Redo2,
  Save,
  Sun,
  Undo2,
} from 'lucide-react';
import { GlassButton, GlassIconButton } from '@/components/glass';
import { useHistoryStore } from '@/lib/state/historyStore';
import { useProjectStore } from '@/lib/state/projectStore';
import { useUiStore } from '@/lib/state/uiStore';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import {
  createProject,
  duplicateProject,
  redoProject,
  saveProject,
  undoProject,
} from '@/editor/commands/projectCommands';

/** Top chrome: Tauri-ready drag region with a centered document title and
 * global action cluster. */
export function TitleBar() {
  const { t } = useTranslation(['common', 'editor']);
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
      className="grid h-11 grid-cols-[1fr_auto_1fr] items-center border-b border-[var(--calqo-divider)] px-3"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-2 justify-self-start pl-1">
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

      <div className="min-w-0 justify-self-center rounded-full px-3 py-1 transition-colors hover:bg-[var(--calqo-hover)]">
        <span className="block max-w-[34ch] truncate text-center text-[13px] font-semibold text-[var(--calqo-text)]">
          {activeProjectName ?? t('app.name')}
        </span>
      </div>

      {/* Global actions. */}
      <div className="flex items-center justify-end gap-1">
        <GlassIconButton
          label={t('actions.new')}
          onClick={() => void createProject()}
        >
          <FilePlus2 size={16} />
        </GlassIconButton>
        <GlassIconButton
          label={t('actions.save')}
          disabled={!activeProjectId}
          onClick={() => activeProjectId && void saveProject(activeProjectId)}
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
        <GlassIconButton label={t('theme.toggle')} onClick={toggleTheme}>
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </GlassIconButton>
        <GlassButton variant="primary" className="ml-1" disabled={!activeProjectId}>
          <Download size={15} />
          {t('actions.export')}
        </GlassButton>
      </div>
    </header>
  );
}
