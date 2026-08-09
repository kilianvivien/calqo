import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CalqoLayer } from '@/lib/schema';
import {
  addLayerMotionKeyframe,
  deleteLayerMotionKeyframe,
} from '@/editor/commands/projectCommands';
import {
  hasMotionKeyframeAt,
  motionKeyframeTimes,
} from '@/editor/animation/keyframes';
import { cn } from '@/lib/utils/cn';

interface KeyframeLaneProps {
  projectId: string;
  layer: CalqoLayer;
  durationMs: number;
  timeMs: number;
  onSeek: (timeMs: number) => void;
}

/** One pose lane, intentionally without per-property rows or draggable curves. */
export function KeyframeLane({
  projectId,
  layer,
  durationMs,
  timeMs,
  onSeek,
}: KeyframeLaneProps) {
  const { t } = useTranslation('editor');
  const times = motionKeyframeTimes(layer.animation, durationMs);
  const onKeyframe = hasMotionKeyframeAt(layer.animation, durationMs, timeMs);
  const currentTime = Math.round(timeMs);
  const canDelete =
    onKeyframe &&
    times.length > 2 &&
    currentTime > 0 &&
    currentTime < durationMs;

  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label={t('animate.keyframes.lane', { name: layer.name })}
    >
      <span className="w-20 shrink-0 truncate text-[10.5px] font-medium text-[var(--calqo-text-2)]">
        {layer.name}
      </span>
      <div className="relative h-5 min-w-0 flex-1">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[var(--calqo-divider)]" />
        {times.map((markerTime) => {
          const active = Math.round(timeMs) === markerTime;
          return (
            <button
              key={markerTime}
              type="button"
              aria-label={t('animate.keyframes.goTo', {
                time: (markerTime / 1000).toFixed(1),
              })}
              aria-pressed={active}
              title={t('animate.keyframes.time', {
                time: (markerTime / 1000).toFixed(1),
              })}
              onClick={() => onSeek(markerTime)}
              className={cn(
                'absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border transition-transform hover:scale-125',
                active
                  ? 'border-[var(--calqo-accent)] bg-[var(--calqo-accent)]'
                  : 'border-[var(--calqo-text-2)] bg-[var(--calqo-glass)]',
              )}
              style={{
                left: `${durationMs > 0 ? (markerTime / durationMs) * 100 : 0}%`,
              }}
            />
          );
        })}
        <span
          className="pointer-events-none absolute top-0 h-5 w-px bg-[var(--calqo-accent)] opacity-50"
          style={{
            left: `${durationMs > 0 ? (Math.min(timeMs, durationMs) / durationMs) * 100 : 0}%`,
          }}
        />
      </div>
      <button
        type="button"
        aria-label={t('animate.keyframes.add')}
        title={t('animate.keyframes.add')}
        disabled={onKeyframe}
        onClick={() => addLayerMotionKeyframe(projectId, layer.id, timeMs)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--calqo-radius-sm)] text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)] disabled:opacity-30"
      >
        <Plus size={13} />
      </button>
      <button
        type="button"
        aria-label={t('animate.keyframes.delete')}
        title={t('animate.keyframes.delete')}
        disabled={!canDelete}
        onClick={() => deleteLayerMotionKeyframe(projectId, layer.id, timeMs)}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--calqo-radius-sm)] text-[var(--calqo-text-3)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text-2)] disabled:opacity-30"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
