import { BrowserWindow, dialog, type OpenDialogOptions } from 'electron';
import { stat } from 'node:fs/promises';
import type { LauncherState, LaunchResult, LaunchWorkspaceOptions } from '../shared/types';
import { writeActiveWorkspace } from './activeWorkspace';
import { setCustomWorkspaceRoot } from './config';
import { getSupportLogPath, logError, logInfo } from './logger';
import { normalizeFilePath } from './pathUtils';
import { scanWorkspaces } from './workspaceScanner';
import {
  focusProPresenter,
  isProPresenterRunning,
  launchProPresenter,
  locateProPresenter,
  quitProPresenterAndWait
} from './proPresenterController';

export async function getLauncherState(): Promise<LauncherState> {
  const [scan, appPath, running] = await Promise.all([
    scanWorkspaces(),
    locateProPresenter(),
    isProPresenterRunning()
  ]);

  return {
    ...scan,
    supportLogPath: getSupportLogPath(),
    proPresenter: {
      installed: Boolean(appPath),
      running,
      appPath
    }
  };
}

export async function chooseWorkspacesFolder(
  parentWindow: BrowserWindow | undefined
): Promise<LauncherState> {
  const dialogOptions: OpenDialogOptions = {
    title: 'Choose ProPresenter Workspaces Folder',
    buttonLabel: 'Choose Folder',
    properties: ['openDirectory']
  };

  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  const selectedPath = result.filePaths[0];
  if (!result.canceled && selectedPath) {
    await setCustomWorkspaceRoot(selectedPath);
    await logInfo('Custom workspace folder selected', { selectedPath });
  }

  return getLauncherState();
}

export async function launchWorkspace(
  workspaceId: string,
  options: LaunchWorkspaceOptions = {}
): Promise<LaunchResult> {
  const targetPath = normalizeFilePath(workspaceId);
  const appPath = await locateProPresenter();

  if (!appPath) {
    return {
      ok: false,
      code: 'PROPRESENTER_NOT_FOUND',
      message: 'ProPresenter could not be found on this Mac.'
    };
  }

  try {
    const stats = await stat(targetPath);
    if (!stats.isDirectory()) {
      throw new Error('Selected path is not a directory.');
    }
  } catch {
    return {
      ok: false,
      code: 'WORKSPACE_NOT_FOUND',
      message: 'The selected workspace folder no longer exists.'
    };
  }

  const running = await isProPresenterRunning();
  const state = await scanWorkspaces();
  const targetWorkspace = state.workspaces.find((workspace) => workspace.id === targetPath);
  const selectedIsActive =
    targetWorkspace?.isActive === true || state.activeWorkspaceId === targetPath;

  if (running && selectedIsActive) {
    try {
      await focusProPresenter(appPath);
      await logInfo('Focused already-active ProPresenter workspace', { targetPath });
      return {
        ok: true,
        message: 'Bringing ProPresenter to the front.'
      };
    } catch (error) {
      await logError('Could not focus ProPresenter', error);
      const detail = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        code: 'FOCUS_FAILED',
        message: `ProPresenter is already using that workspace, but could not be focused. ${detail}`
      };
    }
  }

  if (running && !options.confirmQuit) {
    return {
      ok: false,
      code: 'CONFIRM_QUIT_REQUIRED',
      requiresConfirmation: true,
      message: `ProPresenter is open. Save any work first, then confirm switching to "${targetWorkspace?.name ?? 'this workspace'}".`
    };
  }

  if (running) {
    try {
      await logInfo('Quitting ProPresenter before workspace switch', { targetPath });
      await quitProPresenterAndWait();
    } catch (error) {
      await logError('ProPresenter failed to quit before workspace switch', error);
      const detail = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        code: 'QUIT_FAILED',
        message: `ProPresenter did not quit, so the workspace was not changed. ${detail}`
      };
    }
  }

  try {
    await writeActiveWorkspace(targetPath);
    await logInfo('Active workspace preferences updated', { targetPath });
  } catch (error) {
    await logError('Could not update active workspace preferences', error);
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: 'PREFERENCE_WRITE_FAILED',
      message: `Could not switch ProPresenter to that workspace. ${detail}`
    };
  }

  try {
    await launchProPresenter(appPath);
    await logInfo('Launched ProPresenter', { appPath, targetPath });
  } catch (error) {
    await logError('Could not launch ProPresenter', error);
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: 'LAUNCH_FAILED',
      message: `The workspace was selected, but ProPresenter could not be opened. ${detail}`
    };
  }

  return {
    ok: true,
    message: 'Opening ProPresenter.'
  };
}
