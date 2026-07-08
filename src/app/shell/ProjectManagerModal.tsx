import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Download, FolderOpen, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { dialog } from '@/lib/adapters';
import type { ProjectSummary } from '@/lib/adapters';
import { useProjectSummaries } from '@/lib/hooks/useProjectSummaries';
import { ProjectThumbnail } from './ProjectThumbnail';
import {
  deleteProject,
  duplicateStoredProject,
  openProject,
  renameStoredProject,
} from '@/editor/commands/projectCommands';
import { exportProjectFile } from '@/editor/export/calqoFile';
import { saveProjectAsStarter } from '@/editor/starters/starterService';
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
  onDuplicate,
  onExport,
  onSaveStarter,
  onDelete,
  onRenamed,
}: {
  summary: ProjectSummary;
  locale: string;
  onOpen: (id: string) => void;
  onDuplicate: (id: string) => void;
  onExport: (id: string) => void;
  onSaveStarter: (id: string) => void;
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

  const updated = (
    <span className="block text-[11px] text-[var(--calqo-text-3)]">
      {t('projects.updated', { date: formatDate(summary.updatedAt, locale) })}
    </span>
  );

  return (
    <li className="group flex items-center gap-2 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] pr-1.5 transition-colors hover:border-[var(--calqo-accent-ring)] hover:bg-[var(--calqo-hover)]">
      {renaming ? (
        <>
          <ProjectThumbnail projectId={summary.id} />
          <div className="min-w-0 flex-1 py-2.5">
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
            {updated}
          </div>
        </>
      ) : (
        // The whole thumbnail + text region is the open target, so the click
        // area isn't limited to the name string.
        <button
          type="button"
          onClick={() => onOpen(summary.id)}
          className="flex min-w-0 flex-1 items-center gap-2 py-2.5 text-left"
        >
          <ProjectThumbnail projectId={summary.id} />
          <div className="min-w-0 flex-1">
            <span className="block max-w-full truncate text-[13.5px] font-medium text-[var(--calqo-text)]">
              {summary.name}
            </span>
            {updated}
          </div>
        </button>
      )}
      {/* Row actions rest hidden and reveal on hover or keyboard focus, keeping
          the list calm while staying reachable. */}
      <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        <GlassIconButton
          label={t('projects.duplicate')}
          showTitle={false}
          onClick={() => onDuplicate(summary.id)}
        >
          <Copy size={14} />
        </GlassIconButton>
        <GlassIconButton
          label={t('projects.exportFile')}
          showTitle={false}
          onClick={() => onExport(summary.id)}
        >
          <Download size={14} />
        </GlassIconButton>
        <GlassIconButton
          label={t('starters.saveAs')}
          showTitle={false}
          onClick={() => onSaveStarter(summary.id)}
        >
          <Star size={14} />
        </GlassIconButton>
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
      </div>
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
  const [starterStatus, setStarterStatus] = useState<string | null>(null);

  const openAndClose = (id: string) => {
    void openProject(id).then(onClose);
  };

  const saveStarter = async (id: string) => {
    setStarterStatus(null);
    try {
      const record = await saveProjectAsStarter(id);
      if (record) setStarterStatus(t('starters.saved', { name: record.name }));
    } catch (error) {
      console.error('[Calqo] save-as-starter failed', error);
      setStarterStatus(t('starters.saveFailed'));
    }
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

  const duplicate = async (id: string) => {
    await duplicateStoredProject(id);
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
            {summaries && summaries.length > 0 && (
              <span className="rounded-full bg-[var(--calqo-glass-thin)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--calqo-text-3)]">
                {summaries.length}
              </span>
            )}
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
        {summaries === null ? (
          <p className="px-1 py-10 text-center text-[13px] text-[var(--calqo-text-3)]">
            {t('projects.loading')}
          </p>
        ) : empty ? (
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
                onDuplicate={(id) => void duplicate(id)}
                onExport={(id) => void exportProjectFile(id)}
                onSaveStarter={(id) => void saveStarter(id)}
                onDelete={(id, name) => void remove(id, name)}
                onRenamed={refresh}
              />
            ))}
          </ul>
        )}
      </div>

      <footer className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--calqo-divider)] pt-4">
        <span className="min-w-0 truncate text-[12px] text-[var(--calqo-text-3)]">
          {starterStatus}
        </span>
        <div className="flex items-center gap-2">
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
        </div>
      </footer>
    </ModalOverlay>
  );
}
