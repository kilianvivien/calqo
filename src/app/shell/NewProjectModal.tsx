import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Download, FileText, Pencil, Trash2, X } from 'lucide-react';
import {
  GlassButton,
  GlassIconButton,
  GlassSegmentedControl,
  ModalOverlay,
} from '@/components/glass';
import {
  ARTBOARD_PRESET_LIST,
  type ArtboardPresetId,
} from '@/lib/schema/presets';
import type {
  BrandProfileRecord,
  CalqoFile,
  StarterRecord,
} from '@/lib/adapters';
import { dialog } from '@/lib/adapters';
import { ArtboardThumbnail } from '@/editor/canvas/ArtboardThumbnail';
import {
  createProjectFromStarter,
  deleteUserStarter,
  duplicateUserStarter,
  exportUserStarter,
  fetchBundledStarterIndex,
  listUserStarters,
  loadBundledStarterEnvelope,
  renameUserStarter,
  type StarterIndexEntry,
} from '@/editor/starters/starterService';
import { listBrandProfiles } from '@/editor/brand/brandService';
import {
  applyBrandProfile,
  createProject,
} from '@/editor/commands/projectCommands';
import { safeImportProject, type CalqoProject } from '@/lib/schema';
import { useUiStore } from '@/lib/state/uiStore';

/** Proportional preset cards for choosing a social-media format. Shared by the
 * New-project modal and the empty-canvas state. */
