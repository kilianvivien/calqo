import { useTranslation } from 'react-i18next';
import { Undo2, Redo2, Moon, Sun, Languages, Download, Copy } from 'lucide-react';
import { GlassButton, GlassIconButton } from '@/components/glass';
import { useUiStore } from '@/lib/state/uiStore';
import { useWorkspaceStore } from '@/lib/state/workspaceStore';
import { duplicateProject } from '@/editor/commands/projectCommands';
import i18n, { type AppLanguage } from '@/lib/i18n';

/** Top chrome: traffic-light affordance, centered title chip, and the global
 * action cluster (undo/redo, theme, language, export). */
export function TitleBar() {
  const { t } = useTranslation(['common', 'editor']);
  const theme = useUiStore((s) => s.theme);
  const toggleTheme = useUiStore((s) => s.toggleTheme);
  const activeProjectId = useWorkspaceStore((s) => s.activeProjectId);

  const cycleLanguage = () => {
    const next: AppLanguage = i18n.language.startsWith('fr') ? 'en' : 'fr';
    void i18n.changeLanguage(next);
  };

  return (
    <header
      className="flex h-11 items-center px-3 border-b border-[var(--calqo-divider)]"
      data-tauri-drag-region
    >
      {/* Traffic lights (decorative on web; real controls under Tauri). */}
      <div className="flex items-center gap-2 pl-1">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
      </div>

      {/* Centered title chip. */}
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-2 rounded-full px-3 py-1 hover:bg-[var(--calqo-hover)] transition-colors">
          <span className="text-[13px] font-semibold">{t('app.name')}</span>
          <span className="text-[11px] text-[var(--calqo-text-3)]">
            {t('app.tagline')}
          </span>
        </div>
      </div>

      {/* Global actions. */}
      <div className="flex items-center gap-1">
        <GlassIconButton label={t('actions.undo')} disabled>
          <Undo2 size={16} />
        </GlassIconButton>
        <GlassIconButton label={t('actions.redo')} disabled>
          <Redo2 size={16} />
        </GlassIconButton>
        <GlassIconButton
          label={t('actions.duplicate')}
          disabled={!activeProjectId}
          onClick={() => activeProjectId && void duplicateProject(activeProjectId)}
        >
          <Copy size={16} />
        </GlassIconButton>
        <span className="mx-1 h-5 w-px bg-[var(--calqo-divider)]" />
        <GlassIconButton label={t('theme.toggle')} onClick={toggleTheme}>
          {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
        </GlassIconButton>
        <GlassIconButton label={t('language.label')} onClick={cycleLanguage}>
          <Languages size={16} />
        </GlassIconButton>
        <GlassButton variant="primary" className="ml-1" disabled={!activeProjectId}>
          <Download size={15} />
          {t('actions.export')}
        </GlassButton>
      </div>
    </header>
  );
}
