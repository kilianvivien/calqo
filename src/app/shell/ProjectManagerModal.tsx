import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, FolderOpen, Pencil, Plus, Trash2, X } from 'lucide-react';
import { dialog } from '@/lib/adapters';
import type { ProjectSummary } from '@/lib/adapters';
import { useProjectSummaries } from '@/lib/hooks/useProjectSummaries';
import {
  deleteProject,
  openProject,
  renameStoredProject,
} from '@/editor/commands/projectCommands';
import { GlassButton, GlassIconButton, ModalOverlay } from '@/components/glass';

interface ProjectManagerModalProps {
  open: boolean;
  onClose: () => void;
  /** Open the "new project" format picker. */
  onNew: () => void;
  /** Open a `.calqo` file from disk / import. */
  onImport: () => void;
}

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function ProjectManagerRow({
  summary,
  locale,
  onOpen,
  onDelete,
  onRenamed,
}: {
  summary: ProjectSummary;
  locale: string;
  onOpen: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onRenamed: () => void;
}) {
  const { t } = useTranslation('editor');
  const [renaming, setRenaming] = useState(false);

  const commit = async (value: string) => {
    setRenaming(false);
    await renameStoredProject(summary.id, value);
    onRenamed();
  };

  return (
    <li className="group flex items-center gap-2 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] pr-1.5 transition-colors hover:bg-[var(--calqo-hover)]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)] ml-3">
        <FileText size={16} />
      </span>
      <div className="min-w-0 flex-1 py-2.5">
        {renaming ? (
          <input
            autoFocus
            defaultValue={summary.name}
            aria-label={t('projects.rename')}
            onFocus={(event) => event.target.select()}
            onBlur={(event) => void commit(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') setRenaming(false);
            }}
            className="h-8 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-accent)] bg-[var(--calqo-glass)] px-2 text-[13.5px] font-medium text-[var(--calqo-text)] outline-none ring-2 ring-[var(--calqo-accent-ring)]"
          />
        ) : (
          <button
            type="button"
            onClick={() => onOpen(summary.id)}
            className="block max-w-full truncate text-left text-[13.5px] font-medium text-[var(--calqo-text)]"
          >
            {summary.name}
          </button>
        )}
        <span className="block text-[11px] text-[var(--calqo-text-3)]">
          {t('projects.updated', {
            date: formatDate(summary.updatedAt, locale),
          })}
        </span>
      </div>
      <GlassIconButton
        label={t('projects.rename')}
        showTitle={false}
        onClick={() => setRenaming(true)}
      >
        <Pencil size={14} />
      </GlassIconButton>
      <GlassIconButton
        label={t('projects.delete')}
        showTitle={false}
        onClick={() => onDelete(summary.id, summary.name)}
      >
        <Trash2 size={14} />
      </GlassIconButton>
    </li>
  );
}

/** Desktop project manager: browse, open, and delete locally stored projects in
 * one place — the counterpart to the phone project browser. A natural home for
 * future model/brand-kit libraries (post-M plan, Phases R–S). */
export function ProjectManagerModal({
  open,
  onClose,
  onNew,
  onImport,
}: ProjectManagerModalProps) {
  const { t, i18n } = useTranslation('editor');
  const { summaries, refresh } = useProjectSummaries(open);

  const openAndClose = (id: string) => {
    void openProject(id).then(onClose);
  };

  const remove = async (id: string, name: string) => {
    const confirmed = await dialog.confirm({
      title: t('projects.deleteTitle'),
      message: t('projects.deleteMessage', { name }),
    });
    if (!confirmed) return;
    await deleteProject(id);
    refresh();
  };

  const empty = summaries !== null && summaries.length === 0;

  return (
    <ModalOverlay
      open={open}
      onClose={onClose}
      labelledBy="projects-title"
      className="glass glass-strong flex max-h-[80vh] w-[min(620px,100%)] flex-col rounded-[28px] border border-[var(--calqo-divider)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
    >
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2
            id="projects-title"
            className="flex items-center gap-2 text-[16px] font-semibold text-[var(--calqo-text)]"
          >
            <FolderOpen size={17} className="text-[var(--calqo-accent)]" />
            {t('projects.title')}
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--calqo-text-3)]">
            {t('projects.subtitle')}
          </p>
        </div>
        <GlassIconButton label={t('export.close')} onClick={onClose}>
          <X size={15} />
        </GlassIconButton>
      </header>

      <div className="calqo-scroll min-h-0 flex-1 overflow-y-auto pr-1">
        {empty ? (
          <p className="px-1 py-10 text-center text-[13px] text-[var(--calqo-text-3)]">
            {t('projects.empty')}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {summaries?.map((summary) => (
              <ProjectManagerRow
                key={summary.id}
                summary={summary}
                locale={i18n.language}
                onOpen={openAndClose}
                onDelete={(id, name) => void remove(id, name)}
                onRenamed={refresh}
              />
            ))}
          </ul>
        )}
      </div>

      <footer className="mt-4 flex items-center justify-end gap-2 border-t border-[var(--calqo-divider)] pt-4">
        <GlassButton
          onClick={() => {
            onClose();
            onImport();
          }}
        >
          <FolderOpen size={14} />
          {t('projects.import')}
        </GlassButton>
        <GlassButton
          variant="primary"
          onClick={() => {
            onClose();
            onNew();
          }}
        >
          <Plus size={14} />
          {t('projects.new')}
        </GlassButton>
      </footer>
    </ModalOverlay>
  );
}
