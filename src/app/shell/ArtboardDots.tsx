import { useTranslation } from 'react-i18next';
import { LayoutGrid, Plus } from 'lucide-react';
import { addArtboard, setActiveArtboard } from '@/editor/commands/projectCommands';
import { useActiveProject } from '@/lib/state/selectors';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { useUiStore } from '@/lib/state/uiStore';
import { cn } from '@/lib/utils/cn';

/** Carousel-style page indicators for a project's artboards, floating at the
 * bottom of the canvas. Each dot switches the active artboard; the active one
 * is elongated and labelled so the current page is always legible. Hidden for
 * single-artboard projects, where it would be noise. */
export function ArtboardDots() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const activeArtboardId = useSelectionStore((s) => s.activeArtboardId);
  const toggleOverviewMode = useUiStore((s) => s.toggleOverviewMode);

  if (!project) return null;

  // With a single artboard there's nothing to switch between, so the pill becomes
  // a plain "+" that hints at — and creates — additional workspaces.
  if (project.artboards.length < 2) {
    return (
      <div className="glass absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center rounded-full p-1 shadow-[0_8px_28px_rgba(0,0,0,0.18)]">
        <button
          type="button"
          title={t('artboards.add')}
          aria-label={t('artboards.add')}
          onClick={() => addArtboard(project.id)}
          className="touch-hitarea flex h-6 w-6 items-center justify-center rounded-full text-[var(--calqo-text-3)] transition-colors hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]"
        >
          <Plus size={15} />
        </button>
      </div>
    );
  }

  const activeIndex = Math.max(
    0,
    project.artboards.findIndex((ab) => ab.id === activeArtboardId),
  );
  const activeArtboard = project.artboards[activeIndex];

  return (
    <div
      role="tablist"
      aria-label={t('panels.artboards')}
      className="glass absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.18)]"
    >
      <span className="max-w-[160px] truncate text-[11px] font-medium text-[var(--calqo-text-2)]">
        {activeArtboard?.name}
      </span>
      <span className="h-3 w-px bg-[var(--calqo-divider)]" aria-hidden="true" />
      <div className="flex items-center gap-1.5">
        {project.artboards.map((artboard, index) => {
          const active = index === activeIndex;
          return (
            <button
              key={artboard.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={`${artboard.name} (${index + 1}/${project.artboards.length})`}
              title={artboard.name}
              onClick={() => setActiveArtboard(artboard.id)}
              className={cn(
                'touch-hitarea h-2 rounded-full transition-all duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-spring)]',
                active
                  ? 'w-5 bg-[var(--calqo-accent)]'
                  : 'w-2 bg-[var(--calqo-text-3)]/40 hover:bg-[var(--calqo-text-3)]/70',
              )}
            />
          );
        })}
      </div>
      <span className="h-3 w-px bg-[var(--calqo-divider)]" aria-hidden="true" />
      <OverviewToggle label={t('overview.toggle')} onClick={toggleOverviewMode} />
    </div>
  );
}

/** Grid-icon button that opens the artboard overview ("see all"). */
function OverviewToggle({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="touch-hitarea flex h-6 w-6 items-center justify-center rounded-full text-[var(--calqo-text-3)] transition-colors hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)]"
    >
      <LayoutGrid size={14} />
    </button>
  );
}
