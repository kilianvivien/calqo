import { useTranslation } from 'react-i18next';
import { Sparkles, Frame } from 'lucide-react';
import { GlassButton } from '@/components/glass';
import { useActiveProject, useActiveArtboard } from '@/lib/state/selectors';
import { createProject } from '@/editor/commands/projectCommands';

/** Neutral canvas workspace. The Konva stage mounts here in Phase B; for now it
 * shows the empty-state affordance, or a placeholder frame for the active
 * artboard so the persisted document is visibly loaded. */
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
        <div className="absolute inset-0 flex items-center justify-center p-8">
          {/* Placeholder artboard frame, scaled to fit — the real Konva stage
              replaces this in Phase B. */}
          <ArtboardPlaceholder
            width={artboard.width}
            height={artboard.height}
            background={
              artboard.background.type === 'solid'
                ? artboard.background.color
                : '#ffffff'
            }
            label={`${artboard.name} · ${artboard.width}×${artboard.height}`}
          />
        </div>
      )}
    </div>
  );
}

function ArtboardPlaceholder({
  width,
  height,
  background,
  label,
}: {
  width: number;
  height: number;
  background: string;
  label: string;
}) {
  const max = 520;
  const scale = Math.min(max / width, max / height, 1);
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="rounded-[var(--calqo-radius-sm)] shadow-[0_16px_50px_rgba(0,0,0,0.18)] ring-1 ring-black/10 flex items-center justify-center"
        style={{ width: width * scale, height: height * scale, background }}
      >
        <Frame
          size={28}
          className="opacity-20"
          style={{ color: background === '#FFFFFF' ? '#000' : '#fff' }}
        />
      </div>
      <span className="mono text-[10.5px] text-[var(--calqo-text-3)]">{label}</span>
    </div>
  );
}
