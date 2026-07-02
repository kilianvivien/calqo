import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Check,
  Copy,
  Download,
  RefreshCw,
  ShieldOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GlassButton, GlassSegmentedControl } from '@/components/glass';
import { clipboard } from '@/lib/adapters';
import { isTauri } from '@/lib/platform/runtime';
import {
  MCP_DEFAULT_PORT,
  useMcpStore,
  type McpPermissionMode,
} from '@/lib/state/mcpStore';
import {
  restartMcpServer,
  syncMcpServer,
} from '@/editor/mcp/bridge';
import {
  downloadCalqoAgentSkill,
  downloadClaudeAgentSkill,
} from '@/editor/ai/agentSkillFile';

/** Settings ▸ Agent drawing: enable the embedded MCP server, copy host setup
 * snippets, pick the write-permission mode, and watch the activity log. In the
 * browser the live server is unavailable, so the pane explains that and offers
 * the file-based agent skill instead. */

type SnippetHost = 'claude' | 'codex' | 'generic';

function buildSnippet(host: SnippetHost, port: number, token: string): string {
  const url = `http://127.0.0.1:${port}/mcp`;
  if (host === 'claude') {
    return [
      `claude mcp add --transport http calqo ${url} \\`,
      `  --header "Authorization: Bearer ${token}"`,
    ].join('\n');
  }
  if (host === 'codex') {
    return [
      '# ~/.codex/config.toml',
      '[mcp_servers.calqo]',
      'command = "npx"',
      `args = ["-y", "mcp-remote", "${url}",`,
      `  "--header", "Authorization: Bearer ${token}"]`,
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

  useEffect(() => {
    void useMcpStore.getState().load();
  }, []);

  const effectivePort = port ?? MCP_DEFAULT_PORT;
  const snippet = useMemo(
    () => buildSnippet(snippetHost, effectivePort, settings.token || '<token>'),
    [snippetHost, effectivePort, settings.token],
  );

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
    status === 'running' ? '#28c840' : status === 'error' ? '#ff5f57' : '#8e8e93';
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
              style={{ background: statusColor, boxShadow: `0 0 6px ${statusColor}` }}
            />
            {statusLabel}
            {connectedClient && status === 'running' && (
              <span className="text-[var(--calqo-accent)]">
                · {t('settings.agentDrawing.clientConnected', { client: connectedClient.name })}
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
            <GlassSegmentedControl<SnippetHost>
              ariaLabel={t('settings.agentDrawing.setupTitle')}
              options={[
                { value: 'claude', label: 'Claude Code' },
                { value: 'codex', label: 'Codex CLI' },
                { value: 'generic', label: t('settings.agentDrawing.genericHost') },
              ]}
              value={snippetHost}
              onChange={setSnippetHost}
            />
            <pre className="calqo-scroll overflow-x-auto rounded-[var(--calqo-radius-sm)] border border-[var(--calqo-divider)] bg-[var(--calqo-glass)] p-3 font-mono text-[11px] leading-relaxed text-[var(--calqo-text-2)]">
              {snippet}
            </pre>
            <div className="flex flex-wrap gap-2">
              <CopyButton value={snippet} label={t('settings.agentDrawing.copySnippet')} />
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
            <p className="text-[11.5px] leading-snug text-[var(--calqo-text-3)]">
              {t('settings.agentDrawing.tokenHint')}
            </p>
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
              onChange={(mode) => useMcpStore.getState().setPermissionMode(mode)}
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
