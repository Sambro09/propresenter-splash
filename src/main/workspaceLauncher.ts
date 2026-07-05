import type { LaunchResult, LaunchWorkspaceOptions } from '../shared/types';
import { launchWorkspace } from './launcherService';
import { beginProPresenterSession } from './sessionController';
import { getMainWindow } from './windowManager';

const HANDOFF_HIDE_DELAY_MS = 700;

function beginSessionAndHideWindow(result: LaunchResult, fallbackWorkspaceId: string): void {
  const window = getMainWindow();

  beginProPresenterSession(window, {
    id: result.workspaceId ?? fallbackWorkspaceId,
    name: result.workspaceName
  });

  setTimeout(() => {
    if (window && !window.isDestroyed()) {
      window.hide();
    }
  }, HANDOFF_HIDE_DELAY_MS);
}

export async function runWorkspaceLaunch(
  workspaceId: string,
  options: LaunchWorkspaceOptions = {}
): Promise<LaunchResult> {
  const result = await launchWorkspace(workspaceId, options);
  if (result.ok) {
    beginSessionAndHideWindow(result, workspaceId);
  }

  return result;
}
