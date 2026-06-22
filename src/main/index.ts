import { app, BrowserWindow, clipboard, ipcMain, shell as electronShell } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import type {
  LaunchResult,
  LaunchWorkspaceOptions,
  WorkspaceOverridePatch
} from '../shared/types';
import { initializeDiagnostics } from './diagnostics';
import { PROPRESENTER_DOWNLOAD_URL } from './proPresenterConstants';
import {
  chooseDirectory,
  chooseWorkspacesFolder,
  getLauncherState,
  launchWorkspace,
  resetWorkspaceOverride,
  updateWorkspaceOverride
} from './launcherService';
import { createApplicationMenu, setEditMode } from './appMenu';
import { initializeAutoUpdates } from './updates';

const currentDir = dirname(fileURLToPath(import.meta.url));

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 500,
    height: 640,
    minWidth: 440,
    minHeight: 560,
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

  ipcMain.handle(
    'launcher:launch-workspace',
    async (event, workspaceId: string, options?: LaunchWorkspaceOptions) => {
      const result: LaunchResult = await launchWorkspace(workspaceId, options);
      if (result.ok) {
        const window = BrowserWindow.fromWebContents(event.sender);
        setTimeout(() => window?.close(), 700);
      }

      return result;
    }
  );

  createWindow();
  initializeAutoUpdates();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
