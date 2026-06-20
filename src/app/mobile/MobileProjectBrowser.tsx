import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { dialog } from '@/lib/adapters';
import type { ProjectSummary } from '@/lib/adapters';
import { useProjectSummaries } from '@/lib/hooks/useProjectSummaries';
import { createSampleProject } from '@/lib/schema/sampleProject';
import {
  adoptProject,
  deleteProject,
  renameStoredProject,
} from '@/editor/commands/projectCommands';
import { FormatGrid } from '@/app/shell/NewProjectModal';
import type { ArtboardPresetId } from '@/lib/schema/presets';
import { BottomSheet } from '@/components/mobile';
import { GlassButton } from '@/components/glass';

interface MobileProjectBrowserProps {
  onOpen: (id: string) => void;
  onCreate: (preset: ArtboardPresetId) => void;
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

function MobileProjectRow({
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
    <li className="glass flex items-center gap-2 rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] pr-1.5">
      <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]">
          <FileText size={18} />
        </span>
        <span className="min-w-0 flex-1">
          {renaming ? (
            <input
              autoFocus
              defaultValue={summary.name}
              aria-label={t('mobile.browser.rename')}
              onFocus={(event) => event.target.select()}
              onBlur={(event) => void commit(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
                if (event.key === 'Escape') setRenaming(false);
              }}
              className="h-8 w-full rounded-[8px] border border-[var(--calqo-accent)] bg-[var(--calqo-glass)] px-2 text-[14px] font-medium text-[var(--calqo-text)] outline-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => onOpen(summary.id)}
              className="block max-w-full truncate text-left text-[14px] font-medium text-[var(--calqo-text)]"
            >
              {summary.name}
            </button>
          )}
          <span className="block text-[11.5px] text-[var(--calqo-text-3)]">
            {t('mobile.browser.updated', {
              date: formatDate(summary.updatedAt, locale),
            })}
          </span>
        </span>
      </div>
      <button
        type="button"
        aria-label={t('mobile.browser.rename')}
        onClick={() => setRenaming(true)}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--calqo-text-3)] transition-colors active:bg-[var(--calqo-hover)] active:text-[var(--calqo-text)]"
      >
        <Pencil size={16} />
      </button>
      <button
        type="button"
        aria-label={t('mobile.browser.delete')}
        onClick={() => onDelete(summary.id, summary.name)}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--calqo-text-3)] transition-colors active:bg-[var(--calqo-hover)] active:text-[var(--calqo-text)]"
      >
        <Trash2 size={17} />
      </button>
    </li>
  );
}

/** Phone landing surface: a list of locally stored projects with delete, plus
 * entry points for creating from a preset or opening the bundled sample. */
export function MobileProjectBrowser({ onOpen, onCreate }: MobileProjectBrowserProps) {
  const { t, i18n } = useTranslation('editor');
  const { summaries, refresh } = useProjectSummaries();
  const [newOpen, setNewOpen] = useState(false);

  const empty = summaries !== null && summaries.length === 0;

  const remove = async (id: string, name: string) => {
    const confirmed = await dialog.confirm({
      title: t('mobile.browser.deleteTitle'),
      message: t('mobile.browser.deleteMessage', { name }),
    });
    if (!confirmed) return;
    await deleteProject(id);
    refresh();
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="calqo-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-24 pt-3">
        {empty ? (
          <div className="flex flex-col items-center gap-5 px-4 pt-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-[var(--calqo-radius-lg)] bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]">
              <Sparkles size={26} />
            </div>
            <div className="space-y-1">
              <p className="text-[15px] font-semibold text-[var(--calqo-text)]">
                {t('mobile.browser.emptyTitle')}
              </p>
              <p className="text-[12.5px] text-[var(--calqo-text-3)]">
                {t('mobile.browser.emptyHint')}
              </p>
            </div>
            <GlassButton
              variant="primary"
              onClick={() =>
                void adoptProject(createSampleProject()).then((id) => onOpen(id))
              }
            >
              <Sparkles size={14} />
              {t('sample.open')}
            </GlassButton>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {summaries?.map((summary) => (
              <MobileProjectRow
                key={summary.id}
                summary={summary}
                locale={i18n.language}
                onOpen={onOpen}
                onDelete={(id, name) => void remove(id, name)}
                onRenamed={refresh}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-[max(env(safe-area-inset-bottom),16px)]">
        <button
          type="button"
          aria-label={t('mobile.browser.newProject')}
          title={t('mobile.browser.newProject')}
          className="pointer-events-auto grid h-16 w-16 place-items-center rounded-[22px] border border-[rgba(255,255,255,0.18)] bg-[var(--calqo-accent)] text-[var(--calqo-text-on-accent)] shadow-[0_12px_30px_rgba(0,122,255,0.28),0_6px_18px_rgba(0,0,0,0.24),inset_0_1px_0_rgba(255,255,255,0.24)] transition duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-spring)] active:scale-[0.96] active:opacity-90"
          onClick={() => setNewOpen(true)}
        >
          <Plus size={30} strokeWidth={2.15} />
        </button>
      </div>

      <BottomSheet
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title={t('newProject.title')}
        subtitle={t('newProject.subtitle')}
        bodyClassName="pb-4"
      >
        <FormatGrid
          onSelect={(preset) => {
            setNewOpen(false);
            onCreate(preset);
          }}
        />
      </BottomSheet>
    </div>
  );
}
