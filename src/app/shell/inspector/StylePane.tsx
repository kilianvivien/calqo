import { useTranslation } from 'react-i18next';
import { useActiveProject } from '@/lib/state/selectors';
import { DocumentControls } from './PropertiesPane';

/** Project-level style: artboard setup, background, and brand palette. */
export function StylePane() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();

  if (!project) {
    return (
      <p className="text-[12px] text-[var(--calqo-text-3)]">{t('workspace.empty')}</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <DocumentControls />

      <section>
        <div className="mb-2">
          <span className="eyebrow">Palette</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {project.palette.map((color, i) => (
            <div key={`${color}-${i}`} className="flex flex-col items-center gap-1">
              <span
                className="h-8 w-8 rounded-[var(--calqo-radius-sm)] ring-1 ring-black/10"
                style={{ background: color }}
              />
              <span className="mono text-[9px] text-[var(--calqo-text-3)]">{color}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
