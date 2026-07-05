import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  nativeImage,
  shell as electronShell
} from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import type {
  LauncherState,
  LaunchResult,
  LaunchWorkspaceOptions,
  WorkspaceOrderDirection,
  WorkspaceOverridePatch
} from '../shared/types';
import { initializeDiagnostics } from './diagnostics';
import { PROPRESENTER_DOWNLOAD_URL } from './proPresenterConstants';
import {
  chooseDirectory,
  chooseWorkspacesFolder,
  getLauncherState,
  moveWorkspace,
  requestLogoutConfirmation,
  resetWorkspaceOverride,
  setLaunchAtLogin,
  setOperatorMode,
  setWorkspacePinned,
  updateWorkspaceOverride
} from './launcherService';
import { createApplicationMenu, setEditMode } from './appMenu';
import { initializeAutoUpdates } from './updates';
import { getOperatorModeConfig } from './config';
import { clearSessionState, getSessionState, onSessionChange } from './sessionController';
import { revealMainWindow, setMainWindow } from './windowManager';
import { runWorkspaceLaunch } from './workspaceLauncher';
import { createTray, type UpdateTrayMenu } from './tray';
import { focusProPresenter, locateProPresenter } from './proPresenterController';

const currentDir = dirname(fileURLToPath(import.meta.url));
let updateTrayMenu: UpdateTrayMenu = () => {};

/**
 * Apply the brand icon to the macOS Dock while developing.
 *
 * In a packaged build the Dock and app-switcher icon come from the `.icns`
 * baked into the `.app` bundle (electron-builder reads `build/icon.icns`), so
 * this is a no-op there. During `electron-vite dev` there is no bundle, and the
 * Dock would otherwise fall back to the generic Electron icon.
 */
function setDevelopmentDockIcon(): void {
  if (app.isPackaged || process.platform !== 'darwin' || !app.dock) {
    return;
  }
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'build', 'icon.png'));
  if (!icon.isEmpty()) {
    app.dock.setIcon(icon);
  }
}

