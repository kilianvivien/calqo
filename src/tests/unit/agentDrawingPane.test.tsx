import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { AgentDrawingPane } from '@/app/shell/AgentDrawingPane';
import { useMcpStore, DEFAULT_MCP_SETTINGS } from '@/lib/state/mcpStore';

const clipboardMock = vi.hoisted(() => ({
  writeText: vi.fn<() => Promise<boolean>>(),
}));
const tauriMock = vi.hoisted(() => ({
  invoke: vi.fn<() => Promise<unknown>>(),
}));

vi.mock('@tauri-apps/api/core', () => tauriMock);

vi.mock('@/lib/adapters', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/adapters')>();
  return {
    ...original,
    clipboard: {
      ...original.clipboard,
      writeText: clipboardMock.writeText,
    },
    appSettings: {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
    },
  };
});

// Render the desktop variant: the pane branches on the Tauri runtime.
vi.mock('@/lib/platform/runtime', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/lib/platform/runtime')>();
  return {
    ...original,
    isTauri: true,
    platformRuntime: {
      kind: 'tauri',
      capabilities: original.platformRuntime.capabilities,
    },
  };
});

// The pane calls server lifecycle functions on toggle; stub the Tauri invokes.
vi.mock('@/editor/mcp/bridge', () => ({
  restartMcpServer: vi.fn(),
  syncMcpServer: vi.fn(),
}));

describe('AgentDrawingPane (desktop)', () => {
  beforeEach(() => {
    clipboardMock.writeText.mockReset();
    clipboardMock.writeText.mockResolvedValue(true);
    tauriMock.invoke.mockReset();
    tauriMock.invoke.mockResolvedValue({ restartRequired: true });
    useMcpStore.setState({
      settings: { ...DEFAULT_MCP_SETTINGS },
      loaded: true,
      status: 'stopped',
      port: null,
      lastError: null,
      sessionWriteGranted: false,
      connectedClient: null,
      applying: false,
      activityLog: [],
    });
  });

  it('shows the toggle and reveals setup snippets when enabled', () => {
    render(<AgentDrawingPane />);
    const toggle = screen.getByRole('switch');
    expect(toggle).not.toBeChecked();
    // Setup is hidden while disabled.
    expect(screen.queryByText(/claude mcp add/)).toBeNull();

    fireEvent.click(toggle);

    expect(useMcpStore.getState().settings.enabled).toBe(true);
    expect(useMcpStore.getState().settings.token).not.toBe('');
    // The Claude Code snippet is the default and embeds the pairing token.
    const snippet = screen.getByText(/claude mcp add/);
    expect(snippet.textContent).toContain('http://127.0.0.1:22576/mcp');
    expect(snippet.textContent).toContain(
      useMcpStore.getState().settings.token,
    );
  });

  it('offers revoke only while a session grant is active', () => {
    useMcpStore.setState({
      settings: {
        ...DEFAULT_MCP_SETTINGS,
        enabled: true,
        token: 'x'.repeat(32),
      },
      sessionWriteGranted: true,
    });
    render(<AgentDrawingPane />);
    const revoke = screen.getByRole('button', { name: /revoke|révoquer/i });
    fireEvent.click(revoke);
    expect(useMcpStore.getState().sessionWriteGranted).toBe(false);
  });

  it('renders activity log entries', () => {
    useMcpStore.setState({
      settings: {
        ...DEFAULT_MCP_SETTINGS,
        enabled: true,
        token: 'x'.repeat(32),
      },
    });
    useMcpStore.getState().logActivity({
      client: 'Claude Code',
      tool: 'apply_operations',
      ok: true,
      summary: '2 layer(s) changed',
    });
    render(<AgentDrawingPane />);
    expect(screen.getByText(/apply_operations/)).toBeTruthy();
  });

  it('copies setup snippets through the clipboard adapter', async () => {
    useMcpStore.setState({
      settings: {
        ...DEFAULT_MCP_SETTINGS,
        enabled: true,
        token: 'x'.repeat(32),
      },
      port: 22576,
    });
    render(<AgentDrawingPane />);

    fireEvent.click(
      screen.getByRole('button', {
        name: /copy connection|copier la connexion/i,
      }),
    );

    await waitFor(() => {
      expect(clipboardMock.writeText).toHaveBeenCalledWith(
        expect.stringContaining('http://127.0.0.1:22576/mcp'),
      );
      expect(clipboardMock.writeText).toHaveBeenCalledWith(
        expect.stringContaining('Authorization: Bearer'),
      );
    });
  });

  it('uses native Streamable HTTP setup for Codex without a Node proxy', () => {
    useMcpStore.setState({
      settings: {
        ...DEFAULT_MCP_SETTINGS,
        enabled: true,
        token: 'x'.repeat(32),
      },
      port: 22576,
    });
    render(<AgentDrawingPane />);

    fireEvent.click(screen.getByRole('radio', { name: 'Codex' }));
    const snippet = screen.getByText(/\[mcp_servers\.calqo\]/);
    expect(snippet.textContent).toContain('url = "http://127.0.0.1:22576/mcp"');
    expect(snippet.textContent).toContain('http_headers');
    expect(snippet.textContent).not.toContain('npx');
  });

  it('provides a ready OpenCode remote configuration', () => {
    useMcpStore.setState({
      settings: {
        ...DEFAULT_MCP_SETTINGS,
        enabled: true,
        token: 'x'.repeat(32),
      },
    });
    render(<AgentDrawingPane />);

    fireEvent.click(screen.getByRole('radio', { name: 'OpenCode' }));
    expect(screen.getByText(/opencode\.json/).textContent).toContain(
      '"type": "remote"',
    );
  });

  it('can install the selected client connection automatically', async () => {
    useMcpStore.setState({
      settings: {
        ...DEFAULT_MCP_SETTINGS,
        enabled: true,
        token: 'x'.repeat(32),
      },
      port: 22576,
    });
    render(<AgentDrawingPane />);

    fireEvent.click(screen.getByRole('radio', { name: 'Codex' }));
    fireEvent.click(
      screen.getByRole('button', {
        name: /set up automatically|configurer automatiquement/i,
      }),
    );

    await waitFor(() => {
      expect(tauriMock.invoke).toHaveBeenCalledWith('mcp_setup_client', {
        client: 'codex',
        url: 'http://127.0.0.1:22576/mcp',
        token: 'x'.repeat(32),
      });
      expect(screen.getByRole('status')).toBeTruthy();
    });
  });
});
