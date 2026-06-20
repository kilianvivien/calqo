import i18n from '@/lib/i18n';
import { platformRuntime } from '@/lib/platform/runtime';
import {
  appCommandDefinitions,
  getAppCommandState,
  invokeAppCommandSync,
  type AppCommandId,
} from './appCommands';

// The native menu bar is built in Rust (src-tauri/src/lib.rs) so it has the
// standard macOS App/Edit/Window submenus, predefined items, and a native About.
// This module is the thin web side of that contract: it routes menu selections
// back into the command router, pushes the resolved app locale (Rust rebuilds the
// menu in that language), and keeps each item's enabled state in sync.

let enabledTimer: ReturnType<typeof window.setTimeout> | null = null;

async function tauriInvoke(
  command: string,
  args?: Record<string, unknown>,
): Promise<void> {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke(command, args);
}

async function pushMenuEnabled(): Promise<void> {
  const states: Record<string, boolean> = {};
  for (const definition of appCommandDefinitions) {
    states[definition.id] = getAppCommandState(definition.id).enabled;
  }
  await tauriInvoke('set_menu_enabled', { states });
}

async function pushMenuLocale(): Promise<void> {
  await tauriInvoke('set_menu_locale', { locale: i18n.language });
  // Rebuilding the menu resets every item to enabled, so re-apply state.
  await pushMenuEnabled();
}

export function scheduleNativeMenuRefresh(): void {
  if (!platformRuntime.capabilities.nativeMenus) return;
  if (enabledTimer) window.clearTimeout(enabledTimer);
  enabledTimer = window.setTimeout(() => {
    enabledTimer = null;
    void pushMenuEnabled().catch((error) => {
      console.error('[Calqo] failed to update native menu state', error);
    });
  }, 50);
}

export function installNativeMenus(): () => void {
  if (!platformRuntime.capabilities.nativeMenus) return () => {};

  let unlisten: (() => void) | null = null;
  let disposed = false;

  void (async () => {
    const { listen } = await import('@tauri-apps/api/event');
    const dispose = await listen<AppCommandId>('calqo-menu', (event) => {
      invokeAppCommandSync(event.payload);
    });
    if (disposed) dispose();
    else unlisten = dispose;
  })();

  const onLanguageChanged = () => {
    void pushMenuLocale().catch((error) => {
      console.error('[Calqo] failed to localize native menu', error);
    });
  };

  void pushMenuLocale().catch((error) => {
    console.error('[Calqo] failed to localize native menu', error);
  });
  i18n.on('languageChanged', onLanguageChanged);

  return () => {
    disposed = true;
    unlisten?.();
    i18n.off('languageChanged', onLanguageChanged);
    if (enabledTimer) window.clearTimeout(enabledTimer);
  };
}
