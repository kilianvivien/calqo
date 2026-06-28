import { useEffect, useState } from 'react';
import { FileText } from 'lucide-react';
import { storage } from '@/lib/adapters';
import { ArtboardThumbnail } from '@/editor/canvas/ArtboardThumbnail';
import type { CalqoProject } from '@/lib/schema';

/** Square miniature of a stored project's first artboard, for the project
 * manager rows. Lazily loads the full document (summaries carry only metadata)
 * and reuses the canvas {@link ArtboardThumbnail}; falls back to a file glyph
 * while loading or if the project can't be read. */
export function ProjectThumbnail({
  projectId,
  size = 52,
}: {
  projectId: string;
  size?: number;
}) {
  const [project, setProject] = useState<CalqoProject | null>(null);

  useEffect(() => {
    let alive = true;
    setProject(null);
    void storage
      .getProject(projectId)
      .then((p) => {
        if (alive) setProject(p);
      })
      .catch(() => {
        /* fall back to the glyph */
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const artboard = project?.artboards[0] ?? null;

  return (
    <span
      className="ml-3 grid shrink-0 place-items-center overflow-hidden rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)]"
      style={{ width: size, height: size }}
    >
      {project && artboard ? (
        <ArtboardThumbnail
          project={project}
          artboard={artboard}
          maxWidth={size}
          maxHeight={size}
        />
      ) : (
        <FileText size={16} className="text-[var(--calqo-text-3)]" />
      )}
    </span>
  );
}
