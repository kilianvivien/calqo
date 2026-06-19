import { useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassIconButton } from '@/components/glass';
import { useFocusTrap } from './useFocusTrap';

export function ShortcutHelpModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation('common');
  const dialogRef = useRef<HTMLElement>(null);
  useFocusTrap(dialogRef, open, onClose);
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
          ['H', t('shortcuts.panTool')],
          ['T', t('shortcuts.textTool')],
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
        ],
      },
    ],
    [t],
  );

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-[rgba(0,0,0,0.45)] p-6 backdrop-blur-md"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcut-help-title"
        tabIndex={-1}
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
      </section>
    </div>,
    document.body,
  );
}
