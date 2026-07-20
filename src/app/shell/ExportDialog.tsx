import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Copy, Download, X } from 'lucide-react';
import {
  GlassButton,
  GlassIconButton,
  GlassSegmentedControl,
  ModalOverlay,
} from '@/components/glass';
import { assetStorage, clipboard, files, videoExport } from '@/lib/adapters';
import type { VideoCapabilities } from '@/lib/adapters';
import {
  exportArtboardRaster,
  rasterFilename,
  type RasterFormat,
} from '@/editor/export/rasterExport';
import { exportArtboardSvg } from '@/editor/export/svgExport';
import { htmlSnippet, htmlStandalone } from '@/editor/export/htmlExport';
import { analyzeHtmlFidelity, exportArtboardHtmlLayout } from '@/editor/export/htmlLayoutExport';
import { warningIdentity, type HtmlExportWarning } from '@/editor/export/exportWarnings';
import { blobToBytes, createZip } from '@/editor/export/zip';
import {
  collectExportWarnings,
  uniqueArtboardStems,
} from '@/editor/export/exportReadiness';
import {
  animWarningIdentity,
  evenDimensions,
  isArtboardAnimatable,
  isCodecUsable,
  mp4ConfigWarnings,
  planGifOutput,
  GIF_CAPS,
  type AnimExportWarning,
} from '@/editor/export/animationExportReadiness';
import { exportAnimatedVideo } from '@/editor/export/animatedFrameExport';
import { exportAnimatedGif } from '@/editor/export/gif/gifExport';
import { buildAnimationPackage } from '@/editor/export/animationPackage';
import {
  exportAnimatedSceneGif,
  exportAnimatedSceneVideo,
} from '@/editor/export/animatedSceneExport';
import { resolveSequence } from '@/editor/animation/sceneSequence';
import { estimateEnvelopeBytes } from '@/editor/assets/assetHealth';
import { useMissingAssetsStore } from '@/editor/assets/missingAssetsStore';
import { localeLabel } from '@/editor/i18n-content/contentLocaleService';
import { useActiveArtboard, useActiveProject } from '@/lib/state/selectors';
import { useUiStore } from '@/lib/state/uiStore';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import type { CalqoArtboard, LocaleCode } from '@/lib/schema';

type Format = RasterFormat | 'svg' | 'html' | 'mp4' | 'gif';
type Scope = 'active' | 'all';
type HtmlKind = 'wrapper' | 'editable';
type HtmlMode = 'standalone' | 'snippet';
type Scale = '1' | '2' | '3';

function isRaster(format: Format): format is RasterFormat {
  return format === 'png' || format === 'jpeg' || format === 'webp';
}

function isAnimation(format: Format): format is 'mp4' | 'gif' {
  return format === 'mp4' || format === 'gif';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => resolve('');
    reader.readAsDataURL(blob);
  });
}

