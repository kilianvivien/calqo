import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentDrawingPane } from '@/app/shell/AgentDrawingPane';
import { useMcpStore, DEFAULT_MCP_SETTINGS } from '@/lib/state/mcpStore';

// Render the desktop variant: the pane branches on the Tauri runtime.
vi.mock('@/lib/platform/runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/platform/runtime')>();
  return {
    ...original,
    isTauri: true,
    platformRuntime: { kind: 'tauri', capabilities: original.platformRuntime.capabilities },
  };
});

// The pane calls server lifecycle functions on toggle; stub the Tauri invokes.
vi.mock('@/editor/mcp/bridge', () => ({
  restartMcpServer: vi.fn(),
  syncMcpServer: vi.fn(),
}));

describe('AgentDrawingPane (desktop)', () => {
  beforeEach(() => {
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
    expect(snippet.textContent).toContain(useMcpStore.getState().settings.token);
  });

  it('offers revoke only while a session grant is active', () => {
    useMcpStore.setState({
      settings: { ...DEFAULT_MCP_SETTINGS, enabled: true, token: 'x'.repeat(32) },
      sessionWriteGranted: true,
    });
    render(<AgentDrawingPane />);
    const revoke = screen.getByRole('button', { name: /revoke|révoquer/i });
    fireEvent.click(revoke);
    expect(useMcpStore.getState().sessionWriteGranted).toBe(false);
  });

  it('renders activity log entries', () => {
    useMcpStore.setState({
      settings: { ...DEFAULT_MCP_SETTINGS, enabled: true, token: 'x'.repeat(32) },
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
});
