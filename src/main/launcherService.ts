import { app, BrowserWindow, dialog, type OpenDialogOptions } from 'electron';
import { stat } from 'node:fs/promises';
import type {
  LauncherSettings,
  LauncherState,
  LaunchResult,
  LaunchWorkspaceOptions,
  WorkspaceOrderDirection,
  WorkspaceOverridePatch
} from '../shared/types';
import { writeActiveWorkspace } from './activeWorkspace';
import {
  clearWorkspaceOverride,
  getOperatorModeConfig,
  moveWorkspaceInOrderConfig,
  setCustomWorkspaceRoot,
  setOperatorModeConfig,
  setWorkspacePinnedConfig,
  setWorkspaceOverride
} from './config';
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
import { runCommand } from './shell';
import { getSessionState } from './sessionController';

function loginItemAvailable(): boolean {
  return process.platform === 'darwin';
}

function getLaunchAtLogin(): boolean {
  if (!loginItemAvailable()) {
    return false;
  }

  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch (error) {
    void logError('Could not read Login Item settings', error);
    return false;
  }
}

async function getLauncherSettings(): Promise<LauncherSettings> {
  const operatorMode = await getOperatorModeConfig();
  return {
    launchAtLogin: getLaunchAtLogin(),
    launchAtLoginAvailable: loginItemAvailable(),
    operatorMode
  };
}

export async function getLauncherState(): Promise<LauncherState> {
  const [scan, appPath, running, settings] = await Promise.all([
    scanWorkspaces(),
    locateProPresenter(),
    isProPresenterRunning(),
    getLauncherSettings()
  ]);

  return {
    ...scan,
    supportLogPath: getSupportLogPath(),
    proPresenter: {
      installed: Boolean(appPath),
      running,
      appPath
    },
    settings,
    session: getSessionState()
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

export async function chooseDirectory(
  parentWindow: BrowserWindow | undefined
): Promise<string | null> {
  const dialogOptions: OpenDialogOptions = {
    title: 'Choose Workspace Folder',
    buttonLabel: 'Choose',
    properties: ['openDirectory']
  };

  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  const selectedPath = result.filePaths[0];
  if (result.canceled || !selectedPath) {
    return null;
  }

  return normalizeFilePath(selectedPath);
}

export async function updateWorkspaceOverride(
  key: string,
  patch: WorkspaceOverridePatch
): Promise<LauncherState> {
  if (typeof patch.path === 'string' && patch.path.trim()) {
    const targetPath = normalizeFilePath(patch.path);
    try {
      const stats = await stat(targetPath);
      if (!stats.isDirectory()) {
        throw new Error('not a directory');
      }
    } catch {
      throw new Error('That folder could not be found. Choose an existing workspace folder.');
    }
  }

  await setWorkspaceOverride(key, patch);
  await logInfo('Workspace override updated', { key, patch });
  return getLauncherState();
}

export async function resetWorkspaceOverride(key: string): Promise<LauncherState> {
  await clearWorkspaceOverride(key);
  await logInfo('Workspace override cleared', { key });
  return getLauncherState();
}

export async function setLaunchAtLogin(value: boolean): Promise<LauncherState> {
  if (!loginItemAvailable()) {
    throw new Error('Login Item registration is only available on macOS.');
  }

  app.setLoginItemSettings({
    openAtLogin: value,
    openAsHidden: false
  });

  await logInfo('Launcher Login Item setting changed', { openAtLogin: value });
  return getLauncherState();
}

export async function setOperatorMode(value: boolean): Promise<LauncherState> {
  await setOperatorModeConfig(value);
  await logInfo('Operator startup mode changed', { operatorMode: value });
  return getLauncherState();
}

export async function setWorkspacePinned(
  key: string,
  pinned: boolean
): Promise<LauncherState> {
  const scan = await scanWorkspaces();
  await setWorkspacePinnedConfig(
    key,
    pinned,
    scan.workspaces.map((workspace) => workspace.key)
  );
  await logInfo('Workspace pin changed', { key, pinned });
  return getLauncherState();
}

export async function moveWorkspace(
  key: string,
  direction: WorkspaceOrderDirection
): Promise<LauncherState> {
  const scan = await scanWorkspaces();
  await moveWorkspaceInOrderConfig(
    key,
    direction,
    scan.workspaces.map((workspace) => workspace.key)
  );
  await logInfo('Workspace order changed', { key, direction });
  return getLauncherState();
}

export async function requestLogoutConfirmation(): Promise<void> {
  if (process.platform !== 'darwin') {
    throw new Error('Logout handoff is only available on macOS.');
  }

  if (await isProPresenterRunning()) {
    try {
      await logInfo('Quitting ProPresenter before macOS logout');
      await quitProPresenterAndWait();
    } catch (error) {
      await logError('ProPresenter failed to quit before macOS logout', error);
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `ProPresenter did not quit, so macOS logout was not requested. ${detail}`
      );
    }
  }

  await logInfo('Requesting macOS logout confirmation');
  await runCommand('osascript', ['-e', 'tell application "System Events" to log out'], {
    timeout: 8_000
  });
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
        workspaceId: targetPath,
        workspaceName: targetWorkspace?.name,
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
      workspaceId: targetPath,
      workspaceName: targetWorkspace?.name,
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
    workspaceId: targetPath,
    workspaceName: targetWorkspace?.name,
    message: 'Opening ProPresenter.'
  };
}
