interface TauriGlobals {
  isTauri?: boolean;
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
    typeof globalThis !== 'undefined' &&
    (Boolean((globalThis as typeof globalThis & TauriGlobals).isTauri) ||
      Boolean((globalThis as typeof globalThis & TauriGlobals).__TAURI_INTERNALS__))
  );
}

export function detectPlatformRuntime(): PlatformRuntime {
  return hasTauriInternals()
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
}

export const platformRuntime: PlatformRuntime = detectPlatformRuntime();

export const isTauri = platformRuntime.kind === 'tauri';
