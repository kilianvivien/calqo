import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { GlassButton } from '@/components/glass';
import { useActiveProject, useActiveArtboard } from '@/lib/state/selectors';
import { createProject } from '@/editor/commands/projectCommands';
import { CalqoStage } from '@/editor/canvas/CalqoStage';
import { ZoomControl } from './ZoomControl';

/** Neutral canvas workspace with the live Konva editor stage. */
export function Workspace() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const artboard = useActiveArtboard();

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)]"
      style={{ background: 'var(--calqo-workspace)' }}
    >
      {!project || !artboard ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[var(--calqo-radius-lg)] bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]">
            <Sparkles size={26} />
          </div>
          <div className="space-y-1">
            <p className="text-[15px] font-semibold text-[var(--calqo-text)]">
              {t('workspace.empty')}
            </p>
            <p className="max-w-xs text-[12.5px] text-[var(--calqo-text-3)]">
              {t('workspace.emptyHint')}
            </p>
          </div>
          <GlassButton variant="primary" onClick={() => void createProject()}>
            {t('workspace.createProject')}
          </GlassButton>
        </div>
      ) : (
        <>
          <CalqoStage project={project} artboard={artboard} />
          <ZoomControl />
        </>
      )}
    </div>
  );
}
