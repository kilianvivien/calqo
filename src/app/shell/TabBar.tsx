import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import { useProjectStore } from '@/lib/state/projectStore';
import {
  createProject,
  requestCloseProject,
  renameProject,
} from '@/editor/commands/projectCommands';
import { cn } from '@/lib/utils/cn';

/** Project tab strip. Tabs reflect open documents; double-click to rename, the
 * × closes (flushing a save first). The + opens a fresh project. */
export function TabBar() {
  const { t } = useTranslation(['common', 'editor']);
  const openTabIds = useWorkspaceStore((s) => s.openTabIds);
  const activeId = useWorkspaceStore((s) => s.activeProjectId);
  const setActiveTab = useWorkspaceStore((s) => s.setActiveTab);
  const projects = useProjectStore((s) => s.projects);
  const saveState = useProjectStore((s) => s.saveState);
  const [editingId, setEditingId] = useState<string | null>(null);

  /** Warn before closing a tab with unsaved changes (plan §0 polish). */
  const requestClose = (id: string, name: string) => {
    void requestCloseProject(id, {
      title: t('editor:tabs.unsavedTitle'),
      message: t('editor:tabs.unsavedMessage', { name }),
    });
  };

  return (
    <div className="flex h-9 items-center gap-1 overflow-x-auto border-b border-[var(--calqo-divider)] px-2 calqo-scroll">
      {openTabIds.map((id) => {
        const project = projects[id];
        if (!project) return null;
        const active = id === activeId;
        const dirty = saveState[id] === 'unsaved' || saveState[id] === 'saving';

        return (
          <div
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => setActiveTab(id)}
            onDoubleClick={() => setEditingId(id)}
            className={cn(
              'group flex h-7 shrink-0 items-center gap-2 rounded-[var(--calqo-radius-sm)] px-2.5 text-[12px] cursor-default',
              'transition-colors duration-[var(--calqo-t-fast)]',
              active
                ? 'bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)] outline outline-[0.5px] outline-[var(--calqo-accent-ring)]'
                : 'text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]',
            )}
          >
            {editingId === id ? (
              <input
                autoFocus
                defaultValue={project.name}
                onBlur={(e) => {
                  renameProject(id, e.target.value);
                  setEditingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditingId(null);
                }}
                className="w-28 bg-transparent outline-none"
              />
            ) : (
              <span className="max-w-[10rem] truncate">{project.name}</span>
            )}
            {dirty && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" />}
            <button
              type="button"
              aria-label={`${t('actions.delete')} ${project.name}`}
              onClick={(e) => {
                e.stopPropagation();
                requestClose(id, project.name);
              }}
              className="flex h-4 w-4 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--calqo-hover)]"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}

      <button
        type="button"
        aria-label={t('editor:workspace.createProject')}
        title={t('editor:workspace.createProject')}
        onClick={() => void createProject()}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--calqo-radius-sm)] text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]"
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
