import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassIconButton, ModalOverlay } from '@/components/glass';

export function ShortcutHelpModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation('common');
  const groups = useMemo(
    () => [
      {
        title: t('shortcuts.file'),
        items: [
          ['⌘S', t('shortcuts.save')],
          ['⌘Z', t('shortcuts.undo')],
          ['⇧⌘Z / ⌘Y', t('shortcuts.redo')],
          ['⌘D', t('shortcuts.duplicate')],
        ],
      },
      {
        title: t('shortcuts.tools'),
        items: [
          ['V', t('shortcuts.selectTool')],
          ['M', t('shortcuts.marqueeTool')],
          ['H', t('shortcuts.panTool')],
          ['T', t('shortcuts.textTool')],
          ['⇧L', t('shortcuts.listTool')],
          ['R / E / L', t('shortcuts.shapeTools')],
          ['I', t('shortcuts.imageTool')],
        ],
      },
      {
        title: t('shortcuts.layers'),
        items: [
          ['⌘A', t('shortcuts.selectAll')],
          ['⌘G', t('shortcuts.group')],
          ['⇧⌘G', t('shortcuts.ungroup')],
          ['[ / ]', t('shortcuts.order')],
          ['Delete', t('shortcuts.delete')],
          ['← ↑ → ↓', t('shortcuts.nudge')],
          ['⇧ + ←↑→↓', t('shortcuts.nudgeLarge')],
        ],
      },
    ],
    [t],
  );

  return (
    <ModalOverlay
      open={open}
      onClose={onClose}
      labelledBy="shortcut-help-title"
      className="glass glass-strong w-[min(560px,100%)] rounded-[28px] border border-[var(--calqo-divider)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
    >
      <header className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2
              id="shortcut-help-title"
              className="text-[16px] font-semibold text-[var(--calqo-text)]"
            >
              {t('shortcuts.title')}
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--calqo-text-3)]">
              {t('shortcuts.subtitle')}
            </p>
          </div>
          <GlassIconButton label={t('actions.close')} onClick={onClose}>
            <X size={15} />
          </GlassIconButton>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          {groups.map((group) => (
            <section
              key={group.title}
              className="glass-thin rounded-[var(--calqo-radius-md)] p-3"
            >
              <h3 className="mb-2 text-[12px] font-semibold text-[var(--calqo-text-2)]">
                {group.title}
              </h3>
              <dl className="space-y-2">
                {group.items.map(([shortcut, label]) => (
                  <div key={shortcut} className="flex items-center justify-between gap-3">
                    <dt className="text-[11.5px] text-[var(--calqo-text-3)]">
                      {label}
                    </dt>
                    <dd>
                      <kbd className="mono rounded-[6px] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--calqo-text-2)]">
                        {shortcut}
                      </kbd>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
    </ModalOverlay>
  );
}
