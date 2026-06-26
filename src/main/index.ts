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
  CopierCopyRequest,
  LaunchResult,
  LaunchWorkspaceOptions,
  WorkspaceOrderDirection,
  WorkspaceOverridePatch
} from '../shared/types';
import { pickCopierFolder, runCopier } from './copier/copierService';
import { initializeDiagnostics } from './diagnostics';
import { PROPRESENTER_DOWNLOAD_URL } from './proPresenterConstants';
import {
  chooseDirectory,
  chooseWorkspacesFolder,
  getLauncherState,
  launchWorkspace,
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
import {
  beginProPresenterSession,
  clearSessionState,
  getSessionState
} from './sessionController';

const currentDir = dirname(fileURLToPath(import.meta.url));

/**
 * Bring the window to the front and grab focus.
 *
 * macOS suppresses focus-stealing for apps launched in the background (e.g. login
 * items started during login), so a plain `app.focus()` is ignored in that context.
 * The brief `alwaysOnTop` pulse forces the window above others even while focus is
 * suppressed, then we drop back to normal stacking once it is frontmost.
 */
function raiseToFront(window: BrowserWindow): void {
  if (window.isDestroyed()) {
    return;
  }
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.center();
  window.setAlwaysOnTop(true);
  window.focus();
  app.focus({ steal: true });
  app.dock?.show();
  setTimeout(() => {
    if (!window.isDestroyed()) {
      window.setAlwaysOnTop(false);
    }
  }, 1_000);
}

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

async function createWindow(): Promise<void> {
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

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
    if (operatorMode) {
      raiseToFront(mainWindow);
      // `ready-to-show` often fires before the window server will honor an
      // activation during the login storm — retry once after it settles.
      setTimeout(() => raiseToFront(mainWindow), 1_500);
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

function beginSessionAndHideWindow(
  window: BrowserWindow | null,
  result: LaunchResult,
  fallbackWorkspaceId: string
): void {
  beginProPresenterSession(window, {
    id: result.workspaceId ?? fallbackWorkspaceId,
    name: result.workspaceName
  });

  setTimeout(() => {
    if (window && !window.isDestroyed()) {
      window.hide();
    }
  }, 700);
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

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  ipcMain.handle('launcher:get-state', () => getLauncherState());

  ipcMain.handle('launcher:choose-workspaces-folder', (event) =>
    chooseWorkspacesFolder(BrowserWindow.fromWebContents(event.sender) ?? undefined)
  );

  ipcMain.handle('launcher:copy-support-details', (_event, details: string) => {
    clipboard.writeText(details);
  });

  ipcMain.handle('launcher:open-propresenter-download', () =>
    electronShell.openExternal(PROPRESENTER_DOWNLOAD_URL)
  );

  ipcMain.handle(
    'launcher:update-workspace',
    (_event, key: string, patch: WorkspaceOverridePatch) => updateWorkspaceOverride(key, patch)
  );

  ipcMain.handle('launcher:reset-workspace', (_event, key: string) =>
    resetWorkspaceOverride(key)
  );

  ipcMain.handle('launcher:choose-directory', (event) =>
    chooseDirectory(BrowserWindow.fromWebContents(event.sender) ?? undefined)
  );

  ipcMain.handle('launcher:set-edit-mode', (_event, value: boolean) =>
    setEditMode(Boolean(value), { notifyRenderer: false })
  );

  ipcMain.handle('launcher:copier-pick-folder', (event) =>
    pickCopierFolder(BrowserWindow.fromWebContents(event.sender) ?? undefined)
  );

  ipcMain.handle('launcher:copier-run', (_event, request: CopierCopyRequest) =>
    runCopier(request)
  );

  ipcMain.handle('launcher:set-launch-at-login', (_event, value: boolean) =>
    setLaunchAtLogin(Boolean(value))
  );

  ipcMain.handle('launcher:set-operator-mode', async (event, value: boolean) => {
    const state = await setOperatorMode(Boolean(value));
    if (value) {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        raiseToFront(window);
      }
    }
    return state;
  });

  ipcMain.handle('launcher:set-workspace-pinned', (_event, key: string, pinned: boolean) =>
    setWorkspacePinned(key, Boolean(pinned))
  );

  ipcMain.handle(
    'launcher:move-workspace',
    (_event, key: string, direction: WorkspaceOrderDirection) => moveWorkspace(key, direction)
  );

  ipcMain.handle('launcher:clear-session', () => clearSessionState());

  ipcMain.handle('launcher:request-logout', () => requestLogoutConfirmation());

  ipcMain.handle('launcher:reopen-last-workspace', async (event) => {
    const session = getSessionState();
    if (!session.lastWorkspaceId) {
      return {
        ok: false,
        code: 'NO_SESSION_WORKSPACE',
        message: 'There is no recent workspace to reopen.'
      } satisfies LaunchResult;
    }

    const result: LaunchResult = await launchWorkspace(session.lastWorkspaceId);
    if (result.ok) {
      beginSessionAndHideWindow(
        BrowserWindow.fromWebContents(event.sender),
        result,
        session.lastWorkspaceId
      );
    }

    return result;
  });

  ipcMain.handle(
    'launcher:launch-workspace',
    async (event, workspaceId: string, options?: LaunchWorkspaceOptions) => {
      const result: LaunchResult = await launchWorkspace(workspaceId, options);
      if (result.ok) {
        beginSessionAndHideWindow(BrowserWindow.fromWebContents(event.sender), result, workspaceId);
      }

      return result;
    }
  );

  void createWindow();
  initializeAutoUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
