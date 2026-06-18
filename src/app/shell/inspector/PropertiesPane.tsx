import { useTranslation } from 'react-i18next';
import { useActiveProject, useActiveArtboard } from '@/lib/state/selectors';

/** Selection-driven pane. No selection model yet (Phase B), so it shows the
 * active document's artboard + background facts as document settings. */
export function PropertiesPane() {
  const { t } = useTranslation('editor');
  const project = useActiveProject();
  const artboard = useActiveArtboard();

  if (!project || !artboard) {
    return (
      <p className="text-[12px] text-[var(--calqo-text-3)]">
        {t('workspace.empty')}
      </p>
    );
  }

  const background =
    artboard.background.type === 'solid' ? artboard.background.color : artboard.background.type;

  return (
    <div className="flex flex-col gap-4">
      <Section title={t('panels.artboards')}>
        <Row label="Name" value={artboard.name} />
        <Row label="Size" value={`${artboard.width} × ${artboard.height}`} mono />
        <Row label="Preset" value={artboard.preset} mono />
      </Section>

      <Section title="Background">
        <div className="flex items-center gap-2 px-1 py-1">
          <span
            className="h-5 w-5 rounded-[var(--calqo-radius-xs)] ring-1 ring-black/10"
            style={{ background }}
          />
          <span className="mono text-[11px] text-[var(--calqo-text-2)]">{background}</span>
        </div>
      </Section>

      <Section title="Content locale">
        <Row label="Active" value={project.activeContentLocale} mono />
        <Row label="Locales" value={project.contentLocales.join(', ')} mono />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2">
        <span className="eyebrow">{title}</span>
      </div>
      <div className="glass-thin rounded-[var(--calqo-radius-sm)] p-1">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2 px-2 py-1.5 text-[12px]">
      <span className="text-[var(--calqo-text-3)]">{label}</span>
      <span className={`truncate text-[var(--calqo-text-2)] ${mono ? 'mono text-[11px]' : ''}`}>
        {value}
      </span>
    </div>
  );
}
