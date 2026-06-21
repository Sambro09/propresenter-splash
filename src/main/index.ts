import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import type { LaunchResult } from '../shared/types';
import { getLauncherState, launchWorkspace } from './launcherService';

const currentDir = dirname(fileURLToPath(import.meta.url));

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 500,
    height: 640,
    minWidth: 440,
    minHeight: 560,
    show: false,
    title: 'ProPresenter Workspace Launcher',
    titleBarStyle: 'hiddenInset',
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

  if (!capturePath && !shouldLogText) {
    return;
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
  }, 1_500);
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.local.propresenter-workspace-launcher');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  ipcMain.handle('launcher:get-state', () => getLauncherState());

  ipcMain.handle('launcher:launch-workspace', async (event, workspaceId: string) => {
    const result: LaunchResult = await launchWorkspace(workspaceId);
    if (result.ok) {
      const window = BrowserWindow.fromWebContents(event.sender);
      setTimeout(() => window?.close(), 700);
    }

    return result;
  });

  createWindow();

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
