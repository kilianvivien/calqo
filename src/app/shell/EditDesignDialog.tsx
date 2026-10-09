import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Copy, Wand2, X } from 'lucide-react';
import { AiReadinessNote } from '@/app/shell/AiReadinessNote';
import { GlassButton, GlassIconButton, ModalOverlay } from '@/components/glass';
import { clipboard } from '@/lib/adapters';
import { useAiSettingsStore } from '@/editor/ai/aiSettings';
import {
  editDesign,
  type DesignEditOutcome,
} from '@/editor/ai/designEditService';
import { getProvider } from '@/editor/ai/providerRegistry';
import { aiReadiness } from '@/editor/ai/readiness';
import type { CompletionImage } from '@/editor/ai/completion';
import { prepareReferenceImage } from '@/editor/ai/referenceImage';
import { undoProject } from '@/editor/commands/projectCommands';
import { useActiveProject } from '@/lib/state/selectors';
import { projectStore } from '@/lib/state/projectStore';
import { useSelectionStore } from '@/lib/state/selectionStore';
import { useUiStore } from '@/lib/state/uiStore';

let editDraft = '';

/** Enough for a model to judge layout, spacing and contrast. */
const EDIT_PREVIEW_MAX_EDGE = 768;

const SUGGESTIONS = ['contrast', 'spacing', 'hierarchy', 'palette'] as const;

export function EditDesignDialog() {
  const aiDialog = useUiStore((s) => s.aiDialog);
  if (aiDialog !== 'edit') return null;
  return <EditDesignDialogInner />;
}

/** Render the artboard for vision-capable providers. Best effort: the edit
 * still works from the layer JSON alone if rendering is unavailable. */
async function renderPreview(
  projectId: string,
  artboardId: string,
): Promise<CompletionImage | undefined> {
  try {
    const { renderMcpPreview } = await import('@/editor/mcp/preview');
    const preview = await renderMcpPreview({ projectId, artboardId });
    // A compact JPEG keeps the request light; fall back to the PNG as-is.
    const bytes = Uint8Array.from(atob(preview.data), (char) =>
      char.charCodeAt(0),
    );
    const compact = await prepareReferenceImage(
      new Blob([bytes], { type: preview.mimeType }),
      EDIT_PREVIEW_MAX_EDGE,
    );
    return compact ?? { mimeType: preview.mimeType, data: preview.data };
  } catch {
    return undefined;
  }
}

