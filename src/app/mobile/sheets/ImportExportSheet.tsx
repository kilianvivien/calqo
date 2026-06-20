import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Upload } from 'lucide-react';
import {
  exportProjectFile,
  importProjectFile,
} from '@/editor/export/calqoFile';
import type { CalqoProject } from '@/lib/schema';
import { BottomSheet } from '@/components/mobile';
import { GlassButton } from '@/components/glass';

interface ImportExportSheetProps {
  open: boolean;
  onClose: () => void;
  project: CalqoProject;
}

/** Portable project file actions for mobile: import another `.calqo` project or
 * download the current project as a self-contained `.calqo` file. */
export function ImportExportSheet({ open, onClose, project }: ImportExportSheetProps) {
  const { t } = useTranslation('editor');
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const exportFile = async () => {
    setBusy(true);
    setStatus(null);
    try {
      await exportProjectFile(project.id);
      setStatus(t('mobile.files.exported'));
    } catch (error) {
      console.error('[Calqo] mobile .calqo export failed', error);
      setStatus(t('mobile.files.exportFailed'));
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    setBusy(true);
    setStatus(null);
    try {
      await importProjectFile(file);
      setStatus(t('mobile.files.imported'));
      onClose();
    } catch (error) {
      console.error('[Calqo] mobile .calqo import failed', error);
      setStatus(t('mobile.files.importFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('mobile.files.title')}
      subtitle={t('mobile.files.subtitle')}
      bodyClassName="pb-4"
    >
      <div className="flex flex-col gap-2 py-2">
        <GlassButton
          variant="primary"
          className="w-full"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
        >
          <Upload size={15} />
          {t('mobile.files.import')}
        </GlassButton>
        <GlassButton className="w-full" onClick={exportFile} disabled={busy}>
          <Download size={15} />
          {t('mobile.files.export')}
        </GlassButton>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-[var(--calqo-text-3)]">
        {t('mobile.files.hint')}
      </p>
      {status && (
        <p className="mt-3 text-center text-[12px] text-[var(--calqo-text-3)]">
          {status}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".calqo,application/json,.json"
        className="hidden"
        onChange={(event) => void importFile(event.target.files)}
      />
    </BottomSheet>
  );
}
