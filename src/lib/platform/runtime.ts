interface TauriInternals {
  __TAURI_INTERNALS__?: unknown;
}

export interface PlatformCapabilities {
  nativeFileDialogs: boolean;
  nativeMenus: boolean;
  secureSettings: boolean;
  systemClipboardImages: boolean;
  fileDrops: boolean;
  localFonts: boolean;
}

export interface PlatformRuntime {
  kind: 'browser' | 'tauri';
  capabilities: PlatformCapabilities;
}

function hasTauriInternals(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as Window & TauriInternals).__TAURI_INTERNALS__)
  );
}

export const platformRuntime: PlatformRuntime = hasTauriInternals()
  ? {
      kind: 'tauri',
      capabilities: {
        nativeFileDialogs: true,
        nativeMenus: true,
        secureSettings: true,
        systemClipboardImages: true,
        fileDrops: true,
        localFonts: true,
      },
    }
  : {
      kind: 'browser',
      capabilities: {
        nativeFileDialogs: false,
        nativeMenus: false,
        secureSettings: false,
        systemClipboardImages: false,
        fileDrops: false,
        localFonts: false,
      },
    };

export const isTauri = platformRuntime.kind === 'tauri';

