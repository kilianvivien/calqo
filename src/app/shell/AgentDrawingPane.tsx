import { useEffect, useMemo, useState } from 'react';
import { Bot, Check, Copy, Download, RefreshCw, ShieldOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassButton, GlassSegmentedControl } from '@/components/glass';
import { clipboard } from '@/lib/adapters';
import { isTauri } from '@/lib/platform/runtime';
import {
  MCP_DEFAULT_PORT,
  useMcpStore,
  type McpPermissionMode,
} from '@/lib/state/mcpStore';
import { restartMcpServer, syncMcpServer } from '@/editor/mcp/bridge';
import {
  downloadCalqoAgentSkill,
  downloadClaudeAgentSkill,
} from '@/editor/ai/agentSkillFile';

/** Settings ▸ Agent drawing: enable the embedded MCP server, copy host setup
 * snippets, pick the write-permission mode, and watch the activity log. In the
 * browser the live server is unavailable, so the pane explains that and offers
 * the file-based agent skill instead. */

type SnippetHost = 'claude' | 'codex' | 'antigravity' | 'opencode' | 'generic';

function buildSnippet(host: SnippetHost, port: number, token: string): string {
  const url = `http://127.0.0.1:${port}/mcp`;
  if (host === 'claude') {
    return [
      'claude mcp add --transport http --scope user \\',
      `  --header "Authorization: Bearer ${token}" \\`,
      `  calqo ${url}`,
    ].join('\n');
  }
  if (host === 'codex') {
    return [
      '# ~/.codex/config.toml',
      '[mcp_servers.calqo]',
      `url = "${url}"`,
      `http_headers = { Authorization = "Bearer ${token}" }`,
      'tool_timeout_sec = 180',
    ].join('\n');
  }
  if (host === 'antigravity') {
    return [
      '// ~/.gemini/config/mcp_config.json',
      '{',
      '  "mcpServers": {',
      '    "calqo": {',
      `      "serverUrl": "${url}",`,
      `      "headers": { "Authorization": "Bearer ${token}" }`,
      '    }',
      '  }',
      '}',
    ].join('\n');
  }
  if (host === 'opencode') {
    return [
      '// opencode.json',
      '{',
      '  "$schema": "https://opencode.ai/config.json",',
      '  "mcp": {',
      '    "calqo": {',
      '      "type": "remote",',
      `      "url": "${url}",`,
      '      "enabled": true,',
      '      "oauth": false,',
      `      "headers": { "Authorization": "Bearer ${token}" }`,
      '    }',
      '  }',
      '}',
    ].join('\n');
  }
  return [`URL: ${url}`, `Header: Authorization: Bearer ${token}`].join('\n');
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <GlassButton
      onClick={() => {
        void clipboard.writeText(value).then((ok) => {
          if (!ok) return;
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        });
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {label}
    </GlassButton>
  );
}

function SkillDownloads() {
  const { t } = useTranslation('common');
  return (
    <div className="space-y-2">
      <p className="text-[12.5px] leading-relaxed text-[var(--calqo-text-3)]">
        {t('settings.ai.agentSkillHint')}
      </p>
      <div className="flex flex-wrap gap-2">
        <GlassButton onClick={() => void downloadCalqoAgentSkill()}>
          <Download size={14} />
          {t('settings.ai.downloadSkill')}
        </GlassButton>
        <GlassButton onClick={() => void downloadClaudeAgentSkill()}>
          <Download size={14} />
          {t('settings.ai.downloadClaudeSkill')}
        </GlassButton>
      </div>
    </div>
  );
}

export function AgentDrawingPane() {
  const { t } = useTranslation('common');
  const settings = useMcpStore((s) => s.settings);
  const status = useMcpStore((s) => s.status);
  const port = useMcpStore((s) => s.port);
  const lastError = useMcpStore((s) => s.lastError);
  const sessionWriteGranted = useMcpStore((s) => s.sessionWriteGranted);
  const connectedClient = useMcpStore((s) => s.connectedClient);
  const activityLog = useMcpStore((s) => s.activityLog);
  const [snippetHost, setSnippetHost] = useState<SnippetHost>('claude');
  const [setupState, setSetupState] = useState<{
    kind: 'idle' | 'installing' | 'success' | 'error';
    message?: string;
  }>({ kind: 'idle' });

  useEffect(() => {
    void useMcpStore.getState().load();
  }, []);

  const effectivePort = port ?? MCP_DEFAULT_PORT;
  const snippet = useMemo(
    () => buildSnippet(snippetHost, effectivePort, settings.token || '<token>'),
    [snippetHost, effectivePort, settings.token],
  );
  const connectionUrl = `http://127.0.0.1:${effectivePort}/mcp`;

  const setupAutomatically = async () => {
    if (snippetHost === 'generic') return;
    setSetupState({ kind: 'installing' });
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('mcp_setup_client', {
        client: snippetHost,
        url: connectionUrl,
        token: settings.token,
      });
      setSetupState({
        kind: 'success',
        message: t('settings.agentDrawing.autoSetupSuccess'),
      });
    } catch (error) {
      setSetupState({
        kind: 'error',
        message: t('settings.agentDrawing.autoSetupError', {
          error: String(error),
        }),
      });
    }
  };

  if (!isTauri) {
    return (
      <section className="flex flex-col items-start gap-4 rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] p-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-[var(--calqo-radius-sm)] bg-[var(--calqo-accent-soft)] text-[var(--calqo-accent)]">
          <Bot size={22} />
        </span>
        <div className="space-y-1.5">
          <p className="text-[14px] font-semibold text-[var(--calqo-text)]">
            {t('settings.agentDrawing.title')}
          </p>
          <p className="max-w-md text-[12.5px] leading-relaxed text-[var(--calqo-text-3)]">
            {t('settings.agentDrawing.browserOnly')}
          </p>
        </div>
        <SkillDownloads />
      </section>
    );
  }

  const statusColor =
    status === 'running'
      ? '#28c840'
      : status === 'error'
        ? '#ff5f57'
        : '#8e8e93';
  const statusLabel =
    status === 'running'
      ? t('settings.agentDrawing.statusRunning', { port: effectivePort })
      : status === 'starting'
        ? t('settings.agentDrawing.statusStarting')
        : status === 'error'
          ? t('settings.agentDrawing.statusError', { error: lastError ?? '' })
          : t('settings.agentDrawing.statusStopped');

  const permissionOptions: { value: McpPermissionMode; label: string }[] = [
    { value: 'session', label: t('settings.agentDrawing.modeSession') },
    { value: 'ask', label: t('settings.agentDrawing.modeAsk') },
    { value: 'read', label: t('settings.agentDrawing.modeRead') },
  ];

  return (
    <section className="space-y-5">
      {/* Step 1 — enable */}
      <div className="flex items-start justify-between gap-4 rounded-[var(--calqo-radius-md)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] p-4">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold text-[var(--calqo-text)]">
            <Bot size={15} className="text-[var(--calqo-accent)]" />
            {t('settings.agentDrawing.enable')}
          </p>
          <p className="max-w-sm text-[12px] leading-relaxed text-[var(--calqo-text-3)]">
            {t('settings.agentDrawing.enableHint')}
          </p>
          <p className="flex items-center gap-1.5 pt-1 text-[11.5px] text-[var(--calqo-text-2)]">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: statusColor,
                boxShadow: `0 0 6px ${statusColor}`,
              }}
            />
            {statusLabel}
            {connectedClient && status === 'running' && (
              <span className="text-[var(--calqo-accent)]">
                ·{' '}
                {t('settings.agentDrawing.clientConnected', {
                  client: connectedClient.name,
                })}
              </span>
            )}
          </p>
        </div>
        <input
          type="checkbox"
          role="switch"
          checked={settings.enabled}
          aria-label={t('settings.agentDrawing.enable')}
          onChange={(event) => {
            useMcpStore.getState().setEnabled(event.target.checked);
            void syncMcpServer();
          }}
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--calqo-accent)]"
        />
      </div>

      {settings.enabled && (
        <>
          {/* Step 2 — connect an agent */}
          <div className="space-y-2.5">
            <p className="text-[13px] font-medium text-[var(--calqo-text)]">
              {t('settings.agentDrawing.setupTitle')}
            </p>
            <p className="text-[12px] leading-relaxed text-[var(--calqo-text-3)]">
              {t('settings.agentDrawing.setupHint')}
            </p>
            <ol className="grid gap-1.5 rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] p-3 text-[11.5px] leading-relaxed text-[var(--calqo-text-2)]">
              <li>
                <strong>1.</strong> {t('settings.agentDrawing.setupStepCopy')}
              </li>
              <li>
                <strong>2.</strong> {t('settings.agentDrawing.setupStepAdd')}
              </li>
              <li>
                <strong>3.</strong>{' '}
                {t('settings.agentDrawing.setupStepRestart')}
              </li>
            </ol>
            <GlassSegmentedControl<SnippetHost>
              ariaLabel={t('settings.agentDrawing.setupTitle')}
              options={[
                { value: 'claude', label: 'Claude Code' },
                { value: 'codex', label: 'Codex' },
                { value: 'antigravity', label: 'Antigravity' },
                { value: 'opencode', label: 'OpenCode' },
                {
                  value: 'generic',
                  label: t('settings.agentDrawing.genericHost'),
                },
              ]}
              value={snippetHost}
              onChange={(host) => {
                setSnippetHost(host);
                setSetupState({ kind: 'idle' });
              }}
            />
            <pre className="calqo-scroll overflow-x-auto rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] p-3 font-mono text-[11px] leading-relaxed text-[var(--calqo-text-2)]">
              {snippet}
            </pre>
            <div className="flex flex-wrap gap-2">
              {snippetHost !== 'generic' && (
                <GlassButton
                  onClick={() => void setupAutomatically()}
                  disabled={setupState.kind === 'installing'}
                >
                  {setupState.kind === 'success' ? (
                    <Check size={14} />
                  ) : (
                    <Bot size={14} />
                  )}
                  {setupState.kind === 'installing'
                    ? t('settings.agentDrawing.autoSetupInstalling')
                    : t('settings.agentDrawing.autoSetup')}
                </GlassButton>
              )}
              <CopyButton
                value={snippet}
                label={t('settings.agentDrawing.copySnippet')}
              />
              <CopyButton
                value={t('settings.agentDrawing.starterPrompt')}
                label={t('settings.agentDrawing.copyStarterPrompt')}
              />
            </div>
            {setupState.message && (
              <p
                role={setupState.kind === 'error' ? 'alert' : 'status'}
                className="text-[11.5px] leading-snug"
                style={{
                  color:
                    setupState.kind === 'error'
                      ? '#ff5f57'
                      : 'var(--calqo-accent)',
                }}
              >
                {setupState.message}
              </p>
            )}
            <p className="text-[11.5px] leading-snug text-[var(--calqo-text-3)]">
              {t('settings.agentDrawing.restartHint')}
            </p>
            <details className="rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass-thin)] px-3 py-2">
              <summary className="cursor-pointer text-[11.5px] font-medium text-[var(--calqo-text-2)]">
                {t('settings.agentDrawing.advancedSecurity')}
              </summary>
              <div className="mt-2 flex flex-wrap gap-2">
                <CopyButton
                  value={settings.token}
                  label={t('settings.agentDrawing.copyToken')}
                />
                <GlassButton
                  onClick={() => {
                    useMcpStore.getState().regenerateToken();
                    void restartMcpServer();
                  }}
                >
                  <RefreshCw size={14} />
                  {t('settings.agentDrawing.regenerateToken')}
                </GlassButton>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-[var(--calqo-text-3)]">
                {t('settings.agentDrawing.tokenHint')}
              </p>
            </details>
          </div>

          {/* Step 3 — permissions */}
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-[var(--calqo-text)]">
              {t('settings.agentDrawing.permissions')}
            </p>
            <GlassSegmentedControl<McpPermissionMode>
              ariaLabel={t('settings.agentDrawing.permissions')}
              options={permissionOptions}
              value={settings.permissionMode}
              onChange={(mode) =>
                useMcpStore.getState().setPermissionMode(mode)
              }
            />
            <p className="text-[11.5px] leading-snug text-[var(--calqo-text-3)]">
              {settings.permissionMode === 'session'
                ? t('settings.agentDrawing.modeSessionHint')
                : settings.permissionMode === 'ask'
                  ? t('settings.agentDrawing.modeAskHint')
                  : t('settings.agentDrawing.modeReadHint')}
            </p>
            {sessionWriteGranted && (
              <GlassButton onClick={() => useMcpStore.getState().revokeWrite()}>
                <ShieldOff size={14} />
                {t('settings.agentDrawing.revoke')}
              </GlassButton>
            )}
          </div>

          {/* Activity log */}
          <div className="space-y-2">
            <p className="text-[13px] font-medium text-[var(--calqo-text)]">
              {t('settings.agentDrawing.activity')}
            </p>
            {activityLog.length === 0 ? (
              <p className="text-[12px] text-[var(--calqo-text-3)]">
                {t('settings.agentDrawing.activityEmpty')}
              </p>
            ) : (
              <ul className="calqo-scroll max-h-48 space-y-1 overflow-y-auto rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] p-2">
                {activityLog.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-baseline gap-2 font-mono text-[10.5px] leading-relaxed"
                  >
                    <span className="shrink-0 text-[var(--calqo-text-3)]">
                      {new Date(entry.time).toLocaleTimeString()}
                    </span>
                    <span
                      className="shrink-0"
                      style={{ color: entry.ok ? '#28c840' : '#ff5f57' }}
                    >
                      {entry.ok ? '✓' : '✕'}
                    </span>
                    <span className="min-w-0 truncate text-[var(--calqo-text-2)]">
                      {entry.client} · {entry.tool} · {entry.summary}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* File-based fallback for agents without MCP */}
      <div className="border-t border-[var(--calqo-divider)] pt-4">
        <SkillDownloads />
      </div>
    </section>
  );
}
