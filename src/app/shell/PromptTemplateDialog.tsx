import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, ImagePlus, Sparkles, X } from 'lucide-react';
import { GlassButton, GlassIconButton, ModalOverlay } from '@/components/glass';
import { clipboard } from '@/lib/adapters';
import { extractPalette } from '@/lib/utils/palette';
import {
  COMMON_CONTENT_LOCALES,
  localeLabel,
} from '@/editor/i18n-content/contentLocaleService';
import { ARTBOARD_PRESET_LIST, type ArtboardPresetId } from '@/lib/schema/presets';
import { generateTemplate } from '@/editor/ai/promptTemplateService';
import { getProvider } from '@/editor/ai/providerRegistry';
import { useAiSettingsStore } from '@/editor/ai/aiSettings';
import { listBrandProfiles } from '@/editor/brand/brandService';
import type { BrandProfileRecord } from '@/lib/adapters';
import { adoptProject, applyBrandProfile } from '@/editor/commands/projectCommands';
import { useActiveProject } from '@/lib/state/selectors';
import { useUiStore } from '@/lib/state/uiStore';
import type { LocaleCode } from '@/lib/schema';
import type { AIProviderDiagnostics } from '@/editor/ai/AIProvider';

export function PromptTemplateDialog() {
  const aiDialog = useUiStore((s) => s.aiDialog);
  if (aiDialog !== 'template') return null;
  return <PromptTemplateDialogInner />;
}

interface FailState {
  error: string;
  issues?: string[];
  raw: string;
  diagnostics?: AIProviderDiagnostics;
}

