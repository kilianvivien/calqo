import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Download, X } from 'lucide-react';
import { GlassButton, GlassIconButton } from '@/components/glass';
import { files } from '@/lib/adapters';

export interface ImportRecovery {
  filename: string;
  rawText: string;
  message: string;
}

function slug(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project'
  );
}

export function ImportRecoveryModal({
  failure,
  onClose,
}: {
  failure: ImportRecovery | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('editor');
  if (!failure) return null;

  const exportRaw = async () => {
    await files.downloadBlob(
      new Blob([failure.rawText], { type: 'application/json' }),
      `${slug(failure.filename)}-raw.json`,
    );
  };

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(0,0,0,0.45)] p-6 backdrop-blur-md">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-recovery-title"
        className="glass glass-strong w-[min(520px,100%)] rounded-[28px] border border-[var(--calqo-divider)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
      >
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2
              id="import-recovery-title"
              className="flex items-center gap-2 text-[16px] font-semibold text-[var(--calqo-text)]"
            >
              <AlertTriangle size={17} className="text-[#B7791F]" />
              {t('recovery.title')}
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--calqo-text-3)]">
              {t('recovery.subtitle', { filename: failure.filename })}
            </p>
          </div>
          <GlassIconButton label={t('export.close')} onClick={onClose}>
            <X size={15} />
          </GlassIconButton>
        </header>

        <div className="rounded-[var(--calqo-radius-sm)] border border-[#E8B339]/40 bg-[#E8B339]/10 px-3 py-2">
          <p className="text-[12px] text-[var(--calqo-text-2)]">
            {failure.message || t('export.importFailed')}
          </p>
        </div>

        <footer className="mt-5 flex justify-end gap-2">
          <GlassButton onClick={onClose}>{t('recovery.dismiss')}</GlassButton>
          <GlassButton variant="primary" onClick={exportRaw}>
            <Download size={14} />
            {t('recovery.exportRaw')}
          </GlassButton>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
