import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Smile, X } from 'lucide-react';
import { GlassIconButton, ModalOverlay } from '@/components/glass';
import { addLayerToActiveArtboard, createTextLayer } from '@/editor/commands/projectCommands';
import {
  EMOJI_CATEGORY_ORDER,
  EMOJI_LIBRARY,
  type EmojiItem,
} from '@/editor/assets/emojiData';
import { useActiveArtboard, useActiveProject } from '@/lib/state/selectors';
import { useUiStore } from '@/lib/state/uiStore';

/** Box size (artboard px) for an inserted emoji text layer. */
const EMOJI_LAYER_SIZE = 200;
const EMOJI_FONT_SIZE = 140;

export function EmojiPickerDialog() {
  const open = useUiStore((s) => s.emojiDialog);
  if (!open) return null;
  return <EmojiPickerDialogInner />;
}

function EmojiPickerDialogInner() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const artboard = useActiveArtboard();
  const setEmojiDialog = useUiStore((s) => s.setEmojiDialog);
  const close = () => setEmojiDialog(false);

  const [search, setSearch] = useState('');

  const insertEmoji = (char: string) => {
    if (!project || !artboard) return;
    const base = createTextLayer(project, 0, 0);
    if (base.type !== 'text') return;
    const layer = {
      ...base,
      name: char,
      x: Math.round((artboard.width - EMOJI_LAYER_SIZE) / 2),
      y: Math.round((artboard.height - EMOJI_LAYER_SIZE) / 2),
      width: EMOJI_LAYER_SIZE,
      height: EMOJI_LAYER_SIZE,
      text: { [project.activeContentLocale]: char },
      style: { ...base.style, fontSize: EMOJI_FONT_SIZE, align: 'center' as const },
    };
    addLayerToActiveArtboard(project.id, layer);
    close();
  };

  // Group the (filtered) emoji into their categories, preserving section order.
  const sections = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? EMOJI_LIBRARY.filter(
          (item) => item.char === search.trim() || item.keywords.includes(query),
        )
      : EMOJI_LIBRARY;
    return EMOJI_CATEGORY_ORDER.map((category) => ({
      category,
      items: filtered.filter((item) => item.category === category),
    })).filter((section) => section.items.length > 0);
  }, [search]);

  const renderItem = (item: EmojiItem) => (
    <button
      key={item.char + item.category}
      type="button"
      title={item.keywords.split(' ')[0]}
      onClick={() => insertEmoji(item.char)}
      className="flex aspect-square items-center justify-center rounded-[var(--calqo-radius-sm)] text-[26px] leading-none transition-all hover:-translate-y-0.5 hover:bg-[var(--calqo-hover)]"
    >
      {item.char}
    </button>
  );

  return (
    <ModalOverlay
      open
      onClose={close}
      labelledBy="emoji-picker-title"
      className="glass glass-strong flex max-h-[80vh] w-[min(560px,100%)] flex-col rounded-[28px] border border-[var(--calqo-divider)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
    >
      <header className="mb-4 flex shrink-0 items-start justify-between gap-4">
        <div>
          <h2
            id="emoji-picker-title"
            className="flex items-center gap-2 text-[16px] font-semibold text-[var(--calqo-text)]"
          >
            <Smile size={17} className="text-[var(--calqo-accent)]" />
            {t('emojiPicker.title')}
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--calqo-text-3)]">
            {t('emojiPicker.subtitle')}
          </p>
        </div>
        <GlassIconButton label={t('export.close')} onClick={close}>
          <X size={15} />
        </GlassIconButton>
      </header>

      <input
        autoFocus
        type="search"
        value={search}
        placeholder={t('emojiPicker.search')}
        onChange={(event) => setSearch(event.target.value)}
        className="mb-3 h-11 w-full shrink-0 rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-3.5 text-[13.5px] text-[var(--calqo-text)] outline-none focus:border-[var(--calqo-accent)]"
      />

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto calqo-scroll">
        {sections.length === 0 ? (
          <p className="py-8 text-center text-[12.5px] text-[var(--calqo-text-3)]">
            {t('emojiPicker.noResults')}
          </p>
        ) : (
          sections.map((section) => (
            <section key={section.category} className="space-y-1.5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--calqo-text-3)]">
                {t(`emojiPicker.categories.${section.category}`)}
              </h3>
              <div className="grid grid-cols-8 gap-1">
                {section.items.map(renderItem)}
              </div>
            </section>
          ))
        )}
      </div>
    </ModalOverlay>
  );
}
