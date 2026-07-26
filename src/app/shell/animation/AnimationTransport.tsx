import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pause, Play, SkipBack } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useActiveArtboard, useActiveProject } from '@/lib/state/selectors';
import { useAnimationPlaybackStore } from '@/lib/state/animationPlaybackStore';
import { flattenLayers } from '@/editor/utils/layers';
import { isEditableKeyboardTarget } from '@/app/keyboardGuards';
import { TimingOverview } from './TimingOverview';

/** Thin bottom transport for Animate mode (§6.1): play/pause, jump-to-start,
 * scrubber, current/total time, and read-only per-layer timing bars. Mounted
 * only in Animate mode on the desktop shell. */
export function AnimationTransport() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const artboard = useActiveArtboard();
  const status = useAnimationPlaybackStore((s) => s.status);
  const timeMs = useAnimationPlaybackStore((s) => s.timeMs);
  const durationMs = useAnimationPlaybackStore((s) => s.durationMs);
  const play = useAnimationPlaybackStore((s) => s.play);
  const pause = useAnimationPlaybackStore((s) => s.pause);
  const seek = useAnimationPlaybackStore((s) => s.seek);
  const stopAndReset = useAnimationPlaybackStore((s) => s.stopAndReset);

  const hasAnimation =
    !!artboard &&
    flattenLayers(artboard.layers).some((l) => l.animation !== undefined);

  const playing = status === 'playing';
  const toggle = () => {
    if (!hasAnimation) return;
    if (playing) pause();
    else play();
  };

  // Space toggles play/pause when focus is not in an editable control and no
  // modal is open (§9). Frame/time ticks are not announced.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (isEditableKeyboardTarget(e.target)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasAnimation, playing]);

  if (!project || !artboard) return null;

  const totalSecs = (durationMs / 1000).toFixed(1);
  const currentSecs = (Math.min(timeMs, durationMs) / 1000).toFixed(1);

  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 border-t border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-4 py-2.5 backdrop-blur"
      role="group"
      aria-label={t('animate.transport.timingTitle')}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={t('animate.transport.restart')}
          disabled={!hasAnimation}
          onClick={stopAndReset}
          className="flex h-7 w-7 items-center justify-center rounded-[var(--calqo-radius-sm)] text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)] disabled:opacity-40"
        >
          <SkipBack size={15} />
        </button>
        <button
          type="button"
          aria-label={playing ? t('animate.transport.pause') : t('animate.transport.play')}
          aria-pressed={playing}
          disabled={!hasAnimation}
          onClick={toggle}
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded-full transition-colors disabled:opacity-40',
            'bg-[var(--calqo-accent)] text-[var(--calqo-text-on-accent)] hover:brightness-110',
          )}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>

        <input
          type="range"
          aria-label={t('animate.transport.scrub')}
          min={0}
          max={Math.max(1, durationMs)}
          step={10}
          value={Math.min(timeMs, durationMs)}
          disabled={!hasAnimation}
          onPointerDown={() => pause()}
          onChange={(e) => seek(Number(e.target.value))}
          className="min-w-0 flex-1 accent-[var(--calqo-accent)] disabled:opacity-40"
        />

        <span className="shrink-0 tabular-nums text-[11.5px] text-[var(--calqo-text-2)]">
          {t('animate.transport.time', { current: currentSecs, total: totalSecs })}
        </span>
      </div>

      {hasAnimation ? (
        <TimingOverview artboard={artboard} />
      ) : (
        <p className="text-[11px] text-[var(--calqo-text-3)]">
          {t('animate.transport.empty')}
        </p>
      )}
    </div>
  );
}
