import i18n from '@/lib/i18n';
import { dialog } from '@/lib/adapters';
import { mcpStore, type McpClientInfo } from '@/lib/state/mcpStore';
import { McpOperationError } from './operationSchemas';

/** Write gate for agent tools. Reads never pass through here; every write does,
 * so revoking in settings takes effect on the very next call. */

function clientLabel(client: McpClientInfo | null): string {
  return client?.name?.trim() || i18n.t('common:settings.agentDrawing.unknownClient');
}

/** One in-flight approval at a time: concurrent writes from the same agent
 * await the same answer instead of stacking dialogs. */
let pendingApproval: Promise<boolean> | null = null;

async function askUser(client: McpClientInfo | null): Promise<boolean> {
  if (!pendingApproval) {
    pendingApproval = dialog
      .confirm({
        title: i18n.t('common:settings.agentDrawing.approveTitle'),
        message: i18n.t('common:settings.agentDrawing.approveMessage', {
          client: clientLabel(client),
        }),
      })
      .finally(() => {
        pendingApproval = null;
      });
  }
  return pendingApproval;
}

export type WriteAccess = 'granted' | 'requires-approval' | 'denied';

export function currentWriteAccess(): WriteAccess {
  const { settings, sessionWriteGranted } = mcpStore.getState();
  if (settings.permissionMode === 'read') return 'denied';
  if (settings.permissionMode === 'session' && sessionWriteGranted) return 'granted';
  return 'requires-approval';
}

/** Resolve write permission for one tool call, prompting the user when the
 * mode requires it. Throws `PERMISSION_DENIED` when refused. */
export async function ensureWritePermission(client: McpClientInfo | null): Promise<void> {
  const { settings, sessionWriteGranted } = mcpStore.getState();
  if (settings.permissionMode === 'read') {
    throw new McpOperationError({
      code: 'PERMISSION_DENIED',
      message:
        'Agent drawing is in read-only mode. Ask the user to allow writes in Calqo Settings > Agent drawing.',
      recoverable: false,
    });
  }
  if (settings.permissionMode === 'session' && sessionWriteGranted) return;

  const approved = await askUser(client);
  if (!approved) {
    throw new McpOperationError({
      code: 'PERMISSION_DENIED',
      message: 'The user declined this write in Calqo.',
      recoverable: true,
    });
  }
  if (settings.permissionMode === 'session') {
    mcpStore.getState().grantSessionWrite();
  }
}