function EditDesignDialogInner() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const activeArtboardId = useSelectionStore((s) => s.activeArtboardId);
  const selectedIds = useSelectionStore((s) => s.selectedLayerIds);
  const setAiDialog = useUiStore((s) => s.setAiDialog);
  const settings = useAiSettingsStore((s) => s.settings);

  const [instruction, setInstruction] = useState(editDraft);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<
    'waiting' | 'thinking' | 'drafting' | 'repair'
  >('waiting');
  const [outcome, setOutcome] = useState<DesignEditOutcome | null>(null);
  const [failed, setFailed] = useState(false);
  const [undone, setUndone] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const close = () => {
    abortRef.current?.abort();
    setAiDialog('none');
  };

  const artboard =
    project?.artboards.find((ab) => ab.id === activeArtboardId) ??
    project?.artboards[0];
  if (!project || !artboard) return null;

  const run = async () => {
    const text = instruction.trim();
    if (!text) return;
    const provider = getProvider(settings);
    if (!provider) return;
    setBusy(true);
    setOutcome(null);
    setFailed(false);
    setUndone(false);
    setPhase('waiting');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const preview = provider.capabilities.vision
        ? await renderPreview(project.id, artboard.id)
        : undefined;
      // Read the project after the async render so the revision is current.
      const current = projectStore.getState().projects[project.id] ?? project;
      const result = await editDesign(
        provider,
        current,
        {
          instruction: text,
          projectId: project.id,
          artboardId: artboard.id,
          selectedLayerIds: selectedIds,
          preview,
        },
        controller.signal,
        (progress) => {
          if (!alive.current) return;
          setPhase(
            progress.attempt > 1
              ? 'repair'
              : progress.reasoning
                ? 'thinking'
                : 'drafting',
          );
        },
      );
      if (!alive.current) return;
      setOutcome(result);
      if (result.ok && result.changed) {
        editDraft = '';
        setInstruction('');
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error(
        '[Calqo] design edit failed',
        error instanceof Error ? error.message : error,
      );
      if (alive.current) setFailed(true);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      if (alive.current) setBusy(false);
    }
  };

  const undoEdit = () => {
    undoProject(project.id);
    setUndone(true);
  };

  const failure = outcome && !outcome.ok ? outcome : null;
  const success = outcome?.ok ? outcome : null;

  return (
    <ModalOverlay
      open
      onClose={close}
      labelledBy="edit-design-title"
      className="glass glass-strong max-h-[88vh] overflow-y-auto calqo-scroll w-[min(520px,100%)] rounded-[28px] border border-[var(--calqo-divider)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
    >
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2
            id="edit-design-title"
            className="flex items-center gap-2 text-[16px] font-semibold text-[var(--calqo-text)]"
          >
            <Wand2 size={17} className="text-[var(--calqo-accent)]" />
            {t('editDesign.title')}
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--calqo-text-3)]">
            {t('editDesign.subtitle')}
          </p>
        </div>
        <GlassIconButton label={t('export.close')} onClick={close}>
          <X size={15} />
        </GlassIconButton>
      </header>

      <div className="space-y-3">
        <AiReadinessNote />
        <textarea
          autoFocus
          value={instruction}
          aria-label={t('editDesign.title')}
          placeholder={t('editDesign.placeholder')}
          onChange={(event) => {
            editDraft = event.target.value;
            setInstruction(editDraft);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void run();
            }
          }}
          className="min-h-20 w-full resize-y rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-3 py-2.5 text-[13px] text-[var(--calqo-text)] outline-none transition-colors focus:border-[var(--calqo-accent)] focus:ring-2 focus:ring-[var(--calqo-accent-ring)]"
        />

        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((key) => (
            <button
              key={key}
              type="button"
              disabled={busy}
              onClick={() => {
                editDraft = t(`editDesign.suggestions.${key}`);
                setInstruction(editDraft);
              }}
              className="rounded-full border border-[var(--calqo-divider)] px-2.5 py-1 text-[11.5px] text-[var(--calqo-text-2)] transition-colors hover:bg-[var(--calqo-hover)] disabled:opacity-50"
            >
              {t(`editDesign.suggestions.${key}`)}
            </button>
          ))}
        </div>

        <p className="text-[11.5px] text-[var(--calqo-text-3)]">
          {selectedIds.length > 0
            ? t('editDesign.scopeSelection', {
                count: selectedIds.length,
                artboard: artboard.name,
              })
            : t('editDesign.scopeArtboard', { artboard: artboard.name })}
        </p>

        {success && (
          <div
            role="status"
            className="rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] p-3"
          >
            <p className="flex items-start gap-1.5 text-[12.5px] text-[var(--calqo-text)]">
              <Check
                size={14}
                className="mt-0.5 shrink-0 text-[var(--calqo-accent)]"
              />
              <span>
                {undone
                  ? t('editDesign.undone')
                  : success.summary ||
                    (success.changed
                      ? t('editDesign.applied')
                      : t('editDesign.noChange'))}
              </span>
            </p>
            {!undone && success.warnings.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {success.warnings.slice(0, 6).map((warning) => (
                  <li
                    key={warning}
                    className="flex items-start gap-1.5 text-[11px] text-[#B7791F]"
                  >
                    <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                    {warning}
                  </li>
                ))}
              </ul>
            )}
            {success.changed && !undone && (
              <button
                type="button"
                onClick={undoEdit}
                className="mt-2 text-[11.5px] font-medium text-[var(--calqo-accent)] hover:underline"
              >
                {t('editDesign.undo')}
              </button>
            )}
          </div>
        )}

        {(failure || failed) && (
          <div
            role="alert"
            className="rounded-[var(--calqo-radius-sm)] border border-[#FF5F57]/40 bg-[#FF5F57]/10 p-3"
          >
            <p className="text-[12px] font-semibold text-[#B42318]">
              {failure?.reason === 'stale'
                ? t('editDesign.stale')
                : failure
                  ? t('editDesign.invalid')
                  : t('editDesign.failed')}
            </p>
            {failure && failure.reason !== 'stale' && (
              <p className="mt-0.5 text-[11px] text-[var(--calqo-text-2)]">
                {failure.error}
              </p>
            )}
            {failure?.issues && failure.issues.length > 0 && (
              <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto calqo-scroll">
                {failure.issues.map((issue) => (
                  <li
                    key={issue}
                    className="mono text-[10.5px] text-[var(--calqo-text-3)]"
                  >
                    {issue}
                  </li>
                ))}
              </ul>
            )}
            {failure?.raw && (
              <button
                type="button"
                onClick={() => void clipboard.writeText(failure.raw ?? '')}
                className="mt-2 flex items-center gap-1 text-[11px] font-medium text-[var(--calqo-accent)] hover:underline"
              >
                <Copy size={12} />
                {t('promptTemplate.copyRaw')}
              </button>
            )}
          </div>
        )}
      </div>

      <footer className="mt-5 flex items-center justify-end gap-2">
        {busy && (
          <span
            role="status"
            className="mr-auto truncate text-[11.5px] text-[var(--calqo-text-3)]"
          >
            {t(`editDesign.progress.${phase}`)}
          </span>
        )}
        {busy ? (
          <GlassButton onClick={() => abortRef.current?.abort()}>
            {t('promptTemplate.cancel')}
          </GlassButton>
        ) : (
          <GlassButton onClick={close}>{t('export.close')}</GlassButton>
        )}
        <GlassButton
          variant="primary"
          onClick={() => void run()}
          disabled={busy || !instruction.trim() || !aiReadiness(settings).ready}
          loading={busy}
        >
          {!busy && <Wand2 size={14} />}
          {busy ? t('editDesign.working') : t('editDesign.apply')}
        </GlassButton>
      </footer>
    </ModalOverlay>
  );
}
