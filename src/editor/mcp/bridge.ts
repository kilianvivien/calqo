import { isTauri } from '@/lib/platform/runtime';
import {
  MCP_DEFAULT_PORT,
  mcpStore,
  type McpClientInfo,
} from '@/lib/state/mcpStore';
import { createProject } from '@/editor/commands/projectCommands';
import { projectStore } from '@/lib/state/projectStore';
import { workspaceStore } from '@/lib/state/workspaceStore';
import {
  createProjectInputSchema,
  McpOperationError,
  type McpErrorPayload,
} from './operationSchemas';
import {
  executeApplyOperations,
  executeValidateOperations,
  projectRevision,
} from './executor';
import {
  serializeAppStatus,
  serializeArtboardPresets,
  serializeProjectSummary,
} from './contextSerializers';
import { MCP_AGENT_GUIDE } from './guide';
import { currentWriteAccess, ensureWritePermission } from './permissions';
import { renderMcpPreview } from './preview';

/** Webview side of the Tauri MCP bridge. The embedded Rust server forwards
 * every tool/resource call here as a `calqo-mcp-request` event; this module
 * executes it against live editor state and answers via `mcp_bridge_respond`.
 * Rust owns transport + auth; all validation, permissions, and mutations stay
 * in TypeScript so agent edits share the user's command path. */

interface McpBridgeRequest {
  id: string;
  method: string;
  args?: unknown;
  client?: McpClientInfo | null;
}

interface McpServerStatusEvent {
  running: boolean;
  port?: number | null;
  error?: string | null;
}

function toErrorPayload(error: unknown): McpErrorPayload {
  if (error instanceof McpOperationError) return error.payload;
  return {
    code: 'INTERNAL_ERROR',
    message: error instanceof Error ? error.message : String(error),
    recoverable: false,
  };
}

async function handleCreateProject(args: unknown): Promise<unknown> {
  const parsed = createProjectInputSchema.safeParse(args ?? {});
  if (!parsed.success) {
    throw new McpOperationError({
      code: 'VALIDATION_FAILED',
      message: 'Invalid create_project input.',
      recoverable: true,
      details: {
        issues: parsed.error.issues.map(
          (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
        ),
      },
    });
  }
  const projectId = await createProject(parsed.data);
  const project = projectStore.getState().projects[projectId];
  return {
    ok: true,
    projectId,
    revision: project ? projectRevision(project) : null,
    artboardId: project?.artboards[0]?.id ?? null,
    summary: project ? serializeProjectSummary(project) : null,
  };
}

function handleProjectSummary(args: unknown): unknown {
  const projectId =
    args && typeof args === 'object' && 'projectId' in args
      ? String((args as { projectId: unknown }).projectId)
      : (workspaceStore.getState().activeProjectId ?? undefined);
  const project = projectId ? projectStore.getState().projects[projectId] : null;
  if (!project) {
    throw new McpOperationError({
      code: 'PROJECT_NOT_FOUND',
      message: 'No project is open in Calqo.',
      recoverable: true,
    });
  }
  return serializeProjectSummary(project);
}

/** Writes run one at a time, in arrival order, so two agent batches can never
 * interleave inside the same undo step. */
let writeChain: Promise<void> = Promise.resolve();

function enqueueWrite<T>(work: () => Promise<T>): Promise<T> {
  const result = writeChain.then(work, work);
  writeChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function describeResult(method: string, result: unknown): string {
  if (method === 'apply_operations' && result && typeof result === 'object') {
    const changed = (result as { changedLayerIds?: string[] }).changedLayerIds;
    return changed ? `${changed.length} layer(s) changed` : 'applied';
  }
  if (method === 'create_project' && result && typeof result === 'object') {
    return `project ${(result as { projectId?: string }).projectId ?? ''}`.trim();
  }
  if (method === 'validate_operations' && result && typeof result === 'object') {
    return (result as { valid?: boolean }).valid ? 'valid' : 'invalid';
  }
  if (method === 'get_preview') return 'preview rendered';
  return 'ok';
}

async function dispatch(request: McpBridgeRequest): Promise<unknown> {
  const client = request.client ?? null;
  switch (request.method) {
    case 'get_status':
      return serializeAppStatus();
    case 'get_guide':
      return { guide: MCP_AGENT_GUIDE };
    case 'get_presets':
      return { presets: serializeArtboardPresets() };
    case 'get_project_summary':
      return handleProjectSummary(request.args);
    case 'request_control':
      await ensureWritePermission(client);
      return { ok: true, writeAccess: currentWriteAccess() };
    case 'create_project':
      return enqueueWrite(async () => {
        await ensureWritePermission(client);
        return handleCreateProject(request.args);
      });
    case 'apply_operations':
      return enqueueWrite(async () => {
        await ensureWritePermission(client);
        mcpStore.getState().setApplying(true);
        try {
          return executeApplyOperations(request.args);
        } finally {
          mcpStore.getState().setApplying(false);
        }
      });
    case 'validate_operations':
      return executeValidateOperations(request.args);
    case 'get_preview':
      return renderMcpPreview(request.args);
    default:
      throw new McpOperationError({
        code: 'UNSUPPORTED_OPERATION',
        message: `Unknown bridge method "${request.method}".`,
        recoverable: false,
      });
  }
}

async function handleBridgeRequest(request: McpBridgeRequest): Promise<void> {
  const store = mcpStore.getState();
  if (request.client?.name) store.setConnectedClient(request.client);

  let response: { ok: true; result: unknown } | { ok: false; error: McpErrorPayload };
  try {
    const result = await dispatch(request);
    response = { ok: true, result };
    store.logActivity({
      client: request.client?.name ?? 'agent',
      tool: request.method,
      ok: true,
      summary: describeResult(request.method, result),
    });
  } catch (error) {
    const payload = toErrorPayload(error);
    response = { ok: false, error: payload };
    store.logActivity({
      client: request.client?.name ?? 'agent',
      tool: request.method,
      ok: false,
      summary: payload.code,
    });
    if (payload.code === 'INTERNAL_ERROR') {
      console.error('[Calqo] MCP bridge request failed', error);
    }
  }

  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('mcp_bridge_respond', { id: request.id, response });
  } catch (error) {
    console.error('[Calqo] failed to answer MCP bridge request', error);
  }
}

// --- Server lifecycle -------------------------------------------------------

export async function startMcpServer(): Promise<void> {
  if (!isTauri) return;
  const { settings, status } = mcpStore.getState();
  if (!settings.enabled || !settings.token) return;
  if (status === 'running' || status === 'starting') return;
  mcpStore.getState().setServerStatus('starting');
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const port = await invoke<number>('mcp_start_server', {
      token: settings.token,
      preferredPort: MCP_DEFAULT_PORT,
    });
    mcpStore.getState().setServerStatus('running', port);
  } catch (error) {
    console.error('[Calqo] failed to start the MCP server', error);
    mcpStore.getState().setServerStatus('error', null, String(error));
  }
}

