import { app } from 'electron';
import electronUpdater from 'electron-updater';
import { logError, logInfo } from './logger';

const INITIAL_UPDATE_CHECK_DELAY_MS = 30_000;
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const { autoUpdater } = electronUpdater;

export function initializeAutoUpdates(): void {
  if (!app.isPackaged) {
    void logInfo('Auto-update check skipped outside a packaged build');
    return;
  }

  autoUpdater.logger = {
    info: (message?: unknown) => void logInfo('autoUpdater info', message),
    warn: (message?: unknown) => void logInfo('autoUpdater warning', message),
    error: (message?: unknown) => void logError('autoUpdater error', message)
  };

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    void logInfo('Checking for launcher update');
  });

  autoUpdater.on('update-available', (info) => {
    void logInfo('Launcher update available', {
      version: info.version,
      releaseDate: info.releaseDate
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    void logInfo('Launcher update not available', {
      version: info.version,
      releaseDate: info.releaseDate
    });
  });

  autoUpdater.on('download-progress', (info) => {
    void logInfo('Launcher update download progress', {
      percent: Math.round(info.percent),
      transferred: info.transferred,
      total: info.total
    });
  });

  autoUpdater.on('update-downloaded', (event) => {
    void logInfo('Launcher update downloaded; will install on quit', {
      version: event.version,
      releaseDate: event.releaseDate
    });
  });

  autoUpdater.on('error', (error) => {
    void logError('Launcher update check failed', error);
  });

  const check = (): void => {
    void autoUpdater.checkForUpdatesAndNotify().catch((error: unknown) => {
      void logError('Launcher update check failed', error);
    });
  };

  setTimeout(check, INITIAL_UPDATE_CHECK_DELAY_MS);
  setInterval(check, UPDATE_CHECK_INTERVAL_MS);
}
