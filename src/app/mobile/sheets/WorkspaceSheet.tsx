import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Copy, Plus, Trash2 } from 'lucide-react';
import {
  addArtboard,
  artboardOverflowLayerIds,
  deleteArtboard,
  duplicateArtboard,
  renameArtboard,
  setActiveArtboard,
} from '@/editor/commands/projectCommands';
import type { CalqoArtboard, CalqoProject } from '@/lib/schema';
import { ARTBOARD_PRESET_LIST, type ArtboardPresetId } from '@/lib/schema/presets';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { BottomSheet } from '@/components/mobile';
import { cn } from '@/lib/utils/cn';

interface WorkspaceSheetProps {
  open: boolean;
  onClose: () => void;
  project: CalqoProject;
}

function PresetGrid({
  onSelect,
}: {
  onSelect: (preset: ArtboardPresetId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {ARTBOARD_PRESET_LIST.map((preset) => (
        <button
          key={preset.id}
          type="button"
          className="min-h-[68px] rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] px-3 py-3 text-left transition-colors active:bg-[var(--calqo-hover)]"
          onClick={() => onSelect(preset.id as ArtboardPresetId)}
        >
          <span className="block truncate text-[13.5px] font-semibold text-[var(--calqo-text)]">
            {preset.name}
          </span>
          <span className="mono mt-1 block text-[11px] text-[var(--calqo-text-3)]">
            {preset.width} x {preset.height}
          </span>
        </button>
      ))}
    </div>
  );
}

function ArtboardRow({
  projectId,
  artboard,
  active,
  canDelete,
}: {
  projectId: string;
  artboard: CalqoArtboard;
  active: boolean;
  canDelete: boolean;
}) {
  const { t } = useTranslation('editor');

  return (
    <li
      className={cn(
        'flex min-h-[72px] items-center gap-2 rounded-[var(--calqo-radius-sm)] border px-3 py-2.5',
        active
          ? 'border-[var(--calqo-accent)] bg-[var(--calqo-accent-soft)]'
          : 'border-[var(--calqo-divider)]',
      )}
    >
      <button
        type="button"
        aria-label={artboard.name}
        onClick={() => setActiveArtboard(artboard.id)}
        className="grid h-11 w-8 shrink-0 place-items-center"
      >
        <span
          className={cn(
            'h-2.5 w-2.5 rounded-full',
            active ? 'bg-[var(--calqo-accent)]' : 'bg-[var(--calqo-divider)]',
          )}
        />
      </button>
      <div className="min-w-0 flex-1">
        <input
          aria-label={t('mobile.workspace.rename')}
          defaultValue={artboard.name}
          onFocus={() => setActiveArtboard(artboard.id)}
          onBlur={(event) => renameArtboard(projectId, artboard.id, event.target.value)}
          className="h-9 w-full rounded-[9px] border border-transparent bg-transparent px-1 text-[14.5px] font-semibold text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)] focus:bg-[var(--calqo-glass-thin)]"
        />
        <span className="mono block px-1 text-[11px] text-[var(--calqo-text-3)]">
          {artboard.width} x {artboard.height}
        </span>
      </div>
      {canDelete && (
        <button
          type="button"
          aria-label={t('artboards.delete')}
          onClick={() => deleteArtboard(projectId, artboard.id)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--calqo-text-3)] active:bg-[var(--calqo-hover)]"
        >
          <Trash2 size={17} />
        </button>
      )}
    </li>
  );
}

/** Mobile workspace controls for artboards/views: switch views, add blank
 * social formats, and duplicate the current view into another format. */
export function WorkspaceSheet({ open, onClose, project }: WorkspaceSheetProps) {
  const { t } = useTranslation('editor');
  const activeArtboardId = useSelectionStore((s) => s.activeArtboardId);
  const activeArtboard =
    project.artboards.find((artboard) => artboard.id === activeArtboardId) ??
    project.artboards[0];
  const [mode, setMode] = useState<'add' | 'duplicate'>('duplicate');
  const [reviewId, setReviewId] = useState<string | null>(null);

  const reviewArtboard = reviewId
    ? project.artboards.find((artboard) => artboard.id === reviewId) ?? null
    : null;
  const reviewOverflow = reviewArtboard
    ? artboardOverflowLayerIds(reviewArtboard).length
    : 0;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('mobile.workspace.title')}
      subtitle={t('mobile.workspace.subtitle')}
      bodyClassName="pb-4"
    >
      <section className="mb-5">
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-glass-thin)] p-1.5">
          <button
            type="button"
            onClick={() => setMode('duplicate')}
            className={cn(
              'flex min-h-12 items-center justify-center gap-2 rounded-[10px] px-3 text-[13px] font-semibold',
              mode === 'duplicate'
                ? 'bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]'
                : 'text-[var(--calqo-text-2)]',
            )}
          >
            <Copy size={14} />
            {t('mobile.workspace.duplicateFormat')}
          </button>
          <button
            type="button"
            onClick={() => setMode('add')}
            className={cn(
              'flex min-h-12 items-center justify-center gap-2 rounded-[10px] px-3 text-[13px] font-semibold',
              mode === 'add'
                ? 'bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]'
                : 'text-[var(--calqo-text-2)]',
            )}
          >
            <Plus size={14} />
            {t('mobile.workspace.addBlank')}
          </button>
        </div>

        <PresetGrid
          onSelect={(preset) => {
            if (mode === 'add') {
              addArtboard(project.id, preset);
              setReviewId(null);
              return;
            }
            if (!activeArtboard) return;
            const newId = duplicateArtboard(project.id, activeArtboard.id, preset);
            setReviewId(newId);
          }}
        />
      </section>

      {reviewArtboard && reviewOverflow > 0 && (
        <button
          type="button"
          className="mb-4 flex min-h-12 w-full items-start gap-2 rounded-[var(--calqo-radius-sm)] border border-[#E8B339]/40 bg-[#E8B339]/10 px-3 py-2.5 text-left"
          onClick={() => setActiveArtboard(reviewArtboard.id)}
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#B7791F]" />
          <span className="text-[12px] text-[var(--calqo-text-2)]">
            {t('artboards.resizeReview', {
              name: reviewArtboard.name,
              count: reviewOverflow,
            })}
          </span>
        </button>
      )}

      <section>
        <p className="mb-2.5 text-[13px] font-semibold text-[var(--calqo-text-2)]">
          {t('mobile.workspace.views')}
        </p>
        <ul className="flex flex-col gap-2">
          {project.artboards.map((artboard) => (
            <ArtboardRow
              key={artboard.id}
              projectId={project.id}
              artboard={artboard}
              active={artboard.id === activeArtboardId}
              canDelete={project.artboards.length > 1}
            />
          ))}
        </ul>
      </section>
    </BottomSheet>
  );
}