function PromptTemplateDialogInner() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const setAiDialog = useUiStore((s) => s.setAiDialog);
  const settings = useAiSettingsStore((s) => s.settings);
  const close = () => setAiDialog('none');

  const [prompt, setPrompt] = useState('');
  const [preset, setPreset] = useState<ArtboardPresetId>('ig-square');
  const [locale, setLocale] = useState<LocaleCode>(
    project?.activeContentLocale ?? 'en',
  );
  const [usePalette, setUsePalette] = useState(
    (project?.palette.length ?? 0) > 0,
  );
  const [profiles, setProfiles] = useState<BrandProfileRecord[]>([]);
  const [profileId, setProfileId] = useState('');

  useEffect(() => {
    let alive = true;
    void listBrandProfiles().then((list) => {
      if (alive) setProfiles(list);
    });
    return () => {
      alive = false;
    };
  }, []);
  const [referenceUrl, setReferenceUrl] = useState('');
  const [referencePalette, setReferencePalette] = useState<string[]>([]);
  const [referenceName, setReferenceName] = useState<string | null>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<FailState | null>(null);

  const onPickReference = async (file: File) => {
    setReferenceName(file.name);
    const palette = await extractPalette(file);
    setReferencePalette(palette);
  };

  const clearReference = () => {
    setReferenceName(null);
    setReferencePalette([]);
    setReferenceUrl('');
  };

  const generate = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    setFailure(null);
    try {
      const provider = getProvider(settings);
      if (!provider) {
        setBusy(false);
        return;
      }
      const hasReference = referencePalette.length > 0 || referenceUrl.trim().length > 0;
      const brandProfile = profiles.find((candidate) => candidate.id === profileId);
      // Precedence: an explicit style-reference palette wins, then the brand
      // profile, then the open project's palette. Only family names and colours
      // enter the prompt — never keys or blobs.
      const effectivePalette = referencePalette.length
        ? referencePalette
        : brandProfile?.palette.length
          ? brandProfile.palette
          : usePalette
            ? project?.palette
            : undefined;
      const validation = await generateTemplate(provider, {
        prompt: prompt.trim(),
        preset,
        locale,
        palette: effectivePalette,
        brandFonts: brandProfile
          ? { heading: brandProfile.headingFont, body: brandProfile.bodyFont }
          : undefined,
        styleReference: hasReference
          ? {
              url: referenceUrl.trim() || undefined,
              palette: referencePalette.length ? referencePalette : undefined,
            }
          : undefined,
      });
      if (validation.ok) {
        const newProjectId = await adoptProject(validation.project);
        if (brandProfile) applyBrandProfile(newProjectId, brandProfile);
        close();
      } else {
        setFailure({
          error: validation.error,
          issues: validation.issues,
          raw: validation.raw,
          diagnostics: validation.diagnostics,
        });
      }
    } catch (error) {
      console.error('[Calqo] template generation failed', error);
      setFailure({ error: t('promptTemplate.failed'), raw: String(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalOverlay
      open
      onClose={close}
      labelledBy="prompt-template-title"
      className="glass glass-strong w-[min(560px,100%)] rounded-[28px] border border-[var(--calqo-divider)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
    >
      <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2
              id="prompt-template-title"
              className="flex items-center gap-2 text-[16px] font-semibold text-[var(--calqo-text)]"
            >
              <Sparkles size={17} className="text-[var(--calqo-accent)]" />
              {t('promptTemplate.title')}
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--calqo-text-3)]">
              {t('promptTemplate.subtitle')}
            </p>
          </div>
          <GlassIconButton label={t('export.close')} onClick={close}>
            <X size={15} />
          </GlassIconButton>
        </header>

        <div className="space-y-4">
          <textarea
            autoFocus
            value={prompt}
            placeholder={t('promptTemplate.placeholder')}
            onChange={(event) => setPrompt(event.target.value)}
            className="min-h-24 w-full resize-y rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-3 py-2.5 text-[13px] text-[var(--calqo-text)] outline-none transition-colors focus:border-[var(--calqo-accent)] focus:ring-2 focus:ring-[var(--calqo-accent-ring)]"
          />

          <Field label={t('promptTemplate.format')}>
            <select
              aria-label={t('promptTemplate.format')}
              value={preset}
              onChange={(event) => setPreset(event.target.value as ArtboardPresetId)}
              className="h-9 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 text-[12.5px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
            >
              {ARTBOARD_PRESET_LIST.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.width}×{p.height})
                </option>
              ))}
            </select>
          </Field>

          <Field label={t('promptTemplate.locale')}>
            <select
              aria-label={t('promptTemplate.locale')}
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              className="h-9 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 text-[12.5px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
            >
              {COMMON_CONTENT_LOCALES.map((l) => (
                <option key={l.code} value={l.code}>
                  {localeLabel(l.code)} ({l.code})
                </option>
              ))}
            </select>
          </Field>

          {profiles.length > 0 && (
            <Field label={t('promptTemplate.brandProfile')}>
              <select
                aria-label={t('promptTemplate.brandProfile')}
                value={profileId}
                onChange={(event) => setProfileId(event.target.value)}
                className="h-9 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 text-[12.5px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
              >
                <option value="">{t('promptTemplate.noBrandProfile')}</option>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {(project?.palette.length ?? 0) > 0 && (
            <label className="flex cursor-pointer items-center gap-2 px-1 text-[12px] text-[var(--calqo-text-2)]">
              <input
                type="checkbox"
                checked={usePalette}
                onChange={(event) => setUsePalette(event.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--calqo-accent)]"
              />
              {t('promptTemplate.usePalette')}
              <span className="flex gap-1">
                {project?.palette.slice(0, 5).map((c, i) => (
                  <span
                    key={`${c}-${i}`}
                    className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
                    style={{ background: c }}
                  />
                ))}
              </span>
            </label>
          )}

          <div className="space-y-2 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] p-2.5">
            <p className="text-[11.5px] font-medium text-[var(--calqo-text-2)]">
              {t('promptTemplate.styleReference')}
            </p>
            <input
              ref={referenceInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onPickReference(file);
                event.currentTarget.value = '';
              }}
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => referenceInputRef.current?.click()}
                className="flex h-8 items-center gap-1.5 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] px-2.5 text-[11.5px] text-[var(--calqo-text-2)] hover:bg-[var(--calqo-hover)]"
              >
                <ImagePlus size={13} />
                {t('promptTemplate.referenceImage')}
              </button>
              {referenceName && (
                <span className="flex min-w-0 items-center gap-1.5">
                  {referencePalette.map((c, i) => (
                    <span
                      key={`${c}-${i}`}
                      className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
                      style={{ background: c }}
                    />
                  ))}
                  <span className="truncate text-[11px] text-[var(--calqo-text-3)]">
                    {referenceName}
                  </span>
                  <button
                    type="button"
                    aria-label={t('promptTemplate.removeReference')}
                    onClick={clearReference}
                    className="text-[var(--calqo-text-3)] hover:text-[var(--calqo-text)]"
                  >
                    <X size={12} />
                  </button>
                </span>
              )}
            </div>
            <input
              type="url"
              value={referenceUrl}
              placeholder={t('promptTemplate.referenceUrl')}
              onChange={(event) => setReferenceUrl(event.target.value)}
              className="h-8 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2.5 text-[12px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
            />
          </div>

          {failure && (
            <div className="rounded-[var(--calqo-radius-sm)] border border-[#FF5F57]/40 bg-[#FF5F57]/10 p-3">
              <p className="text-[12px] font-semibold text-[#B42318]">
                {t('promptTemplate.invalid')}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--calqo-text-2)]">
                {failure.error}
              </p>
              {failure.issues && failure.issues.length > 0 && (
                <ul className="mt-1 max-h-24 space-y-0.5 overflow-y-auto calqo-scroll">
                  {failure.issues.map((issue) => (
                    <li key={issue} className="mono text-[10.5px] text-[var(--calqo-text-3)]">
                      {issue}
                    </li>
                  ))}
                </ul>
              )}
              {failure.diagnostics && (
                <dl className="mt-2 grid grid-cols-[76px_1fr] gap-x-2 gap-y-1 rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-glass-thin)] p-2 text-[10.5px]">
                  <dt className="text-[var(--calqo-text-3)]">{t('promptTemplate.provider')}</dt>
                  <dd className="mono truncate text-[var(--calqo-text-2)]">
                    {failure.diagnostics.providerId}
                  </dd>
                  {failure.diagnostics.modelId && (
                    <>
                      <dt className="text-[var(--calqo-text-3)]">{t('promptTemplate.model')}</dt>
                      <dd className="mono truncate text-[var(--calqo-text-2)]">
                        {failure.diagnostics.modelId}
                      </dd>
                    </>
                  )}
                  <dt className="text-[var(--calqo-text-3)]">{t('promptTemplate.retries')}</dt>
                  <dd className="mono text-[var(--calqo-text-2)]">
                    {failure.diagnostics.retryCount ?? 0}
                  </dd>
                </dl>
              )}
              <button
                type="button"
                onClick={() => void clipboard.writeText(failure.raw)}
                className="mt-2 flex items-center gap-1 text-[11px] font-medium text-[var(--calqo-accent)] hover:underline"
              >
                <Copy size={12} />
                {t('promptTemplate.copyRaw')}
              </button>
            </div>
          )}
        </div>

        <footer className="mt-5 flex items-center justify-end gap-2">
          <GlassButton onClick={close}>{t('export.close')}</GlassButton>
          <GlassButton
            variant="primary"
            onClick={generate}
            disabled={busy || !prompt.trim()}
            loading={busy}
          >
            {!busy && <Sparkles size={14} />}
            {busy ? t('promptTemplate.generating') : t('promptTemplate.generate')}
          </GlassButton>
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