export function ExportDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation('editor');
  const project = useActiveProject();
  const artboard = useActiveArtboard();
  const workspaceMode = useWorkspaceStore((s) =>
    project ? (s.modeByProject[project.id] ?? 'design') : 'design',
  );
  const animationMode = workspaceMode === 'animate';
  const [format, setFormat] = useState<Format>('png');
  const [scale, setScale] = useState<Scale>('2');
  const pixelRatio = Number(scale) as 1 | 2 | 3;
  const [transparent, setTransparent] = useState(false);
  const [quality, setQuality] = useState(0.92);
  const [scope, setScope] = useState<Scope>('active');
  const [localeScope, setLocaleScope] = useState<Scope>('active');
  const [htmlKind, setHtmlKind] = useState<HtmlKind>('wrapper');
  const [htmlMode, setHtmlMode] = useState<HtmlMode>('standalone');
  // Editable HTML for an animated artboard can emit a single file or a neutral
  // agent-handoff package (index.html + assets + manifest + README) as a ZIP.
  const [htmlAnimOutput, setHtmlAnimOutput] = useState<'file' | 'package'>('file');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  // Live render counter so a long multi-artboard/multi-locale export shows
  // progress rather than an indefinite spinner.
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // Fidelity notes returned by the last editable-HTML export.
  const [runtimeFidelityNotes, setRuntimeFidelityNotes] = useState<HtmlExportWarning[]>([]);
  // Estimated `.calqo` envelope size (project JSON + base64 assets), plus the
  // asset names contributing most to it so the warning is actionable.
  const [envelopeEstimate, setEnvelopeEstimate] = useState<number | null>(null);
  const [envelopeContributors, setEnvelopeContributors] = useState<string[]>([]);
  const thresholds = useUiStore((s) => s.assetHealthThresholds);
  const setOptimizeAssetsOpen = useUiStore((s) => s.setOptimizeAssetsOpen);
  const setRepairAssetsOpen = useUiStore((s) => s.setRepairAssetsOpen);
  const missingAssetCount = useMissingAssetsStore((s) =>
    project ? (s.byProject[project.id]?.length ?? 0) : 0,
  );
  // Animation export (MP4/GIF). Eligible when the active artboard is animated
  // OR the project defines a multi-scene clip (AN-4.2). Animate mode always
  // exposes both formats but keeps them disabled until one of those holds.
  // Capabilities are probed lazily only once eligible.
  const clipSequence = useMemo(
    () => (project ? resolveSequence(project) : null),
    [project],
  );
  const hasClip = (clipSequence?.scenes.length ?? 0) >= 2;
  const animatable = (!!artboard && isArtboardAnimatable(artboard)) || hasClip;
  const [videoCaps, setVideoCaps] = useState<VideoCapabilities | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Per-frame progress for the current animated export, plus its structured
  // warnings (localized at render time).
  const [animProgress, setAnimProgress] = useState<{ done: number; total: number } | null>(null);
  const [animExportWarnings, setAnimExportWarnings] = useState<AnimExportWarning[]>([]);

  const targets = useMemo<CalqoArtboard[]>(() => {
    if (!project || !artboard) return [];
    return scope === 'all' ? project.artboards : [artboard];
  }, [project, artboard, scope]);

  const localeTargets = useMemo<LocaleCode[]>(() => {
    if (!project) return [];
    return localeScope === 'all' ? project.contentLocales : [project.activeContentLocale];
  }, [project, localeScope]);

  const warnings = useMemo(
    () =>
      collectExportWarnings({ project, targets, exportingAll: scope === 'all' }, t),
    [project, targets, scope, t],
  );
  const fidelityNotes = useMemo(() => {
    if (format !== 'html' || htmlKind !== 'editable') return [];
    const combined = [...analyzeHtmlFidelity(targets), ...runtimeFidelityNotes];
    return [...new Map(combined.map((warning) => [warningIdentity(warning), warning])).values()];
  }, [format, htmlKind, targets, runtimeFidelityNotes]);

  // Estimate the portable `.calqo` payload while the dialog is open so heavy
  // projects are flagged before they ship (asset-health soft limit).
  const projectId = project?.id ?? null;
  const assetSignature = project?.assets.map((a) => a.id).join('|') ?? '';
  useEffect(() => {
    if (!open || !project) return undefined;
    let alive = true;
    void (async () => {
      const bytes = new Map<string, number>();
      await Promise.all(
        project.assets.map(async (ref) => {
          const blob = await assetStorage.getAssetBlob(ref.id).catch(() => null);
          if (blob) bytes.set(ref.id, blob.size);
        }),
      );
      if (!alive) return;
      const jsonBytes = JSON.stringify(project).length;
      setEnvelopeEstimate(estimateEnvelopeBytes(jsonBytes, bytes));
      setEnvelopeContributors(
        [...bytes.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .filter(([, size]) => size > 512 * 1024)
          .map(
            ([id, size]) =>
              `${project.assets.find((ref) => ref.id === id)?.name ?? id} (${(size / (1024 * 1024)).toFixed(1)} MB)`,
          ),
      );
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, assetSignature]);

  // Probe codec/streaming capabilities once the Animate-mode dialog opens over
  // an animatable artboard; cached only for this runtime session (§7).
  const artboardWidth = artboard?.width ?? 0;
  const artboardHeight = artboard?.height ?? 0;
  const clipFps = project?.clipSettings?.fps ?? 30;
  useEffect(() => {
    if (!open || !animationMode || !animatable) return undefined;
    let alive = true;
    void videoExport
      .capabilities({ width: artboardWidth, height: artboardHeight, fps: clipFps })
      .then((caps) => {
        if (alive) setVideoCaps(caps);
      })
      .catch(() => {
        /* leave caps null → UI treats video as unavailable */
      });
    return () => {
      alive = false;
    };
  }, [open, animationMode, animatable, artboardWidth, artboardHeight, clipFps]);

  useEffect(() => {
    if (!open) abortRef.current?.abort();
  }, [open]);

  // The export surface follows the editor mode. Preserve the selected family
  // while reopening, but never leave a static format in Animate mode (or an
  // animation format in Design mode).
  useEffect(() => {
    if (!open) return;
    setFormat((current) => {
      if (animationMode) return isAnimation(current) ? current : 'mp4';
      return isAnimation(current) ? 'png' : current;
    });
  }, [open, animationMode]);

  if (!project || !artboard) return null;

  const envelopeTooBig =
    envelopeEstimate !== null && envelopeEstimate > thresholds.maxEnvelopeBytes;

  const transparentSupported = format === 'png' || format === 'webp';
  const qualitySupported = format === 'jpeg' || format === 'webp';
  // Animation formats export the active artboard only (v1 clips are single
  // artboard), so they ignore the artboard scope entirely.
  const animLocaleTargets = localeTargets;
  // For a multi-scene clip the exported dimensions/duration come from the whole
  // sequence; otherwise from the single active artboard.
  const animWidth = hasClip && clipSequence ? clipSequence.width : artboard.width;
  const animHeight = hasClip && clipSequence ? clipSequence.height : artboard.height;
  const sceneDurationMs =
    hasClip && clipSequence ? clipSequence.totalMs : artboard.timing?.duration ?? 5000;
  const videoDims = evenDimensions(animWidth, animHeight);
  const videoFrameCount = Math.max(
    1,
    Math.round((sceneDurationMs / 1000) * clipFps),
  );
  const gifPlan = planGifOutput(animWidth, animHeight, clipFps, sceneDurationMs);
  const h264Usable = videoCaps ? isCodecUsable(videoCaps, 'h264') : false;
  // A batch spanning multiple artboards and/or content locales is bundled into a
  // single .zip so the browser never suppresses the follow-up downloads.
  const totalOutputs = isAnimation(format)
    ? animLocaleTargets.length
    : targets.length * localeTargets.length;
  const bundling = totalOutputs > 1;
  const animExt = format === 'mp4' ? 'mp4' : 'gif';
  const filename = bundling
    ? `${slug(project.name)}.zip`
    : isAnimation(format)
      ? hasClip
        ? `${slug(project.name)}-clip.${animExt}`
        : `${slug(project.name)}-${slug(artboard.name)}.${animExt}`
      : format === 'html'
        ? `${slug(project.name)}-${slug(artboard.name)}.html`
        : format === 'svg'
          ? `${slug(project.name)}-${slug(artboard.name)}.svg`
          : rasterFilename(project.name, artboard.name, format, pixelRatio);

  const renderRaster = (target: CalqoArtboard, fmt: RasterFormat, locale: LocaleCode) =>
    exportArtboardRaster({
      artboard: target,
      locale,
      format: fmt,
      pixelRatio,
      transparent: transparent && (fmt === 'png' || fmt === 'webp'),
      quality,
    });

  /**
   * Render one artboard at one content locale to a named file blob. When the
   * batch spans more than one locale, files are nested in a per-locale folder so
   * the same artboard's variants never collide inside the archive.
   */
  const renderTarget = async (
    target: CalqoArtboard,
    stem: string,
    locale: LocaleCode,
    notes: HtmlExportWarning[],
  ): Promise<{ name: string; blob: Blob }> => {
    const projectSlug = slug(project.name);
    const dir = localeTargets.length > 1 ? `${locale}/` : '';
    const scaleSuffix = pixelRatio > 1 ? `@${pixelRatio}x` : '';
    if (isRaster(format)) {
      const ext = format === 'jpeg' ? 'jpg' : format;
      const blob = await renderRaster(target, format, locale);
      return { name: `${dir}${projectSlug}-${stem}${scaleSuffix}.${ext}`, blob };
    }
    if (format === 'svg') {
      const { svg } = await exportArtboardSvg(target, locale);
      return {
        name: `${dir}${projectSlug}-${stem}.svg`,
        blob: new Blob([svg], { type: 'image/svg+xml' }),
      };
    }
    if (htmlKind === 'editable') {
      // Editable HTML: real text/CSS nodes from the document, with per-layer
      // raster fallbacks and grouped fidelity notes.
      const result = await exportArtboardHtmlLayout(target, locale, {
        title: `${project.name} — ${target.name}`,
        project,
        mode: htmlMode,
      });
      notes.push(...result.warnings);
      return {
        name: `${dir}${projectSlug}-${stem}.html`,
        blob: new Blob([result.html], { type: 'text/html' }),
      };
    }
    // HTML (image wrapper) — always a PNG of the artboard.
    const blob = await renderRaster(target, 'png', locale);
    const pngDataUrl = await blobToDataUrl(blob);
    const html = (htmlMode === 'snippet' ? htmlSnippet : htmlStandalone)({
      title: `${project.name} — ${target.name}`,
      width: target.width,
      height: target.height,
      pngDataUrl,
    });
    return {
      name: `${dir}${projectSlug}-${stem}.html`,
      blob: new Blob([html], { type: 'text/html' }),
    };
  };

  /**
   * Animated MP4/GIF export (plan §6.3). One clip per content locale, rendered
   * sequentially so a 60 s multi-locale batch never holds every video at once.
   * A single `AbortController` cancels the whole job; on cancel/error partial
   * output is discarded (the frame loop cancels its encoder + disposes its
   * scene). Multiple locales bundle into one ZIP (a single unblocked download).
   */
  const handleAnimatedExport = async () => {
    if (format === 'mp4' && !h264Usable) {
      setStatus(t('export.videoUnavailable'));
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setStatus(null);
    setAnimProgress(null);
    const collected: AnimExportWarning[] = [];
    setAnimExportWarnings([]);
    const projectSlug = slug(project.name);
    const artboardSlug = slug(artboard.name);
    try {
      const stem = hasClip ? 'clip' : artboardSlug;
      const outputs: { name: string; blob: Blob }[] = [];
      for (const locale of animLocaleTargets) {
        const dir = animLocaleTargets.length > 1 ? `${locale}/` : '';
        const onProgress = (p: { completedFrames: number; totalFrames: number }) =>
          setAnimProgress({ done: p.completedFrames, total: p.totalFrames });
        if (format === 'mp4') {
          const result = hasClip
            ? await exportAnimatedSceneVideo({
                project,
                locale,
                codec: 'h264',
                signal: controller.signal,
                onProgress,
              })
            : await exportAnimatedVideo({
                project,
                artboard,
                locale,
                codec: 'h264',
                signal: controller.signal,
                onProgress,
              });
          collected.push(...result.warnings);
          if (result.blob) {
            outputs.push({ name: `${dir}${projectSlug}-${stem}.mp4`, blob: result.blob });
          }
        } else {
          const result = hasClip
            ? await exportAnimatedSceneGif({
                project,
                locale,
                signal: controller.signal,
                onProgress,
              })
            : await exportAnimatedGif({
                project,
                artboard,
                locale,
                signal: controller.signal,
                onProgress,
              });
          collected.push(...result.warnings);
          outputs.push({ name: `${dir}${projectSlug}-${stem}.gif`, blob: result.blob });
        }
      }
      // Merge pre-export config notes (codec/dimension) with runtime warnings.
      const configWarnings =
        format === 'mp4' && videoCaps
          ? mp4ConfigWarnings(videoCaps, 'h264', animWidth, animHeight)
          : [];
      setAnimExportWarnings(
        dedupeAnimWarnings([...configWarnings, ...collected]),
      );
      if (outputs.length === 1) {
        await files.downloadBlob(outputs[0].blob, outputs[0].name);
      } else if (outputs.length > 1) {
        const entries = await Promise.all(
          outputs.map(async (o) => ({ name: o.name, data: await blobToBytes(o.blob) })),
        );
        await files.downloadBlob(createZip(entries), `${projectSlug}.zip`);
      }
      setStatus(t('export.done'));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setStatus(t('export.videoCancelled'));
      } else {
        console.error('[Calqo] animated export failed', error);
        setStatus(t('export.failed'));
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setAnimProgress(null);
    }
  };

  /**
   * Neutral animation-package export (plan §11 / AN-3.4): the active animated
   * artboard as a ZIP of index.html + assets + manifest.json + README.md, one
   * package per content locale, bundled together when more than one is selected.
   */
  const handlePackageExport = async () => {
    setBusy(true);
    setStatus(null);
    const notes: HtmlExportWarning[] = [];
    setRuntimeFidelityNotes([]);
    const projectSlug = slug(project.name);
    const artboardSlug = slug(artboard.name);
    try {
      const outputs: { name: string; blob: Blob }[] = [];
      for (const locale of localeTargets) {
        const dir = localeTargets.length > 1 ? `${locale}-` : '';
        const pkg = await buildAnimationPackage(project, artboard, locale);
        notes.push(...pkg.warnings);
        outputs.push({
          name: `${dir}${projectSlug}-${artboardSlug}-animation.zip`,
          blob: new Blob([pkg.zip], { type: 'application/zip' }),
        });
      }
      setRuntimeFidelityNotes(notes);
      if (outputs.length === 1) {
        await files.downloadBlob(outputs[0].blob, outputs[0].name);
      } else {
        const entries = await Promise.all(
          outputs.map(async (o) => ({ name: o.name, data: await blobToBytes(o.blob) })),
        );
        await files.downloadBlob(createZip(entries), `${projectSlug}-animation.zip`);
      }
      setStatus(t('export.done'));
    } catch (error) {
      console.error('[Calqo] animation package export failed', error);
      setStatus(t('export.failed'));
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async () => {
    if (isAnimation(format)) {
      await handleAnimatedExport();
      return;
    }
    if (
      format === 'html' &&
      htmlKind === 'editable' &&
      htmlAnimOutput === 'package' &&
      animatable
    ) {
      await handlePackageExport();
      return;
    }
    setBusy(true);
    setStatus(null);
    // Collision-free stems so a batch with duplicate artboard names never
    // overwrites earlier files (plan Phase K).
    const stems = uniqueArtboardStems(targets, slug);
    const total = totalOutputs;
    setProgress({ done: 0, total });
    // Fidelity notes accumulate across the whole batch (deduplicated), so a
    // multi-artboard export never shows only the last artboard's notes.
    const notes: HtmlExportWarning[] = [];
    setRuntimeFidelityNotes([]);
    try {
      const outputs = [];
      for (const locale of localeTargets) {
        for (let i = 0; i < targets.length; i++) {
          outputs.push(await renderTarget(targets[i], stems[i], locale, notes));
          setProgress({ done: outputs.length, total });
        }
      }
      setRuntimeFidelityNotes(notes);
      if (outputs.length === 1) {
        await files.downloadBlob(outputs[0].blob, outputs[0].name);
      } else {
        // Bundle every artboard into one ZIP — a single download the browser
        // won't block, unlike a burst of per-file downloads.
        const entries = await Promise.all(
          outputs.map(async (o) => ({ name: o.name, data: await blobToBytes(o.blob) })),
        );
        await files.downloadBlob(createZip(entries), `${slug(project.name)}.zip`);
      }
      setStatus(t('export.done'));
    } catch (error) {
      console.error('[Calqo] export failed', error);
      setStatus(t('export.failed'));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const handleCopyImage = async () => {
    if (!isRaster(format)) return;
    setBusy(true);
    setStatus(null);
    try {
      const blob = await renderRaster(artboard, 'png', project.activeContentLocale);
      const ok = await clipboard.writeImage(blob);
      setStatus(ok ? t('export.copied') : t('export.copyUnsupported'));
    } catch {
      setStatus(t('export.copyUnsupported'));
    } finally {
      setBusy(false);
    }
  };

  const handleCopyHtml = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const blob = await renderRaster(artboard, 'png', project.activeContentLocale);
      const pngDataUrl = await blobToDataUrl(blob);
      const html = htmlSnippet({
        title: `${project.name} — ${artboard.name}`,
        width: artboard.width,
        height: artboard.height,
        pngDataUrl,
      });
      const ok = await clipboard.writeText(html);
      setStatus(ok ? t('export.copied') : t('export.copyUnsupported'));
    } catch {
      setStatus(t('export.copyUnsupported'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalOverlay
      open={open}
      onClose={onClose}
      labelledBy="export-title"
      className="glass glass-strong w-[min(540px,100%)] rounded-[28px] border border-[var(--calqo-divider)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
    >
      <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="export-title" className="text-[16px] font-semibold text-[var(--calqo-text)]">
              {t('export.title')}
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--calqo-text-3)]">
              {t(animationMode ? 'export.animationSubtitle' : 'export.subtitle')}
            </p>
          </div>
          <GlassIconButton label={t('export.close')} onClick={onClose}>
            <X size={15} />
          </GlassIconButton>
        </header>

        <div className="space-y-4">
          <Field label={t('export.format')}>
            <GlassSegmentedControl<Format>
              ariaLabel={t('export.format')}
              className="flex w-full flex-wrap [&>button]:flex-1"
              value={format}
              onChange={setFormat}
              options={
                animationMode
                  ? [
                      {
                        value: 'mp4',
                        label: 'MP4',
                        disabled: !animatable,
                        disabledReason: t('export.videoNotAnimated'),
                      },
                      {
                        value: 'gif',
                        label: 'GIF',
                        disabled: !animatable,
                        disabledReason: t('export.videoNotAnimated'),
                      },
                    ]
                  : [
                      { value: 'png', label: 'PNG' },
                      { value: 'jpeg', label: 'JPG' },
                      { value: 'webp', label: 'WebP' },
                      { value: 'svg', label: 'SVG' },
                      { value: 'html', label: 'HTML' },
                    ]
              }
            />
          </Field>

          {animationMode && !animatable && (
            <div className="rounded-[var(--calqo-radius-sm)] border border-[#E8B339]/40 bg-[#E8B339]/10 px-3 py-2 text-[11px] text-[#B7791F]">
              {t('export.videoNotAnimated')}
            </div>
          )}

          {isAnimation(format) && animatable && (
            <div className="rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] px-3 py-2 text-[11px] text-[var(--calqo-text-3)]">
              {format === 'mp4' ? (
                <>
                  <p className="text-[var(--calqo-text-2)]">
                    {t('export.videoSummary', {
                      width: videoDims.width,
                      height: videoDims.height,
                      fps: clipFps,
                      seconds: (sceneDurationMs / 1000).toFixed(1),
                      frames: videoFrameCount,
                    })}
                  </p>
                  <p className="mt-0.5">{t('export.codecH264')}</p>
                  {videoCaps && !h264Usable && (
                    <p className="mt-1 text-[#B7791F]">{t('export.videoUnavailable')}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[var(--calqo-text-2)]">
                    {t('export.videoSummary', {
                      width: gifPlan.width,
                      height: gifPlan.height,
                      fps: gifPlan.fps,
                      seconds: (gifPlan.durationMs / 1000).toFixed(1),
                      frames: gifPlan.frameCount,
                    })}
                  </p>
                  <p className="mt-0.5">
                    {t('export.gifCapsHint', {
                      seconds: GIF_CAPS.maxDurationMs / 1000,
                      size: GIF_CAPS.maxLongEdge,
                      fps: GIF_CAPS.maxFps,
                    })}
                  </p>
                </>
              )}
            </div>
          )}

          {(isRaster(format) || format === 'html') && (
            <Field label={t('export.scale')}>
              <GlassSegmentedControl<Scale>
                ariaLabel={t('export.scale')}
                value={scale}
                onChange={setScale}
                options={[
                  { value: '1', label: '1x' },
                  { value: '2', label: '2x' },
                  { value: '3', label: '3x' },
                ]}
              />
            </Field>
          )}

          {transparentSupported && (
            <Field label={t('export.background')}>
              <GlassSegmentedControl<'normal' | 'transparent'>
                ariaLabel={t('export.background')}
                value={transparent ? 'transparent' : 'normal'}
                onChange={(value) => setTransparent(value === 'transparent')}
                options={[
                  { value: 'normal', label: t('export.bgNormal') },
                  { value: 'transparent', label: t('export.bgTransparent') },
                ]}
              />
            </Field>
          )}

          {qualitySupported && (
            <Field label={t('export.quality')}>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={Math.round(quality * 100)}
                  onChange={(e) => setQuality(Number(e.target.value) / 100)}
                  className="flex-1 accent-[var(--calqo-accent)]"
                />
                <span className="mono w-9 text-right text-[11px] text-[var(--calqo-text-3)]">
                  {Math.round(quality * 100)}
                </span>
              </div>
            </Field>
          )}

          {format === 'html' && (
            <Field label={t('export.htmlKind')}>
              <GlassSegmentedControl<HtmlKind>
                ariaLabel={t('export.htmlKind')}
                value={htmlKind}
                onChange={setHtmlKind}
                options={[
                  { value: 'wrapper', label: t('export.htmlWrapper') },
                  { value: 'editable', label: t('export.htmlEditable') },
                ]}
              />
            </Field>
          )}

          {format === 'html' && htmlKind === 'editable' && (
            <p className="px-1 text-[11px] text-[var(--calqo-text-3)]">
              {t('export.htmlEditableHint')}
            </p>
          )}

          {format === 'html' && htmlKind === 'editable' && animatable && (
            <Field label={t('export.htmlAnimOutput')}>
              <GlassSegmentedControl<'file' | 'package'>
                ariaLabel={t('export.htmlAnimOutput')}
                value={htmlAnimOutput}
                onChange={setHtmlAnimOutput}
                options={[
                  { value: 'file', label: t('export.htmlAnimFile') },
                  { value: 'package', label: t('export.htmlAnimPackage') },
                ]}
              />
            </Field>
          )}

          {format === 'html' && htmlKind === 'wrapper' && (
            <Field label={t('export.htmlMode')}>
              <GlassSegmentedControl<HtmlMode>
                ariaLabel={t('export.htmlMode')}
                value={htmlMode}
                onChange={setHtmlMode}
                options={[
                  { value: 'standalone', label: t('export.standalone') },
                  { value: 'snippet', label: t('export.snippet') },
                ]}
              />
            </Field>
          )}

          {!isAnimation(format) && (
            <Field label={t('export.scope')}>
              <GlassSegmentedControl<Scope>
                ariaLabel={t('export.scope')}
                value={scope}
                onChange={setScope}
                options={[
                  { value: 'active', label: t('export.activeArtboard') },
                  { value: 'all', label: t('export.allArtboards', { count: project.artboards.length }) },
                ]}
              />
            </Field>
          )}

          {project.contentLocales.length > 1 && (
            <Field label={t('export.localeScope')}>
              <GlassSegmentedControl<Scope>
                ariaLabel={t('export.localeScope')}
                value={localeScope}
                onChange={setLocaleScope}
                options={[
                  {
                    value: 'active',
                    label: t('export.activeLocale', {
                      locale: localeLabel(project.activeContentLocale, i18n.language),
                    }),
                  },
                  {
                    value: 'all',
                    label: t('export.allLocales', { count: project.contentLocales.length }),
                  },
                ]}
              />
            </Field>
          )}

          <div className="rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] px-3 py-2">
            <span className="text-[11px] text-[var(--calqo-text-3)]">{t('export.filename')}</span>
            <p className="mono mt-0.5 truncate text-[12px] text-[var(--calqo-text-2)]">{filename}</p>
          </div>

          {(warnings.length > 0 || envelopeTooBig || missingAssetCount > 0) && (
            <div className="rounded-[var(--calqo-radius-sm)] border border-[#E8B339]/40 bg-[#E8B339]/10 px-3 py-2">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[#B7791F]">
                <AlertTriangle size={12} />
                {t('export.warnings')}
              </p>
              <ul className="space-y-0.5">
                {warnings.map((w) => (
                  <li key={w} className="text-[11px] text-[var(--calqo-text-2)]">
                    {w}
                  </li>
                ))}
                {envelopeTooBig && envelopeEstimate !== null && (
                  <li className="text-[11px] text-[var(--calqo-text-2)]">
                    {t('export.warnEnvelopeSize', {
                      size: (envelopeEstimate / (1024 * 1024)).toFixed(0),
                    })}
                  </li>
                )}
                {envelopeTooBig && envelopeContributors.length > 0 && (
                  <li className="text-[11px] text-[var(--calqo-text-2)]">
                    {t('export.warnEnvelopeContributors', {
                      names: envelopeContributors.join(', '),
                    })}
                  </li>
                )}
              </ul>
              <div className="mt-1.5 flex flex-wrap gap-3">
                {missingAssetCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setRepairAssetsOpen(true)}
                    className="text-[11px] font-medium text-[var(--calqo-accent)] hover:underline"
                  >
                    {t('repairAssets.open')}
                  </button>
                )}
                {envelopeTooBig && (
                  <button
                    type="button"
                    onClick={() => setOptimizeAssetsOpen(true)}
                    className="text-[11px] font-medium text-[var(--calqo-accent)] hover:underline"
                  >
                    {t('optimizeAssets.open')}
                  </button>
                )}
              </div>
            </div>
          )}

          {fidelityNotes.length > 0 && format === 'html' && htmlKind === 'editable' && (
            <div className="rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] px-3 py-2">
              <p className="mb-1 text-[11px] font-semibold text-[var(--calqo-text-2)]">
                {t('export.fidelityNotes')}
              </p>
              <ul className="max-h-28 space-y-0.5 overflow-y-auto calqo-scroll">
                {fidelityNotes.map((note) => (
                  <li key={warningIdentity(note)} className="text-[11px] text-[var(--calqo-text-3)]">
                    {formatHtmlWarning(note, t)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {animExportWarnings.length > 0 && isAnimation(format) && (
            <div className="rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] px-3 py-2">
              <p className="mb-1 text-[11px] font-semibold text-[var(--calqo-text-2)]">
                {t('export.animWarningsTitle')}
              </p>
              <ul className="max-h-28 space-y-0.5 overflow-y-auto calqo-scroll">
                {animExportWarnings.map((w) => (
                  <li key={animWarningIdentity(w)} className="text-[11px] text-[var(--calqo-text-3)]">
                    {t(`export.animWarnings.${w.code}`, w.params)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <footer className="mt-5 flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[12px] text-[var(--calqo-text-3)]">
            {status && <Check size={13} className="text-[var(--calqo-accent)]" />}
            {status}
          </span>
          <div className="flex items-center gap-2">
            {isRaster(format) && (
              <GlassButton onClick={handleCopyImage} disabled={busy}>
                <Copy size={14} />
                {t('export.copyImage')}
              </GlassButton>
            )}
            {format === 'html' && htmlKind === 'wrapper' && (
              <GlassButton onClick={handleCopyHtml} disabled={busy}>
                <Copy size={14} />
                {t('export.copySnippet')}
              </GlassButton>
            )}
            {busy && isAnimation(format) && (
              <GlassButton onClick={() => abortRef.current?.abort()}>
                {t('export.videoCancel')}
              </GlassButton>
            )}
            <GlassButton
              variant="primary"
              onClick={handleExport}
              disabled={
                busy ||
                (isAnimation(format) && !animatable) ||
                (format === 'mp4' && videoCaps !== null && !h264Usable)
              }
              loading={busy}
            >
              {!busy && <Download size={14} />}
              {busy ? animationBusyLabel(format, animProgress, progress, t) : t('export.download')}
            </GlassButton>
          </div>
        </footer>
    </ModalOverlay>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-center gap-3">
      <span className="text-[12px] font-medium text-[var(--calqo-text-2)]">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'calqo'
  );
}

/** De-duplicate structured animation warnings by their identity. */
function dedupeAnimWarnings(warnings: AnimExportWarning[]): AnimExportWarning[] {
  return [...new Map(warnings.map((w) => [animWarningIdentity(w), w])).values()];
}

/** The primary button's busy label: per-frame progress for animation, the
 * batch counter for static exports, or the generic spinner. */
function animationBusyLabel(
  format: Format,
  animProgress: { done: number; total: number } | null,
  progress: { done: number; total: number } | null,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (isAnimation(format)) {
    if (animProgress) {
      return t('export.videoRendering', {
        done: animProgress.done,
        total: animProgress.total,
      });
    }
    return t('export.videoEncoding');
  }
  return progress && progress.total > 1
    ? t('export.workingCount', { done: progress.done, total: progress.total })
    : t('export.working');
}

function formatHtmlWarning(
  warning: HtmlExportWarning,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const reason = warning.reason
    ? t(`export.htmlWarnings.reasons.${warning.reason}`)
    : undefined;
  return t(`export.htmlWarnings.codes.${warning.code}`, {
    name: warning.layerName ?? '',
    reason,
  });
}
