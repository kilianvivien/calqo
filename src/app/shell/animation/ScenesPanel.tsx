import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useActiveProject } from '@/lib/state/selectors';
import { useUiStore } from '@/lib/state/uiStore';
import {
  addSceneToClip,
  moveScene,
  removeSceneFromClip,
  setClipScenes,
  setSceneTransition,
  type SceneCommandResult,
} from '@/editor/commands/projectCommands';
import {
  resolveSequence,
  validateSceneSequence,
} from '@/editor/animation/sceneSequence';
import {
  SCENE_TRANSITION_KINDS,
  type SceneTransitionKind,
} from '@/lib/schema';

/**
 * Clip-level scene sequencing editor (AN-4.2d). Orders artboards into one clip
 * joined by transitions, shows the total duration, and surfaces validation
 * issues. Display-only ordering controls (move up/down, remove) — deliberately
 * not a draggable timeline (§6.1 warns against an accidental full editor). Every
 * edit routes through validated `projectCommands`.
 */
export function ScenesPanel() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const setToast = useUiStore((s) => s.setToast);

  const scenes = project?.clipSettings?.scenes ?? [];
  const nameById = useMemo(
    () => new Map((project?.artboards ?? []).map((a) => [a.id, a.name])),
    [project],
  );

  const sequence = useMemo(() => (project ? resolveSequence(project) : null), [project]);
  const issues = useMemo(() => (project ? validateSceneSequence(project) : []), [project]);

  if (!project) return null;

  const unused = project.artboards.filter(
    (a) => !scenes.some((s) => s.artboardId === a.id),
  );

  const report = (result: SceneCommandResult) => {
    if (!result.ok && result.issues[0]) setToast(result.issues[0].message);
  };

  const totalSecs = sequence ? (sequence.totalMs / 1000).toFixed(1) : '0.0';

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--calqo-text-3)]">
          {t('animate.scenes.title')}
        </h3>
        {scenes.length > 0 && (
          <span className="tabular-nums text-[11px] text-[var(--calqo-text-3)]">
            {t('animate.scenes.total', { seconds: totalSecs })}
          </span>
        )}
      </div>

      {scenes.length === 0 ? (
        <p className="text-[11px] text-[var(--calqo-text-3)]">{t('animate.scenes.empty')}</p>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {scenes.map((scene, index) => (
            <li
              key={`${scene.artboardId}-${index}`}
              className="flex items-center gap-2 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] px-2 py-1.5"
            >
              <span className="w-4 shrink-0 text-center tabular-nums text-[11px] text-[var(--calqo-text-3)]">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--calqo-text)]">
                {nameById.get(scene.artboardId) ?? scene.artboardId}
              </span>

              {index > 0 && (
                <select
                  aria-label={t('animate.scenes.transitionFor', {
                    name: nameById.get(scene.artboardId) ?? scene.artboardId,
                  })}
                  value={scene.transition ?? 'cut'}
                  onChange={(e) =>
                    report(
                      setSceneTransition(
                        project.id,
                        index,
                        e.target.value as SceneTransitionKind,
                        e.target.value === 'cut' ? undefined : scene.transitionDurationMs ?? 500,
                      ),
                    )
                  }
                  className="shrink-0 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-transparent px-1 py-0.5 text-[11px] text-[var(--calqo-text-2)]"
                >
                  {SCENE_TRANSITION_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`animate.scenes.transitions.${kind}`)}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex shrink-0 items-center">
                <button
                  type="button"
                  aria-label={t('animate.scenes.moveUp')}
                  disabled={index === 0}
                  onClick={() => report(moveScene(project.id, index, index - 1))}
                  className="flex h-6 w-6 items-center justify-center rounded-[var(--calqo-radius-sm)] text-[var(--calqo-text-3)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)] disabled:opacity-30"
                >
                  <ChevronUp size={13} />
                </button>
                <button
                  type="button"
                  aria-label={t('animate.scenes.moveDown')}
                  disabled={index === scenes.length - 1}
                  onClick={() => report(moveScene(project.id, index, index + 1))}
                  className="flex h-6 w-6 items-center justify-center rounded-[var(--calqo-radius-sm)] text-[var(--calqo-text-3)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-text)] disabled:opacity-30"
                >
                  <ChevronDown size={13} />
                </button>
                <button
                  type="button"
                  aria-label={t('animate.scenes.remove')}
                  onClick={() => report(removeSceneFromClip(project.id, index))}
                  className="flex h-6 w-6 items-center justify-center rounded-[var(--calqo-radius-sm)] text-[var(--calqo-text-3)] hover:bg-[var(--calqo-hover)] hover:text-[var(--calqo-danger,#e5484d)]"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {issues.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {issues.map((issue, i) => (
            <li key={i} className="text-[11px] text-[var(--calqo-danger,#e5484d)]">
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      {unused.length > 0 && (
        <label className="flex items-center gap-1.5">
          <Plus size={13} className="shrink-0 text-[var(--calqo-text-3)]" />
          <select
            aria-label={t('animate.scenes.add')}
            value=""
            onChange={(e) => {
              if (e.target.value) report(addSceneToClip(project.id, e.target.value));
            }}
            className="min-w-0 flex-1 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-transparent px-1.5 py-1 text-[12px] text-[var(--calqo-text-2)]"
          >
            <option value="">{t('animate.scenes.add')}</option>
            {unused.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {scenes.length > 0 && (
        <button
          type="button"
          onClick={() => report(setClipScenes(project.id, []))}
          className="self-start text-[11px] text-[var(--calqo-text-3)] underline-offset-2 hover:text-[var(--calqo-text)] hover:underline"
        >
          {t('animate.scenes.clear')}
        </button>
      )}
    </section>
  );
}
