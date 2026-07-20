import { useTranslation } from 'react-i18next';
import { LayoutTemplate, Sparkles } from 'lucide-react';
import { useActiveProject, useActiveArtboard } from '@/lib/state/selectors';
import { createProject } from '@/editor/commands/projectCommands';
import { CalqoStage } from '@/editor/canvas/CalqoStage';
import { GlassButton } from '@/components/glass';
import { useUiStore } from '@/lib/state/uiStore';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import { ArtboardDots } from './ArtboardDots';
import { ArtboardOverview } from './ArtboardOverview';
import { FormatGrid } from './NewProjectModal';
import { ZoomControl } from './ZoomControl';
import { AnimationTransport } from './animation/AnimationTransport';

/** Neutral canvas workspace with the live Konva editor stage. */
export function Workspace() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const artboard = useActiveArtboard();
  const overviewMode = useUiStore((s) => s.overviewMode);
  const animate = useWorkspaceStore(
    (s) =>
      (s.activeProjectId
        ? (s.modeByProject[s.activeProjectId] ?? 'design')
        : 'design') === 'animate',
  );

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)]"
      style={{ background: 'var(--calqo-workspace)' }}
    >
      {!project || !artboard ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 overflow-y-auto p-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-[var(--calqo-radius-lg)] bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]">
              <Sparkles size={26} />
            </div>
            <div className="space-y-1">
              <p className="text-[15px] font-semibold text-[var(--calqo-text)]">
                {t('newProject.title')}
              </p>
              <p className="max-w-xs text-[12.5px] text-[var(--calqo-text-3)]">
                {t('newProject.subtitle')}
              </p>
            </div>
          </div>
          <GlassButton
            variant="primary"
            onClick={() =>
              window.dispatchEvent(new CustomEvent('calqo:open-starters'))
            }
          >
            <LayoutTemplate size={14} />
            {t('newProject.browseStarters')}
          </GlassButton>
          <div className="w-full max-w-[560px]">
            <FormatGrid onSelect={(preset) => void createProject({ preset })} />
          </div>
        </div>
      ) : (
        <>
          <CalqoStage project={project} artboard={artboard} />
          <ArtboardDots />
          {!overviewMode && <ZoomControl />}
          <ArtboardOverview />
          {animate && !overviewMode && <AnimationTransport />}
        </>
      )}
    </div>
  );
}
