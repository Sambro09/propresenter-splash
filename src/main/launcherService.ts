import {
  app,
  BrowserWindow,
  dialog,
  shell as electronShell,
  type MessageBoxOptions,
  type OpenDialogOptions
} from 'electron';
import { stat } from 'node:fs/promises';
import type {
  LauncherSettings,
  LauncherState,
  LaunchResult,
  LaunchWorkspaceOptions,
  SessionEndSettings,
  SessionEndSettingsPatch,
  WorkspaceOrderDirection,
  WorkspaceOverridePatch
} from '../shared/types';
import { writeActiveWorkspace } from './activeWorkspace';
import {
  clearWorkspaceOverride,
  getLaunchAtLoginSetupCompleteConfig,
  getSessionEndSettingsConfig,
  getWorkspaceRootConfig,
  moveWorkspaceInOrderConfig,
  setCustomWorkspaceRoot,
  setLaunchAtLoginSetupCompleteConfig,
  setSessionEndSettingsConfig,
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
import { firstRunLoginItemAction } from './loginItemSetup';
import {
  readWorkspaceDiscoveryCache,
  writeWorkspaceDiscoveryCache
} from './workspaceDiscoveryCache';

type LauncherStateListener = (state: LauncherState) => void;

const launcherStateListeners = new Set<LauncherStateListener>();
let stateRefreshPromise: Promise<LauncherState> | undefined;
const LOGIN_ITEMS_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.LoginItems-Settings.extension';

function loginItemAvailable(): boolean {
  return process.platform === 'darwin';
}

function getLaunchAtLogin(): boolean {
  if (!loginItemAvailable()) {
    return false;
  }

  try {
    return app.getLoginItemSettings({ type: 'mainAppService' }).openAtLogin;
  } catch (error) {
    void logError('Could not read Login Item settings', error);
    return false;
  }
}

async function showLoginItemMessage(
  parentWindow: BrowserWindow | undefined,
  options: MessageBoxOptions
): Promise<Electron.MessageBoxReturnValue> {
  return parentWindow
    ? dialog.showMessageBox(parentWindow, options)
    : dialog.showMessageBox(options);
}

/**
 * Ask once before registering the app as a macOS login item.
 *
 * macOS 13+ can register the main app without an authentication sheet. When
 * macOS reports `requires-approval`, direct the user to the system Login Items
 * panel where that approval is controlled.
 */
export async function initializeLaunchAtLogin(
  parentWindow?: BrowserWindow
): Promise<boolean> {
  if (!loginItemAvailable()) {
    return false;
  }

  const setupComplete = await getLaunchAtLoginSetupCompleteConfig();
  const current = app.getLoginItemSettings({ type: 'mainAppService' });
  const action = firstRunLoginItemAction(setupComplete, current);
  if (action === 'none') {
    return false;
  }
  if (action === 'mark-complete') {
    await setLaunchAtLoginSetupCompleteConfig(true);
    return true;
  }

  const permission = await showLoginItemMessage(parentWindow, {
    type: 'question',
    title: 'Launch at Login',
    message: 'Open ProPresenter Splash at login?',
    detail:
      'This puts workspace selection in front each time this Mac signs in. You can change it later in Edit Mode.',
    buttons: ['Not Now', 'Allow'],
    defaultId: 1,
    cancelId: 0,
    noLink: true
  });

  if (permission.response !== 1) {
    await setLaunchAtLoginSetupCompleteConfig(true);
    await logInfo('Launch at Login declined during first-run setup');
    return true;
  }

  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      type: 'mainAppService'
    });
  } catch (error) {
    await setLaunchAtLoginSetupCompleteConfig(true);
    await logError('Could not enable Launch at Login during first-run setup', error);
    await showLoginItemMessage(parentWindow, {
      type: 'error',
      title: 'Launch at Login',
      message: 'Could not enable Launch at Login.',
      detail: 'You can try again from Edit Mode.',
      buttons: ['OK'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    return true;
  }

  await setLaunchAtLoginSetupCompleteConfig(true);
  const registered = app.getLoginItemSettings({ type: 'mainAppService' });
  await logInfo('Launch at Login enabled during first-run setup', {
    status: registered.status
  });

  if (registered.status !== 'requires-approval') {
    return true;
  }

  const approval = await showLoginItemMessage(parentWindow, {
    type: 'info',
    title: 'Launch at Login',
    message: 'Approve Launch at Login in System Settings.',
    detail: 'Open Login Items and enable ProPresenter Splash.',
    buttons: ['Later', 'Open Login Items'],
    defaultId: 1,
    cancelId: 0,
    noLink: true
  });

  if (approval.response === 1) {
    await electronShell.openExternal(LOGIN_ITEMS_SETTINGS_URL);
  }
  return true;
}

async function getLauncherSettings(): Promise<LauncherSettings> {
  const sessionEnd = await getSessionEndSettingsConfig();
  return {
    launchAtLogin: getLaunchAtLogin(),
    launchAtLoginAvailable: loginItemAvailable(),
    sessionEnd
  };
}

async function refreshLauncherState(): Promise<LauncherState> {
  const startedAt = performance.now();
  const durations: Record<string, number> = {};
  const measure = async <T>(label: string, operation: () => Promise<T>): Promise<T> => {
    const operationStartedAt = performance.now();
    try {
      return await operation();
    } finally {
      durations[label] = Math.round(performance.now() - operationStartedAt);
    }
  };

  const [scan, appPath, running, settings] = await Promise.all([
    measure('workspaceScanMs', scanWorkspaces),
    measure('appLocationMs', locateProPresenter),
    measure('processDetectionMs', isProPresenterRunning),
    measure('settingsMs', getLauncherSettings)
  ]);

  const state: LauncherState = {
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

  await writeWorkspaceDiscoveryCache(scan, state.proPresenter).catch((error: unknown) => {
    void logError('Could not update workspace discovery cache', error);
  });

  void logInfo('Launcher state refresh completed', {
    totalMs: Math.round(performance.now() - startedAt),
    ...durations,
    workspaceCount: scan.workspaces.length,
    scanErrorCount: scan.errors.length
  });

  for (const listener of launcherStateListeners) {
    try {
      listener(state);
    } catch (error) {
      void logError('Launcher state listener failed', error);
    }
  }

  return state;
}

/**
 * Coalesce startup callers (tray, renderer, and session updates) onto one live
 * refresh. A slow Spotlight or disconnected registry path should only be
 * queried once at a time.
 */
export function getLauncherState(): Promise<LauncherState> {
  if (!stateRefreshPromise) {
    stateRefreshPromise = refreshLauncherState().finally(() => {
      stateRefreshPromise = undefined;
    });
  }

  return stateRefreshPromise;
}

/**
 * Return the last validated discovery result immediately, then reconcile it
 * with ProPresenter and the filesystem in the background.
 */
export async function getInitialLauncherState(): Promise<LauncherState> {
  const startedAt = performance.now();
  const [cache, settings, rootConfig] = await Promise.all([
    readWorkspaceDiscoveryCache(),
    getLauncherSettings(),
    getWorkspaceRootConfig()
  ]);

  if (!cache || normalizeFilePath(cache.scan.workspaceRoot) !== rootConfig.workspaceRoot) {
    return getLauncherState();
  }

  const state: LauncherState = {
    ...cache.scan,
    supportLogPath: getSupportLogPath(),
    proPresenter: cache.proPresenter,
    settings,
    session: getSessionState()
  };

  void logInfo('Workspace discovery cache served', {
    cacheReadMs: Math.round(performance.now() - startedAt),
    cacheAgeMs: Math.max(0, Date.now() - Date.parse(cache.refreshedAt)),
    workspaceCount: cache.scan.workspaces.length
  });

  // Do not await this: the renderer can act on the known-good list while the
  // live result is collected and broadcast.
  void getLauncherState().catch((error: unknown) => {
    void logError('Background launcher state refresh failed', error);
  });

  return state;
}

export function onLauncherStateRefreshed(listener: LauncherStateListener): () => void {
  launcherStateListeners.add(listener);
  return () => launcherStateListeners.delete(listener);
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
    type: 'mainAppService'
  });

  await logInfo('Launcher Login Item setting changed', { openAtLogin: value });
  return getLauncherState();
}

export async function setSessionEndSettings(
  patch: SessionEndSettingsPatch
): Promise<SessionEndSettings> {
  const settings = await setSessionEndSettingsConfig(patch);
  await logInfo('Session-end settings changed', settings);
  return settings;
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

export async function requestSessionEndConfirmation(
  parentWindow?: BrowserWindow
): Promise<boolean> {
  if (process.platform !== 'darwin') {
    throw new Error('Session-end handoff is only available on macOS.');
  }

  const { systemAction } = await getSessionEndSettingsConfig();
  const actionLabel = systemAction === 'shutdown' ? 'shutdown' : 'logout';
  const buttonLabel = systemAction === 'shutdown' ? 'Shut Down' : 'Log Out';
  const confirmationOptions: MessageBoxOptions = {
    type: 'warning',
    title: `${buttonLabel} This Mac?`,
    message: `${buttonLabel} this Mac?`,
    detail:
      'ProPresenter will close before the session ends. Make sure all presentation changes are saved.',
    buttons: ['Cancel', buttonLabel],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  };
  const confirmation = parentWindow
    ? await dialog.showMessageBox(parentWindow, confirmationOptions)
    : await dialog.showMessageBox(confirmationOptions);

  if (confirmation.response !== 1) {
    await logInfo(`Canceled macOS ${actionLabel}`);
    return false;
  }

  if (await isProPresenterRunning()) {
    try {
      await logInfo(`Closing ProPresenter before macOS ${actionLabel}`);
      await quitProPresenterAndWait();
    } catch (error) {
      await logError(`ProPresenter failed to close before macOS ${actionLabel}`, error);
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `ProPresenter did not close, so macOS ${actionLabel} was not requested. ${detail}`
      );
    }
  }

  await logInfo(`Requesting macOS ${actionLabel} confirmation`);
  const command = systemAction === 'shutdown' ? 'shut down' : 'log out';
  await runCommand('osascript', ['-e', `tell application "System Events" to ${command}`], {
    timeout: 8_000
  });
  return true;
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
      await logInfo('Closing ProPresenter before workspace switch', { targetPath });
      await quitProPresenterAndWait();
    } catch (error) {
      await logError('ProPresenter failed to close before workspace switch', error);
      const detail = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        code: 'QUIT_FAILED',
        message: `ProPresenter did not close, so the workspace was not changed. ${detail}`
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
