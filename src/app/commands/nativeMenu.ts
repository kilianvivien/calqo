import i18n from '@/lib/i18n';
import { platformRuntime } from '@/lib/platform/runtime';
import {
  appCommandDefinitions,
  getAppCommandState,
  invokeAppCommandSync,
  type AppCommandId,
} from './appCommands';

type MenuModule = typeof import('@tauri-apps/api/menu');

interface MenuSection {
  titleKey: string;
  commands: AppCommandId[];
}

const MENU_SECTIONS: MenuSection[] = [
  {
    titleKey: 'common:menu.groups.calqo',
    commands: ['app.about', 'app.settings', 'app.quit'],
  },
  {
    titleKey: 'common:menu.groups.file',
    commands: [
      'file.new',
      'file.open',
      'file.save',
      'file.saveAs',
      'file.close',
      'file.export',
      'file.share',
    ],
  },
  {
    titleKey: 'common:menu.groups.edit',
    commands: [
      'edit.undo',
      'edit.redo',
      'edit.copy',
      'edit.paste',
      'edit.selectAll',
      'edit.duplicate',
      'edit.delete',
    ],
  },
  {
    titleKey: 'common:menu.groups.insert',
    commands: [
      'insert.text',
      'insert.list',
      'insert.image',
      'insert.imageFromClipboard',
      'insert.svg',
    ],
  },
  {
    titleKey: 'common:menu.groups.object',
    commands: [
      'object.group',
      'object.ungroup',
      'object.forward',
      'object.backward',
      'object.front',
      'object.back',
    ],
  },
  {
    titleKey: 'common:menu.groups.view',
    commands: [
      'view.zoomIn',
      'view.zoomOut',
      'view.fit',
      'view.toggleSnap',
      'view.theme',
      'view.transparencyAuto',
      'view.transparencyGlass',
      'view.transparencySolid',
    ],
  },
  {
    titleKey: 'common:menu.groups.ai',
    commands: ['ai.promptTemplate', 'ai.translate'],
  },
  {
    titleKey: 'common:menu.groups.window',
    commands: ['window.shortcuts'],
  },
  {
    titleKey: 'common:menu.groups.help',
    commands: ['help.github', 'help.diagnostics'],
  },
];

const definitions = new Map(appCommandDefinitions.map((item) => [item.id, item]));
let rebuildTimer: ReturnType<typeof window.setTimeout> | null = null;

function t(key: string): string {
  return i18n.t(key);
}

async function makeMenuItem(menu: MenuModule, id: AppCommandId) {
  const definition = definitions.get(id);
  if (!definition) throw new Error(`Missing menu command definition: ${id}`);
  return menu.MenuItem.new({
    id,
    text: t(definition.labelKey),
    accelerator: definition.accelerator,
    enabled: getAppCommandState(id).enabled,
    action: () => invokeAppCommandSync(id),
  });
}

async function buildNativeMenu(): Promise<void> {
  if (!platformRuntime.capabilities.nativeMenus) return;
  const menu = await import('@tauri-apps/api/menu');
  const sections = await Promise.all(
    MENU_SECTIONS.map(async (section) =>
      menu.Submenu.new({
        text: t(section.titleKey),
        items: await Promise.all(
          section.commands.map((command) => makeMenuItem(menu, command)),
        ),
      }),
    ),
  );
  await (await menu.Menu.new({ items: sections })).setAsAppMenu();
}

export function scheduleNativeMenuRefresh(): void {
  if (!platformRuntime.capabilities.nativeMenus) return;
  if (rebuildTimer) window.clearTimeout(rebuildTimer);
  rebuildTimer = window.setTimeout(() => {
    rebuildTimer = null;
    void buildNativeMenu().catch((error) => {
      console.error('[Calqo] failed to rebuild native menu', error);
    });
  }, 50);
}

export function installNativeMenus(): () => void {
  if (!platformRuntime.capabilities.nativeMenus) return () => {};
  scheduleNativeMenuRefresh();
  i18n.on('languageChanged', scheduleNativeMenuRefresh);
  return () => {
    i18n.off('languageChanged', scheduleNativeMenuRefresh);
    if (rebuildTimer) window.clearTimeout(rebuildTimer);
  };
}

export { MENU_SECTIONS };

