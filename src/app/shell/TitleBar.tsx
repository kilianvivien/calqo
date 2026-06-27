import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Copy,
  Download,
  FilePlus2,
  Files,
  FolderOpen,
  Github,
  Languages,
  Moon,
  Redo2,
  Save,
  Share,
  Sparkles,
  Sun,
  Undo2,
} from 'lucide-react';
import { GlassButton, GlassIconButton } from '@/components/glass';
import { isTauri } from '@/lib/platform/runtime';
import { invokeAppCommandSync } from '@/app/commands/appCommands';
import { useHistoryStore } from '@/lib/state/historyStore';
import { useProjectStore } from '@/lib/state/projectStore';
import { useUiStore } from '@/lib/state/uiStore';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import { isAiEnabled, useAiSettingsStore } from '@/editor/ai/aiSettings';
import {
  renameProject,
} from '@/editor/commands/projectCommands';
import { importProjectFile } from '@/editor/export/calqoFile';
import {
  ImportRecoveryModal,
  type ImportRecovery,
} from './ImportRecoveryModal';

/** Top chrome: Tauri-ready drag region with a centered document title and
 * global action cluster. */
export function TitleBar() {
  const { t } = useTranslation(['common', 'editor']);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [editingName, setEditingName] = useState(false);
  const [importFailure, setImportFailure] = useState<ImportRecovery | null>(null);

  const theme = useUiStore((s) => s.theme);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const aiEnabled = useAiSettingsStore((s) => isAiEnabled(s.settings));
  const activeProjectName = useProjectStore((s) =>
    activeProjectId ? s.projects[activeProjectId]?.name : null,
  );
  const history = useHistoryStore((s) =>
    activeProjectId ? s.histories[activeProjectId] : undefined,
  );
  const canUndo = (history?.past.length ?? 0) > 0;
  const canRedo = (history?.future.length ?? 0) > 0;

  useEffect(() => {
    const openImport = () => importInputRef.current?.click();
    window.addEventListener('calqo:open-import', openImport);
    return () => window.removeEventListener('calqo:open-import', openImport);
  }, []);

  return (
    <header
      className="flex h-11 items-center gap-3 border-b border-[var(--calqo-divider)] pr-3"
      style={{ paddingLeft: isTauri ? 'var(--calqo-titlebar-leading)' : '12px' }}
      data-tauri-drag-region
    >
      {!isTauri && (
        <div className="flex shrink-0 items-center gap-2" data-tauri-drag-region>
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
      )}

      <div className="flex min-w-0 flex-1 justify-center" data-tauri-drag-region>
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
      <div
        className="flex shrink-0 items-center justify-end gap-1"
        data-tauri-drag-region
      >
        <GlassIconButton
          label={t('actions.new')}
          onClick={() => invokeAppCommandSync('file.new')}
        >
          <FilePlus2 size={16} />
        </GlassIconButton>
        <GlassIconButton
          label={t('editor:projects.title')}
          onClick={() => invokeAppCommandSync('file.manage')}
        >
          <Files size={16} />
        </GlassIconButton>
        <input
          ref={importInputRef}
          type="file"
          accept=".calqo,application/json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void importProjectFile(file).catch(async (error) => {
                console.error('[Calqo] import failed', error);
                const rawText = await file.text().catch(() => '');
                setImportFailure({
                  filename: file.name,
                  rawText,
                  message:
                    error instanceof Error
                      ? error.message
                      : t('editor:export.importFailed'),
                });
              });
            }
            event.currentTarget.value = '';
          }}
        />
        <GlassIconButton
          label={t('editor:export.import')}
          onClick={() => invokeAppCommandSync('file.open')}
        >
          <FolderOpen size={16} />
        </GlassIconButton>
        <GlassIconButton
          label={t('editor:title.saveFile')}
          disabled={!activeProjectId}
          onClick={() => invokeAppCommandSync('file.saveAs')}
        >
          <Save size={16} />
        </GlassIconButton>
        <span className="mx-1 h-5 w-px bg-[var(--calqo-divider)]" />
        <GlassIconButton
          label={t('actions.undo')}
          disabled={!activeProjectId || !canUndo}
          onClick={() => invokeAppCommandSync('edit.undo')}
        >
          <Undo2 size={16} />
        </GlassIconButton>
        <GlassIconButton
          label={t('actions.redo')}
          disabled={!activeProjectId || !canRedo}
          onClick={() => invokeAppCommandSync('edit.redo')}
        >
          <Redo2 size={16} />
        </GlassIconButton>
        <GlassIconButton
          label={t('actions.duplicate')}
          disabled={!activeProjectId}
          onClick={() => invokeAppCommandSync('edit.duplicate')}
        >
          <Copy size={16} />
        </GlassIconButton>
        <span className="mx-1 h-5 w-px bg-[var(--calqo-divider)]" />
        <GlassIconButton
          label={aiEnabled ? t('editor:ai.promptTemplate') : t('editor:ai.disabledHint')}
          softDisabled={!aiEnabled}
          onClick={() => invokeAppCommandSync('ai.promptTemplate')}
        >
          <Sparkles size={16} />
        </GlassIconButton>
        <GlassIconButton
          label={aiEnabled ? t('editor:ai.translate') : t('editor:ai.disabledHint')}
          softDisabled={!aiEnabled}
          disabled={aiEnabled && !activeProjectId}
          onClick={() => invokeAppCommandSync('ai.translate')}
        >
          <Languages size={16} />
        </GlassIconButton>
        <span className="mx-1 h-5 w-px bg-[var(--calqo-divider)]" />
        <GlassIconButton
          label={t('editor:title.share')}
          disabled={!activeProjectId}
          onClick={() => invokeAppCommandSync('file.share')}
        >
          <Share size={16} />
        </GlassIconButton>
        <GlassIconButton
          label={t('theme.toggle')}
          onClick={() => invokeAppCommandSync('view.theme')}
        >
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </GlassIconButton>
        <GlassButton
          variant="primary"
          className="ml-1 shadow-none"
          disabled={!activeProjectId}
          onClick={() => invokeAppCommandSync('file.export')}
        >
          <Download size={15} />
          {t('actions.export')}
        </GlassButton>
        <GlassIconButton
          label={t('editor:title.github')}
          onClick={() => invokeAppCommandSync('help.github')}
        >
          <Github size={16} />
        </GlassIconButton>
      </div>
      <ImportRecoveryModal
        failure={importFailure}
        onClose={() => setImportFailure(null)}
      />
    </header>
  );
}
