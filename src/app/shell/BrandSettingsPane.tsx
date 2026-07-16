import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { GlassButton, GlassIconButton } from '@/components/glass';
import { assetStorage, dialog } from '@/lib/adapters';
import type { BrandProfileRecord } from '@/lib/adapters';
import {
  clearBrandLogo,
  createBrandProfile,
  deleteBrandProfile,
  listBrandProfiles,
  saveBrandProfile,
  setBrandLogo,
} from '@/editor/brand/brandService';
import { insertBrandLogo } from '@/editor/commands/projectCommands';
import { measureImageFile } from '@/lib/utils/imageAsset';
import { useFontOptions } from '@/lib/hooks/useFontOptions';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import type { GlossaryEntry } from '@/lib/schema';

function LogoPreview({ assetId }: { assetId?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    setUrl(null);
    if (!assetId) return undefined;
    void assetStorage.getAssetBlob(assetId).then((blob) => {
      if (!blob) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [assetId]);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      className="h-10 w-10 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] object-contain"
    />
  );
}

/** Brand Lite profile CRUD (Settings ▸ Brand): palette, fonts, logo, and
 * do-not-translate glossary defaults that seed new projects and prompts. */
export function BrandSettingsPane() {
  const { t } = useTranslation('common');
  const [profiles, setProfiles] = useState<BrandProfileRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newColor, setNewColor] = useState('#0A2540');
  const logoInputRef = useRef<HTMLInputElement>(null);
  const fontOptions = useFontOptions();
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);
  const [logoStatus, setLogoStatus] = useState<string | null>(null);
  const profilesRef = useRef<BrandProfileRecord[]>([]);

  const refresh = async (keep?: string) => {
    const list = await listBrandProfiles();
    profilesRef.current = list;
    setProfiles(list);
    setSelectedId((prev) => keep ?? prev ?? list[0]?.id ?? null);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const selected = profiles.find((profile) => profile.id === selectedId) ?? null;

  const update = async (patch: Partial<BrandProfileRecord>) => {
    const current = profilesRef.current.find((profile) => profile.id === selectedId);
    if (!current) return;
    const next = { ...current, ...patch };
    profilesRef.current = profilesRef.current.map((profile) =>
      profile.id === next.id ? next : profile,
    );
    setProfiles(profilesRef.current);
    await saveBrandProfile(next);
  };

  const addProfile = async () => {
    const record = await createBrandProfile(t('settings.brand.newName'));
    await refresh(record.id);
  };

  const removeProfile = async () => {
    if (!selected) return;
    const confirmed = await dialog.confirm({
      title: t('settings.brand.deleteTitle'),
      message: t('settings.brand.deleteMessage', { name: selected.name }),
    });
    if (!confirmed) return;
    await deleteBrandProfile(selected.id);
    setSelectedId(null);
    await refresh();
  };

  const uploadLogo = async (file: File) => {
    if (!selected) return;
    const measured = await measureImageFile(file);
    await setBrandLogo(selected, file, {
      name: file.name,
      mimeType: file.type,
      width: measured.width,
      height: measured.height,
    });
    await refresh(selected.id);
  };

  const insertLogo = async () => {
    if (!selected || !activeProjectId) return;
    setLogoStatus(null);
    const ok = await insertBrandLogo(activeProjectId, selected);
    setLogoStatus(ok ? t('settings.brand.logoInserted') : t('settings.brand.logoInsertFailed'));
  };

  const updateGlossaryEntry = (index: number, patch: Partial<GlossaryEntry>) => {
    if (!selected) return;
    const glossary = selected.glossary.map((entry, i) =>
      i === index ? { ...entry, ...patch } : entry,
    );
    void update({ glossary });
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <select
          aria-label={t('settings.brand.profile')}
          value={selectedId ?? ''}
          onChange={(event) => setSelectedId(event.target.value || null)}
          className="h-9 min-w-0 flex-1 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-3 text-[13px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
        >
          {profiles.length === 0 && (
            <option value="">{t('settings.brand.none')}</option>
          )}
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
        <GlassButton onClick={() => void addProfile()}>
          <Plus size={14} />
          {t('settings.brand.add')}
        </GlassButton>
        {selected && (
          <GlassIconButton
            label={t('settings.brand.delete')}
            onClick={() => void removeProfile()}
          >
            <Trash2 size={14} />
          </GlassIconButton>
        )}
      </div>

      {!selected ? (
        <p className="text-[12.5px] text-[var(--calqo-text-3)]">
          {t('settings.brand.emptyHint')}
        </p>
      ) : (
        <>
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-[var(--calqo-text-2)]">
              {t('settings.brand.name')}
            </span>
            <input
              value={selected.name}
              onChange={(event) => void update({ name: event.target.value })}
              className="h-9 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-3 text-[13px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
            />
          </label>

          <div className="space-y-1.5">
            <span className="text-[12px] font-medium text-[var(--calqo-text-2)]">
              {t('settings.brand.palette')}
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {selected.palette.map((color, index) => (
                <span
                  key={`${color}-${index}`}
                  className="group relative inline-flex"
                >
                  <span
                    className="h-7 w-7 rounded-full ring-1 ring-black/10"
                    style={{ background: color }}
                    title={color}
                  />
                  <button
                    type="button"
                    aria-label={t('settings.brand.removeColor', { color })}
                    onClick={() =>
                      void update({
                        palette: selected.palette.filter((_, i) => i !== index),
                      })
                    }
                    className="touch-hitarea absolute -right-1 -top-1 hidden h-4 w-4 place-items-center rounded-full bg-[var(--calqo-glass-strong,#333)] text-white group-hover:grid any-pointer-coarse:grid"
                  >
                    <X size={9} />
                  </button>
                </span>
              ))}
              <input
                type="color"
                aria-label={t('settings.brand.pickColor')}
                value={newColor}
                onChange={(event) => setNewColor(event.target.value)}
                className="h-7 w-9 cursor-pointer rounded border border-[var(--calqo-divider)] bg-transparent"
              />
              <GlassButton
                onClick={() => void update({ palette: [...selected.palette, newColor] })}
              >
                <Plus size={13} />
                {t('settings.brand.addColor')}
              </GlassButton>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-[var(--calqo-text-2)]">
                {t('settings.brand.headingFont')}
              </span>
              <select
                value={selected.headingFont ?? ''}
                onChange={(event) =>
                  void update({ headingFont: event.target.value || undefined })
                }
                className="h-9 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 text-[12.5px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
              >
                <option value="">{t('settings.brand.fontDefault')}</option>
                {fontOptions.map((font) => (
                  <option key={font.family} value={font.family}>
                    {font.family}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-[var(--calqo-text-2)]">
                {t('settings.brand.bodyFont')}
              </span>
              <select
                value={selected.bodyFont ?? ''}
                onChange={(event) =>
                  void update({ bodyFont: event.target.value || undefined })
                }
                className="h-9 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 text-[12.5px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
              >
                <option value="">{t('settings.brand.fontDefault')}</option>
                {fontOptions.map((font) => (
                  <option key={font.family} value={font.family}>
                    {font.family}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-1.5">
            <span className="text-[12px] font-medium text-[var(--calqo-text-2)]">
              {t('settings.brand.logo')}
            </span>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void uploadLogo(file);
                event.currentTarget.value = '';
              }}
            />
            <div className="flex items-center gap-2">
              <LogoPreview assetId={selected.logoAssetId} />
              <GlassButton onClick={() => logoInputRef.current?.click()}>
                <ImagePlus size={13} />
                {selected.logoAssetId
                  ? t('settings.brand.replaceLogo')
                  : t('settings.brand.uploadLogo')}
              </GlassButton>
              {selected.logoAssetId && (
                <>
                  <GlassButton
                    disabled={!activeProjectId}
                    onClick={() => void insertLogo()}
                  >
                    {t('settings.brand.insertLogo')}
                  </GlassButton>
                  <GlassIconButton
                    label={t('settings.brand.removeLogo')}
                    onClick={() =>
                      void clearBrandLogo(selected).then(() => refresh(selected.id))
                    }
                  >
                    <Trash2 size={13} />
                  </GlassIconButton>
                </>
              )}
            </div>
            {logoStatus && (
              <p className="text-[11.5px] text-[var(--calqo-text-3)]">{logoStatus}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-[var(--calqo-text-2)]">
                {t('settings.brand.glossary')}
              </span>
              <GlassButton
                onClick={() =>
                  void update({
                    glossary: [
                      ...selected.glossary,
                      { source: '', mode: 'do-not-translate' },
                    ],
                  })
                }
              >
                <Plus size={13} />
                {t('settings.brand.addTerm')}
              </GlassButton>
            </div>
            <p className="text-[11px] text-[var(--calqo-text-3)]">
              {t('settings.brand.glossaryHint')}
            </p>
            {selected.glossary.map((entry, index) => (
              <div key={index} className="flex items-center gap-1.5">
                <input
                  value={entry.source}
                  placeholder={t('settings.brand.term')}
                  onChange={(event) =>
                    updateGlossaryEntry(index, { source: event.target.value })
                  }
                  className="h-8 min-w-0 flex-1 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 text-[12px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
                />
                <select
                  value={entry.mode}
                  aria-label={t('settings.brand.termMode')}
                  onChange={(event) =>
                    updateGlossaryEntry(index, {
                      mode: event.target.value as GlossaryEntry['mode'],
                    })
                  }
                  className="h-8 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-1.5 text-[11.5px] text-[var(--calqo-text)] outline-none"
                >
                  <option value="do-not-translate">
                    {t('settings.brand.doNotTranslate')}
                  </option>
                  <option value="preferred-translation">
                    {t('settings.brand.preferred')}
                  </option>
                </select>
                {entry.mode === 'preferred-translation' && (
                  <input
                    value={entry.target ?? ''}
                    placeholder={t('settings.brand.preferredValue')}
                    onChange={(event) =>
                      updateGlossaryEntry(index, { target: event.target.value })
                    }
                    className="h-8 min-w-0 flex-1 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 text-[12px] text-[var(--calqo-text)] outline-none"
                  />
                )}
                <GlassIconButton
                  label={t('settings.brand.removeTerm')}
                  onClick={() =>
                    void update({
                      glossary: selected.glossary.filter((_, i) => i !== index),
                    })
                  }
                >
                  <X size={12} />
                </GlassIconButton>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
