import { useTranslation } from 'react-i18next';
import { setActiveArtboard } from '@/editor/commands/projectCommands';
import { useActiveProject } from '@/lib/state/selectors';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { cn } from '@/lib/utils/cn';

/** Carousel-style page indicators for a project's artboards, floating at the
 * bottom of the canvas. Each dot switches the active artboard; the active one
 * is elongated and labelled so the current page is always legible. Hidden for
 * single-artboard projects, where it would be noise. */
export function ArtboardDots() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const activeArtboardId = useSelectionStore((s) => s.activeArtboardId);

  if (!project || project.artboards.length < 2) return null;

  const activeIndex = Math.max(
    0,
    project.artboards.findIndex((ab) => ab.id === activeArtboardId),
  );
  const activeArtboard = project.artboards[activeIndex];

  return (
    <div
      role="tablist"
      aria-label={t('panels.artboards')}
      className="glass absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.18)]"
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
                'h-2 rounded-full transition-all duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-spring)]',
                active
                  ? 'w-5 bg-[var(--calqo-accent)]'
                  : 'w-2 bg-[var(--calqo-text-3)]/40 hover:bg-[var(--calqo-text-3)]/70',
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