async function createWindow(options: { focusOnReady?: boolean } = {}): Promise<void> {
  const operatorMode = await getOperatorModeConfig();
  const mainWindow = new BrowserWindow({
    width: operatorMode ? 720 : 500,
    height: operatorMode ? 760 : 640,
    minWidth: operatorMode ? 560 : 440,
    minHeight: 560,
    center: true,
    show: false,
    title: 'ProPresenter Splash',
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1b1b1d',
    webPreferences: {
      preload: join(currentDir, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  setMainWindow(mainWindow);

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
    if (operatorMode || options.focusOnReady) {
      revealMainWindow({ steal: true });
      // `ready-to-show` often fires before the window server will honor an
      // activation during the login storm — retry once after it settles.
      setTimeout(() => revealMainWindow({ steal: true }), 1_500);
    }
  });

  mainWindow.webContents.once('did-finish-load', () => {
    runSmokeHooks(mainWindow);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(currentDir, '../renderer/index.html'));
  }
}

async function showOrCreateWindow({ steal }: { steal: boolean }): Promise<void> {
  const window = revealMainWindow({ steal });
  if (window) {
    return;
  }

  await createWindow({ focusOnReady: steal });
}

async function withTrayState(statePromise: Promise<LauncherState>): Promise<LauncherState> {
  const state = await statePromise;
  updateTrayMenu(state);
  return state;
}

function runSmokeHooks(window: BrowserWindow): void {
  const capturePath = process.env.LAUNCHER_SMOKE_CAPTURE;
  const shouldLogText = process.env.LAUNCHER_SMOKE_TEXT === '1';
  const delayMs = Number(process.env.LAUNCHER_SMOKE_DELAY_MS ?? 1_500);

  if (!capturePath && !shouldLogText) {
    return;
  }

  const baseDelay = Number.isFinite(delayMs) ? delayMs : 1_500;

  if (process.env.LAUNCHER_SMOKE_EDIT === '1') {
    setTimeout(() => setEditMode(true, { notifyRenderer: true }), Math.min(baseDelay / 2, 1_200));
  }

  const clickSelector = process.env.LAUNCHER_SMOKE_CLICK;
  if (clickSelector) {
    setTimeout(() => {
      void window.webContents.executeJavaScript(
        `document.querySelector(${JSON.stringify(clickSelector)})?.click();`
      );
    }, Math.min(baseDelay * 0.75, 1_800));
  }

  setTimeout(async () => {
    if (shouldLogText) {
      const text = await window.webContents.executeJavaScript('document.body.innerText');
      console.log(String(text));
    }

    if (capturePath) {
      const image = await window.webContents.capturePage();
      await writeFile(capturePath, image.toPNG());
    }

    if (process.env.LAUNCHER_SMOKE_QUIT === '1') {
      app.quit();
    }
  }, Number.isFinite(delayMs) ? delayMs : 1_500);
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.propresentersplash.app');
  setDevelopmentDockIcon();
  initializeDiagnostics();
  createApplicationMenu();
  updateTrayMenu = createTray({
    showSplash: () => showOrCreateWindow({ steal: true })
  });
  onSessionChange(() => updateTrayMenu());

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  ipcMain.handle('launcher:get-state', () => withTrayState(getLauncherState()));

  ipcMain.handle('launcher:choose-workspaces-folder', (event) =>
    withTrayState(chooseWorkspacesFolder(BrowserWindow.fromWebContents(event.sender) ?? undefined))
  );

  ipcMain.handle('launcher:copy-support-details', (_event, details: string) => {
    clipboard.writeText(details);
  });

  ipcMain.handle('launcher:open-propresenter-download', () =>
    electronShell.openExternal(PROPRESENTER_DOWNLOAD_URL)
  );

  ipcMain.handle('launcher:focus-propresenter', async () => {
    const appPath = await locateProPresenter();
    if (!appPath) {
      throw new Error('ProPresenter could not be found on this Mac.');
    }

    await focusProPresenter(appPath);
    updateTrayMenu();
  });

  ipcMain.handle(
    'launcher:update-workspace',
    (_event, key: string, patch: WorkspaceOverridePatch) =>
      withTrayState(updateWorkspaceOverride(key, patch))
  );

  ipcMain.handle('launcher:reset-workspace', (_event, key: string) =>
    withTrayState(resetWorkspaceOverride(key))
  );

  ipcMain.handle('launcher:choose-directory', (event) =>
    chooseDirectory(BrowserWindow.fromWebContents(event.sender) ?? undefined)
  );

  ipcMain.handle('launcher:set-edit-mode', (_event, value: boolean) =>
    setEditMode(Boolean(value), { notifyRenderer: false })
  );

  ipcMain.handle('launcher:set-launch-at-login', (_event, value: boolean) =>
    withTrayState(setLaunchAtLogin(Boolean(value)))
  );

  ipcMain.handle('launcher:set-operator-mode', async (event, value: boolean) => {
    const state = await setOperatorMode(Boolean(value));
    updateTrayMenu(state);
    if (value) {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        setMainWindow(window);
        revealMainWindow({ steal: true });
      }
    }
    return state;
  });

  ipcMain.handle('launcher:set-workspace-pinned', (_event, key: string, pinned: boolean) =>
    withTrayState(setWorkspacePinned(key, Boolean(pinned)))
  );

  ipcMain.handle(
    'launcher:move-workspace',
    (_event, key: string, direction: WorkspaceOrderDirection) =>
      withTrayState(moveWorkspace(key, direction))
  );

  ipcMain.handle('launcher:clear-session', () => {
    const session = clearSessionState();
    updateTrayMenu();
    return session;
  });

  ipcMain.handle('launcher:request-logout', async () => {
    await requestLogoutConfirmation();
    updateTrayMenu();
  });

  ipcMain.handle('launcher:reopen-last-workspace', async (event) => {
    const session = getSessionState();
    if (!session.lastWorkspaceId) {
      return {
        ok: false,
        code: 'NO_SESSION_WORKSPACE',
        message: 'There is no recent workspace to reopen.'
      } satisfies LaunchResult;
    }

    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      setMainWindow(window);
    }

    const result = await runWorkspaceLaunch(session.lastWorkspaceId);
    updateTrayMenu();
    return result;
  });

  ipcMain.handle(
    'launcher:launch-workspace',
    async (event, workspaceId: string, options?: LaunchWorkspaceOptions) => {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        setMainWindow(window);
      }

      const result = await runWorkspaceLaunch(workspaceId, options);
      updateTrayMenu();
      return result;
    }
  );

  void createWindow();
  initializeAutoUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow({ focusOnReady: true });
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