export function FormatGrid({
  onSelect,
}: {
  onSelect: (preset: ArtboardPresetId) => void;
}) {
  const { t } = useTranslation('editor');
  return (
    <div className="grid grid-cols-2 gap-2 py-1 sm:grid-cols-4">
      {ARTBOARD_PRESET_LIST.map((preset) => {
        const ratio = preset.width / preset.height;
        const label = t(`presets.${preset.id}`, { defaultValue: preset.name });
        return (
          <button
            key={preset.id}
            type="button"
            aria-label={`${label} ${preset.width} x ${preset.height}`}
            onClick={() => onSelect(preset.id as ArtboardPresetId)}
            className="min-w-0 rounded-[12px] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] p-3 text-left transition-[border-color,background,box-shadow,transform] duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-out)] hover:-translate-y-0.5 hover:border-[var(--calqo-accent)] hover:bg-[var(--calqo-accent-soft)] hover:shadow-[0_0_0_2px_var(--calqo-accent-ring)]"
          >
            <span className="mb-3 flex h-16 items-center justify-center">
              <span
                className="block rounded-[5px] border border-[var(--calqo-accent)] bg-white/85 shadow-[0_6px_20px_rgba(0,0,0,0.18)]"
                style={
                  ratio >= 1
                    ? { width: '46px', height: `${Math.max(18, 46 / ratio)}px` }
                    : { height: '52px', width: `${Math.max(18, 52 * ratio)}px` }
                }
              />
            </span>
            <span className="block truncate text-[12px] font-semibold text-[var(--calqo-text)]">
              {label}
            </span>
            <span className="mono mt-0.5 block truncate text-[10px] text-[var(--calqo-text-3)]">
              {preset.width} x {preset.height}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export type NewProjectTab = 'blank' | 'starters';

/** Fixed chip order for bundled-starter categories; only categories present in
 * the loaded index render. `all` and the user-starter `mine` chip are pinned. */
const STARTER_CATEGORY_ORDER = [
  'marketing',
  'editorial',
  'event',
  'media',
  'lifestyle',
  'diplomacy',
  'playful',
];

interface BundledStarter {
  entry: StarterIndexEntry;
  envelope: CalqoFile | null;
  project: CalqoProject | null;
}

/** Card preview: user starters carry a pre-rendered thumbnail; bundled starters
 * render live through the shared ArtboardThumbnail (they ship without raster
 * assets, so the preview matches the canvas exactly). */
function StarterPreview({
  project,
  thumbnail,
}: {
  project: CalqoProject | null;
  thumbnail?: string;
}) {
  return (
    <span className="mb-2 grid h-24 w-full place-items-center overflow-hidden rounded-[10px] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)]">
      {thumbnail ? (
        <img
          src={thumbnail}
          alt=""
          className="max-h-full max-w-full object-contain"
        />
      ) : project && project.artboards[0] ? (
        <ArtboardThumbnail
          project={project}
          artboard={project.artboards[0]}
          maxWidth={148}
          maxHeight={92}
        />
      ) : (
        <FileText size={18} className="text-[var(--calqo-text-3)]" />
      )}
    </span>
  );
}

export function NewProjectModal({
  open,
  onClose,
  initialTab = 'blank',
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: NewProjectTab;
}) {
  const { t } = useTranslation('editor');
  const [tab, setTab] = useState<NewProjectTab>(initialTab);
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState('all');
  const [preview, setPreview] = useState<CalqoFile | null>(null);
  const [error, setError] = useState(false);
  const [bundled, setBundled] = useState<BundledStarter[] | null>(null);
  const [userStarters, setUserStarters] = useState<StarterRecord[] | null>(
    null,
  );
  const [profiles, setProfiles] = useState<BrandProfileRecord[]>([]);
  const [profileId, setProfileId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    void listBrandProfiles().then((list) => {
      if (alive) setProfiles(list);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    setBundled(null);
    setUserStarters(null);
    setCategory('all');
    setQuery('');
    setFormat('all');
    setPreview(null);
    setError(false);
    setRenamingId(null);
  }, [open]);

  useEffect(() => {
    if (!open || tab !== 'starters' || bundled !== null) return undefined;
    let alive = true;
    void (async () => {
      const index = await fetchBundledStarterIndex();
      const loaded = await Promise.all(
        index.map(async (entry) => {
          const envelope = await loadBundledStarterEnvelope(entry);
          const result = envelope ? safeImportProject(envelope.project) : null;
          return {
            entry,
            envelope,
            project: result?.ok ? result.project : null,
          };
        }),
      );
      if (alive) setBundled(loaded.filter((starter) => starter.project));
    })();
    return () => {
      alive = false;
    };
  }, [open, tab, bundled]);

  /* The user library loads in its own effect: reading it alongside the bundled
   * catalogue would tie it to a `bundled` dependency that changes the moment
   * the catalogue lands, cancelling the in-flight library read before it can
   * be stored — saved starters would then never reach the gallery. */
  const refreshUserStarters = useCallback(async () => {
    setUserStarters(await listUserStarters());
  }, []);

  useEffect(() => {
    if (!open || tab !== 'starters') return undefined;
    let alive = true;
    void listUserStarters().then((list) => {
      if (alive) setUserStarters(list);
    });
    return () => {
      alive = false;
    };
  }, [open, tab]);

  const applyProfileIfSelected = (projectId: string) => {
    const profile = profiles.find((candidate) => candidate.id === profileId);
    if (profile) applyBrandProfile(projectId, profile);
    else useUiStore.getState().setBrandFontDefaults(null);
  };

  const createBlank = async (preset: ArtboardPresetId) => {
    const projectId = await createProject({ preset });
    applyProfileIfSelected(projectId);
    onClose();
  };

  const instantiate = async (envelope: CalqoFile) => {
    setBusy(true);
    setError(false);
    try {
      const projectId = await createProjectFromStarter(envelope);
      applyProfileIfSelected(projectId);
      onClose();
    } catch (error) {
      console.error('[Calqo] starter instantiation failed', error);
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const removeUserStarter = async (starter: StarterRecord) => {
    const confirmed = await dialog.confirm({
      title: t('starters.deleteTitle'),
      message: t('starters.deleteMessage', { name: starter.name }),
      confirmLabel: t('starters.delete'),
      danger: true,
    });
    if (!confirmed) return;
    await deleteUserStarter(starter.id);
    await refreshUserStarters();
  };

  const commitRename = async (starter: StarterRecord, name: string) => {
    setRenamingId(null);
    await renameUserStarter(starter.id, name);
    await refreshUserStarters();
  };

  const copyUserStarter = async (starter: StarterRecord) => {
    await duplicateUserStarter(starter.id);
    await refreshUserStarters();
  };

  const matches = (name: string, presets: string[], tags: string[] = []) => {
    const text = [
      name,
      ...presets.map((id) => t(`presets.${id}`, { defaultValue: id })),
      ...tags,
    ]
      .join(' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase();
    const search = query
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase();
    return (
      (format === 'all' || presets.includes(format)) && text.includes(search)
    );
  };
  const mine = (userStarters ?? []).filter((starter) =>
    matches(
      starter.name,
      starter.envelope.project.artboards.map((ab) => ab.preset),
    ),
  );
  const hasMine = (userStarters?.length ?? 0) > 0;
  const categories = bundled
    ? STARTER_CATEGORY_ORDER.filter((id) =>
        bundled.some((starter) => starter.entry.category === id),
      )
    : [];
  const visibleBundled =
    bundled?.filter(
      (starter) =>
        (category === 'all' || starter.entry.category === category) &&
        matches(
          t(`starters.names.${starter.entry.id}`, {
            defaultValue: starter.entry.name,
          }),
          starter.entry.presets,
          starter.entry.tags,
        ),
    ) ?? [];
  const showMine =
    mine.length > 0 && (category === 'all' || category === 'mine');
  /* The custom category is always offered, so saved starters have a permanent
   * home even before the first one exists. */
  const showMineEmptyHint =
    category === 'mine' && (userStarters?.length ?? 0) === 0;

  const categoryChip = (id: string, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setCategory(id)}
      aria-pressed={category === id}
      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors duration-[var(--calqo-t-fast)] ${
        category === id
          ? 'border-[var(--calqo-accent)] bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]'
          : 'border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] text-[var(--calqo-text-2)] hover:border-[var(--calqo-accent)]'
      }`}
    >
      {label}
    </button>
  );

  return (
    <ModalOverlay
      open={open}
      onClose={onClose}
      labelledBy="new-project-title"
      className="glass glass-strong flex max-h-[84vh] w-[min(680px,100%)] flex-col rounded-[28px] border border-[var(--calqo-divider)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
    >
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2
            id="new-project-title"
            className="text-[16px] font-semibold text-[var(--calqo-text)]"
          >
            {t(tab === 'starters' ? 'starters.title' : 'newProject.title')}
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--calqo-text-3)]">
            {t(
              tab === 'starters' ? 'starters.subtitle' : 'newProject.subtitle',
            )}
          </p>
        </div>
        <GlassIconButton label={t('export.close')} onClick={onClose}>
          <X size={15} />
        </GlassIconButton>
      </header>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <GlassSegmentedControl<NewProjectTab>
          ariaLabel={t('newProject.tabs')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'blank', label: t('newProject.tabBlank') },
            { value: 'starters', label: t('newProject.tabStarters') },
          ]}
        />
        {profiles.length > 0 && (
          <label className="flex items-center gap-2 text-[12px] text-[var(--calqo-text-2)]">
            {t('newProject.brandProfile')}
            <select
              value={profileId}
              onChange={(event) => setProfileId(event.target.value)}
              className="h-8 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 text-[12px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
            >
              <option value="">{t('newProject.noBrandProfile')}</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {tab === 'starters' && !preview && (
        <div className="mb-3 flex gap-2">
          <input
            type="search"
            aria-label={t('starters.search')}
            placeholder={t('starters.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-3 text-[12px] text-[var(--calqo-text)]"
          />
          <select
            aria-label={t('starters.format')}
            value={format}
            onChange={(event) => setFormat(event.target.value)}
            className="h-9 max-w-[45%] rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-2 text-[12px] text-[var(--calqo-text)]"
          >
            <option value="all">{t('starters.allFormats')}</option>
            {ARTBOARD_PRESET_LIST.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {t(`presets.${preset.id}`, { defaultValue: preset.name })}
              </option>
            ))}
          </select>
        </div>
      )}
      {tab === 'starters' && !preview && bundled !== null && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          {categoryChip('all', t('starters.categories.all'))}
          {categories.map((id) =>
            categoryChip(id, t(`starters.categories.${id}`)),
          )}
          {categoryChip(
            'mine',
            hasMine
              ? `${t('starters.categories.mine')} (${mine.length})`
              : t('starters.categories.mine'),
          )}
        </div>
      )}

      {/* Negative margin + matching padding gives the cards' hover ring and
       * lift room to render without being clipped by the scroll container. */}
      <div className="calqo-scroll -m-1 min-h-0 flex-1 overflow-y-auto p-1">
        {tab === 'starters' && preview ? (
          <div className="space-y-3">
            <div className="grid place-items-center rounded-[var(--calqo-radius-md)] bg-[var(--calqo-workspace)] p-3">
              <ArtboardThumbnail
                project={preview.project}
                artboard={preview.project.artboards[0]}
                maxWidth={520}
                maxHeight={300}
              />
            </div>
            <p className="text-[12px] text-[var(--calqo-text-2)]">
              {t('starters.previewHint', {
                count: preview.project.artboards.length,
              })}
            </p>
            {error && (
              <p role="alert" className="text-[12px] text-[var(--calqo-text)]">
                {t('starters.openFailed')}
              </p>
            )}
            <div className="flex justify-between gap-2">
              <GlassButton disabled={busy} onClick={() => setPreview(null)}>
                {t('starters.back')}
              </GlassButton>
              <GlassButton
                variant="primary"
                disabled={busy}
                loading={busy}
                onClick={() => void instantiate(preview)}
              >
                {t('starters.use')}
              </GlassButton>
            </div>
          </div>
        ) : tab === 'blank' ? (
          <FormatGrid onSelect={(preset) => void createBlank(preset)} />
        ) : bundled === null ? (
          <p className="px-1 py-10 text-center text-[13px] text-[var(--calqo-text-3)]">
            {t('starters.loading')}
          </p>
        ) : showMineEmptyHint ? (
          <p className="px-6 py-10 text-center text-[13px] leading-relaxed text-[var(--calqo-text-3)]">
            {t('starters.mineEmpty')}
          </p>
        ) : visibleBundled.length === 0 && !showMine ? (
          <p className="px-1 py-10 text-center text-[13px] text-[var(--calqo-text-3)]">
            {t('starters.noMatches')}
          </p>
        ) : (
          <div className="space-y-4">
            {visibleBundled.length > 0 && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {visibleBundled.map(({ entry, envelope, project }) => (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={busy || !envelope}
                    onClick={() => envelope && setPreview(envelope)}
                    className="min-w-0 rounded-[12px] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] p-2.5 text-left transition-[border-color,background,box-shadow,transform] duration-[var(--calqo-t-fast)] ease-[var(--calqo-ease-out)] hover:-translate-y-0.5 hover:border-[var(--calqo-accent)] hover:bg-[var(--calqo-accent-soft)]"
                  >
                    <StarterPreview
                      project={project}
                      thumbnail={entry.thumbnail}
                    />
                    <span className="block truncate text-[12px] font-semibold text-[var(--calqo-text)]">
                      {t(`starters.names.${entry.id}`, {
                        defaultValue: entry.name,
                      })}
                    </span>
                    <span className="mono mt-0.5 block text-[9.5px] text-[var(--calqo-text-3)]">
                      {entry.width}×{entry.height} ·{' '}
                      {entry.presets
                        .map((id) => t(`presets.${id}`, { defaultValue: id }))
                        .join(', ')}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1">
                      <span className="rounded-full bg-[var(--calqo-accent-soft)] px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--calqo-accent)]">
                        {t('starters.badgeBundled')}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {showMine && (
              <div>
                <p className="mb-2 text-[11.5px] font-semibold text-[var(--calqo-text-2)]">
                  {t('starters.mineTitle')}
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {mine.map((starter) => (
                    <div
                      key={starter.id}
                      className="group relative min-w-0 rounded-[12px] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] p-2.5"
                    >
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setPreview(starter.envelope)}
                        className="block w-full text-left"
                      >
                        <StarterPreview
                          project={null}
                          thumbnail={starter.thumbnail}
                        />
                        <span className="mono mb-0.5 block text-[9.5px] text-[var(--calqo-text-3)]">
                          {starter.envelope.project.artboards[0]?.width ?? 0}×
                          {starter.envelope.project.artboards[0]?.height ?? 0} ·{' '}
                          {starter.envelope.project.artboards
                            .map((artboard) => artboard.preset)
                            .join(', ')}
                        </span>
                        {renamingId === starter.id ? null : (
                          <span className="block truncate text-[12px] font-semibold text-[var(--calqo-text)]">
                            {starter.name}
                          </span>
                        )}
                        <span className="mt-0.5 block">
                          <span className="rounded-full bg-[var(--calqo-glass)] px-1.5 py-0.5 text-[9.5px] font-medium text-[var(--calqo-text-3)]">
                            {t('starters.badgeMine')}
                          </span>
                        </span>
                      </button>
                      {renamingId === starter.id && (
                        <input
                          autoFocus
                          defaultValue={starter.name}
                          aria-label={t('starters.rename')}
                          onFocus={(event) => event.target.select()}
                          onBlur={(event) =>
                            void commitRename(starter, event.target.value)
                          }
                          onKeyDown={(event) => {
                            if (event.key === 'Enter')
                              event.currentTarget.blur();
                            if (event.key === 'Escape') setRenamingId(null);
                          }}
                          className="mt-1 h-7 w-full rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-accent)] bg-[var(--calqo-glass)] px-1.5 text-[12px] text-[var(--calqo-text)] outline-none ring-2 ring-[var(--calqo-accent-ring)]"
                        />
                      )}
                      <span className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 any-pointer-coarse:opacity-100">
                        <GlassIconButton
                          label={t('starters.rename')}
                          showTitle={false}
                          size={22}
                          onClick={() => setRenamingId(starter.id)}
                        >
                          <Pencil size={12} />
                        </GlassIconButton>
                        <GlassIconButton
                          label={t('starters.duplicate')}
                          showTitle={false}
                          size={22}
                          onClick={() => void copyUserStarter(starter)}
                        >
                          <Copy size={12} />
                        </GlassIconButton>
                        <GlassIconButton
                          label={t('starters.export')}
                          showTitle={false}
                          size={22}
                          onClick={() => void exportUserStarter(starter)}
                        >
                          <Download size={12} />
                        </GlassIconButton>
                        <GlassIconButton
                          label={t('starters.delete')}
                          showTitle={false}
                          size={22}
                          onClick={() => void removeUserStarter(starter)}
                        >
                          <Trash2 size={12} />
                        </GlassIconButton>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </ModalOverlay>
  );
}
