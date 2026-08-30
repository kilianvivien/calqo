import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GlassButton } from '@/components/glass';
import { useProjectStore } from '@/lib/state/projectStore';
import { useDesktopFileStore } from '@/lib/state/desktopFileStore';
import { saveProject } from '@/editor/commands/projectCommands';
import {
  exportProjectFile,
  saveNativeProjectFile,
} from '@/editor/export/calqoFile';

/** Recovery stays available even if the user switches away from the failed tab. */
export function SaveRecoveryBanner() {
  const { t } = useTranslation('editor');
  const projects = useProjectStore((s) => s.projects);
  const states = useProjectStore((s) => s.saveState);
  const disk = useDesktopFileStore((s) => s.files);
  const [busy, setBusy] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const failed = Object.values(projects).find(
    (project) =>
      states[project.id] === 'error' || disk[project.id]?.diskState === 'error',
  );
  if (!failed) return null;
  const recover = async (copy: boolean) => {
    setBusy(true);
    setCopyFailed(false);
    try {
      if (copy) await exportProjectFile(failed.id);
      else {
        if (states[failed.id] === 'error') await saveProject(failed.id);
        if (disk[failed.id]?.diskState === 'error')
          await saveNativeProjectFile(failed.id);
      }
    } catch {
      setCopyFailed(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-x-3 bottom-12 z-[110] mx-auto max-w-xl rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] bg-[var(--calqo-solid-surface-strong)] p-3 shadow-lg">
      <p role="alert" className="text-[13px] text-[var(--calqo-text)]">
        {t(copyFailed ? 'saveRecovery.copyFailed' : 'saveRecovery.message', {
          name: failed.name,
        })}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <GlassButton disabled={busy} onClick={() => void recover(false)}>
          {t('saveRecovery.retry')}
        </GlassButton>
        <GlassButton disabled={busy} onClick={() => void recover(true)}>
          {t('saveRecovery.copy')}
        </GlassButton>
      </div>
    </div>
  );
}
