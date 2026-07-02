import { create } from 'zustand';
import { appSettings } from '@/lib/adapters';

const SETTINGS_KEY = 'mcp.settings';
const MAX_ACTIVITY_ENTRIES = 200;

/** Agent drawing (embedded MCP server) state. Settings persist through the
 * settings adapter; runtime state (server status, session grants, activity log)
 * is session-scoped by design — closing the app always revokes write access. */

export type McpPermissionMode = 'read' | 'session' | 'ask';
export type McpServerStatus = 'stopped' | 'starting' | 'running' | 'error';

export interface McpClientInfo {
  name: string;
  version?: string;
}

export interface McpActivityEntry {
  id: number;
  /** ISO timestamp. */
  time: string;
  client: string;
  tool: string;
  ok: boolean;
  /** Short human summary (layer counts, error code…). */
  summary: string;
}

export interface McpSettings {
  enabled: boolean;
  permissionMode: McpPermissionMode;
  /** Local pairing secret required as a Bearer token on every MCP request.
   * Not a provider key: it never enters Stronghold, projects, or backups. */
  token: string;
}

export const DEFAULT_MCP_SETTINGS: McpSettings = {
  enabled: false,
  permissionMode: 'session',
  token: '',
};

/** Default loopback port: "CALQO" typed on a phone keypad. */
export const MCP_DEFAULT_PORT = 22576;

export function generateMcpToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function isPermissionMode(value: unknown): value is McpPermissionMode {
  return value === 'read' || value === 'session' || value === 'ask';
}

export function normalizeMcpSettings(stored?: Partial<McpSettings> | null): McpSettings {
  return {
    enabled: Boolean(stored?.enabled),
    permissionMode: isPermissionMode(stored?.permissionMode)
      ? stored.permissionMode
      : DEFAULT_MCP_SETTINGS.permissionMode,
    token: typeof stored?.token === 'string' ? stored.token : '',
  };
}

let persistChain: Promise<void> = Promise.resolve();

function persist(settings: McpSettings): void {
  const snapshot = { ...settings };
  persistChain = persistChain
    .catch(() => undefined)
    .then(() => appSettings.set(SETTINGS_KEY, snapshot))
    .catch((err) => {
      console.error('[Calqo] failed to persist agent drawing settings', err);
    });
}

let activityCounter = 0;

interface McpState {
  settings: McpSettings;
  loaded: boolean;
  status: McpServerStatus;
  /** Actual bound port while running (may differ from the default on conflict). */
  port: number | null;
  lastError: string | null;
  /** Whether the current session's write approval has been granted. */
  sessionWriteGranted: boolean;
  connectedClient: McpClientInfo | null;
  /** True while a write batch is being applied (status-bar pulse). */
  applying: boolean;
  activityLog: McpActivityEntry[];

  load: () => Promise<void>;
  setEnabled: (enabled: boolean) => void;
  setPermissionMode: (mode: McpPermissionMode) => void;
  regenerateToken: () => string;
  setServerStatus: (status: McpServerStatus, port?: number | null, error?: string | null) => void;
  setConnectedClient: (client: McpClientInfo | null) => void;
  setApplying: (applying: boolean) => void;
  grantSessionWrite: () => void;
  revokeWrite: () => void;
  logActivity: (entry: Omit<McpActivityEntry, 'id' | 'time'>) => void;
  clearActivity: () => void;
}

export const useMcpStore = create<McpState>((set, get) => ({
  settings: DEFAULT_MCP_SETTINGS,
  loaded: false,
  status: 'stopped',
  port: null,
  lastError: null,
  sessionWriteGranted: false,
  connectedClient: null,
  applying: false,
  activityLog: [],

  load: async () => {
    if (get().loaded) return;
    try {
      const stored = await appSettings.get<Partial<McpSettings>>(SETTINGS_KEY);
      const settings = normalizeMcpSettings(stored);
      if (settings.enabled && !settings.token) {
        settings.token = generateMcpToken();
        persist(settings);
      }
      set({ settings, loaded: true });
    } catch (err) {
      console.error('[Calqo] failed to load agent drawing settings', err);
      set({ loaded: true });
    }
  },

  setEnabled: (enabled) => {
    const current = get().settings;
    const next: McpSettings = {
      ...current,
      enabled,
      token: enabled && !current.token ? generateMcpToken() : current.token,
    };
    set({ settings: next, ...(enabled ? {} : { sessionWriteGranted: false }) });
    persist(next);
  },

  setPermissionMode: (permissionMode) => {
    const next = { ...get().settings, permissionMode };
    // Tightening the mode always drops an existing session grant.
    set({ settings: next, sessionWriteGranted: false });
    persist(next);
  },

  regenerateToken: () => {
    const token = generateMcpToken();
    const next = { ...get().settings, token };
    set({ settings: next, sessionWriteGranted: false });
    persist(next);
    return token;
  },

  setServerStatus: (status, port = get().port, error = null) =>
    set({
      status,
      port: status === 'running' ? port : null,
      lastError: status === 'error' ? error : null,
      ...(status === 'running' ? {} : { connectedClient: null, applying: false }),
    }),

  setConnectedClient: (connectedClient) => set({ connectedClient }),
  setApplying: (applying) => set({ applying }),
  grantSessionWrite: () => set({ sessionWriteGranted: true }),
  revokeWrite: () => set({ sessionWriteGranted: false }),

  logActivity: (entry) =>
    set((state) => ({
      activityLog: [
        { ...entry, id: ++activityCounter, time: new Date().toISOString() },
        ...state.activityLog,
      ].slice(0, MAX_ACTIVITY_ENTRIES),
    })),

  clearActivity: () => set({ activityLog: [] }),
}));

/** Non-reactive accessor for the bridge / executor modules. */
export const mcpStore = useMcpStore;
