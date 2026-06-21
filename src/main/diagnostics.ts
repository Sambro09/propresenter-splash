import { app } from 'electron';
import { logError, logInfo } from './logger';

export function initializeDiagnostics(): void {
  process.on('uncaughtException', (error) => {
    void logError('Uncaught exception', error);
  });

  process.on('unhandledRejection', (reason) => {
    void logError('Unhandled promise rejection', reason);
  });

  app.on('render-process-gone', (_event, webContents, details) => {
    void logError('Renderer process gone', {
      reason: details.reason,
      exitCode: details.exitCode,
      url: webContents.getURL()
    });
  });

  app.on('child-process-gone', (_event, details) => {
    void logError('Child process gone', {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      serviceName: details.serviceName
    });
  });

  app.on('will-quit', () => {
    void logInfo('Launcher quitting');
  });
}