export async function stopMcpServer(): Promise<void> {
  if (!isTauri) return;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('mcp_stop_server');
  } catch (error) {
    console.error('[Calqo] failed to stop the MCP server', error);
  }
  mcpStore.getState().setServerStatus('stopped');
}

/** Restart with the current settings (token regeneration). */
export async function restartMcpServer(): Promise<void> {
  await stopMcpServer();
  await startMcpServer();
}

/** Reconcile the running server with the persisted toggle. */
export async function syncMcpServer(): Promise<void> {
  const { settings, status } = mcpStore.getState();
  if (settings.enabled && status !== 'running' && status !== 'starting') {
    await startMcpServer();
  } else if (!settings.enabled && (status === 'running' || status === 'starting')) {
    await stopMcpServer();
  }
}

/** Wire the bridge on app start (Tauri only): load persisted settings, listen
 * for forwarded MCP requests and server status, and auto-start when enabled.
 * Returns a cleanup that detaches listeners (the server itself is owned by the
 * Rust side and stops with the app or the settings toggle). */
export function initAgentDrawing(): () => void {
  if (!isTauri) return () => {};
  let disposed = false;
  const unlisteners: Array<() => void> = [];

  void (async () => {
    await mcpStore.getState().load();
    const { listen } = await import('@tauri-apps/api/event');
    const unlistenRequest = await listen<McpBridgeRequest>('calqo-mcp-request', (event) => {
      void handleBridgeRequest(event.payload);
    });
    const unlistenStatus = await listen<McpServerStatusEvent>('calqo-mcp-status', (event) => {
      const { running, port, error } = event.payload;
      if (running) mcpStore.getState().setServerStatus('running', port ?? null);
      else mcpStore.getState().setServerStatus(error ? 'error' : 'stopped', null, error ?? null);
    });
    if (disposed) {
      unlistenRequest();
      unlistenStatus();
      return;
    }
    unlisteners.push(unlistenRequest, unlistenStatus);
    await syncMcpServer();
  })();

  return () => {
    disposed = true;
    unlisteners.forEach((unlisten) => unlisten());
  };
}
