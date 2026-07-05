import { app, BrowserWindow } from 'electron';

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(window: BrowserWindow): void {
  if (mainWindow?.id === window.id) {
    return;
  }

  mainWindow = window;

  window.once('closed', () => {
    if (mainWindow?.id === window.id) {
      mainWindow = null;
    }
  });
}

export function getMainWindow(): BrowserWindow | null {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  mainWindow = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) ?? null;
  return mainWindow;
}

/**
 * Bring the window to the front and grab focus.
 *
 * macOS suppresses focus-stealing for apps launched in the background (e.g. login
 * items started during login), so a plain `app.focus()` is ignored in that context.
 * The brief `alwaysOnTop` pulse forces the window above others even while focus is
 * suppressed, then we drop back to normal stacking once it is frontmost.
 */
export function raiseToFront(window: BrowserWindow): void {
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

export function revealMainWindow({ steal }: { steal: boolean }): BrowserWindow | null {
  const window = getMainWindow();
  if (!window || window.isDestroyed()) {
    return null;
  }

  if (steal) {
    raiseToFront(window);
    return window;
  }

  if (window.isMinimized()) {
    window.restore();
  }
  window.showInactive();
  app.dock?.show();
  return window;
}
