import { app, BrowserWindow } from 'electron';
import type { ProPresenterWindowState, SessionState } from '../shared/types';
import { logError, logInfo } from './logger';
import { getProPresenterWindowState, isProPresenterRunning } from './proPresenterController';

const POLL_INTERVAL_MS = 500;
const LAUNCH_GRACE_MS = 15_000;
const WINDOW_STATE_DEBOUNCE_MS = 5_000;
const RECOVERABLE_WINDOW_STATES = new Set<ProPresenterWindowState>([
  'background',
  'minimized'
]);

let sessionState: SessionState = { status: 'idle' };
let watcher: ReturnType<typeof setTimeout> | undefined;
let watchedWindowId: number | undefined;
let polling = false;
let sessionStartedAt = 0;
let observedRunning = false;
let pendingWindowState: ProPresenterWindowState | undefined;
let pendingWindowStateSince = 0;
let sessionGeneration = 0;
const sessionListeners = new Set<(state: SessionState) => void>();

function currentWindow(fallback?: BrowserWindow | null): BrowserWindow | null {
  if (watchedWindowId !== undefined) {
    const watchedWindow = BrowserWindow.fromId(watchedWindowId);
    if (watchedWindow && !watchedWindow.isDestroyed()) {
      return watchedWindow;
    }
  }

  if (fallback && !fallback.isDestroyed()) {
    return fallback;
  }

  return BrowserWindow.getAllWindows()[0] ?? null;
}

function emitSessionState(window?: BrowserWindow | null): void {
  const state = getSessionState();
  const target = currentWindow(window);
  if (target && !target.isDestroyed()) {
    target.webContents.send('launcher:session-state', state);
  }

  for (const listener of sessionListeners) {
    try {
      listener(state);
    } catch (error) {
      void logError('Session state listener failed', error);
    }
  }
}

function stopWatcher(): void {
  if (watcher) {
    clearTimeout(watcher);
    watcher = undefined;
  }
  polling = false;
  observedRunning = false;
  resetWindowStateObservation();
}

function resetWindowStateObservation(): void {
  pendingWindowState = undefined;
  pendingWindowStateSince = 0;
}

export function getSessionState(): SessionState {
  return { ...sessionState };
}

export function onSessionChange(listener: (state: SessionState) => void): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

export function clearSessionState(): SessionState {
  stopWatcher();
  sessionGeneration += 1;
  sessionState = { status: 'idle' };
  emitSessionState();
  return getSessionState();
}

export function beginProPresenterSession(
  window: BrowserWindow | null,
  workspace: { id: string; name?: string }
): SessionState {
  stopWatcher();

  watchedWindowId = window?.id;
  sessionState = {
    status: 'running',
    lastWorkspaceId: workspace.id,
    lastWorkspaceName: workspace.name
  };
  sessionStartedAt = Date.now();
  observedRunning = false;
  sessionGeneration += 1;
  const generation = sessionGeneration;
  emitSessionState(window);

  schedulePoll(window, generation, 0);

  void logInfo('Started ProPresenter session watcher', {
    workspaceId: workspace.id,
    workspaceName: workspace.name
  });

  return getSessionState();
}

function schedulePoll(
  window: BrowserWindow | null,
  generation: number,
  delayMs = POLL_INTERVAL_MS
): void {
  watcher = setTimeout(() => {
    void pollProPresenter(window, generation);
  }, delayMs);
}

async function pollProPresenter(
  window: BrowserWindow | null,
  generation: number
): Promise<void> {
  if (polling || sessionState.status !== 'running' || generation !== sessionGeneration) {
    return;
  }

  polling = true;
  let shouldContinue = true;
  try {
    const running = await isProPresenterRunning();
    if (running) {
      observedRunning = true;
      await updateProPresenterWindowState(window);
    } else if (observedRunning || Date.now() - sessionStartedAt >= LAUNCH_GRACE_MS) {
      shouldContinue = false;
      endProPresenterSession(window);
    }
  } catch (error) {
    await logError('Could not poll ProPresenter session state', error);
  } finally {
    polling = false;
    if (shouldContinue && sessionState.status === 'running' && generation === sessionGeneration) {
      schedulePoll(window, generation);
    }
  }
}

async function updateProPresenterWindowState(window: BrowserWindow | null): Promise<void> {
  const nextWindowState = await getProPresenterWindowState();
  const now = Date.now();

  if (pendingWindowState !== nextWindowState) {
    pendingWindowState = nextWindowState;
    pendingWindowStateSince = now;
    return;
  }

  if (now - pendingWindowStateSince < WINDOW_STATE_DEBOUNCE_MS) {
    return;
  }

  if (sessionState.proPresenterWindow === nextWindowState) {
    return;
  }

  const previousWindowState = sessionState.proPresenterWindow;
  sessionState = {
    ...sessionState,
    proPresenterWindow: nextWindowState
  };
  emitSessionState(window);

  if (
    RECOVERABLE_WINDOW_STATES.has(nextWindowState) &&
    !RECOVERABLE_WINDOW_STATES.has(previousWindowState as ProPresenterWindowState)
  ) {
    revealSessionWindowInactive(window);
    await logInfo('ProPresenter window state needs operator attention', {
      proPresenterWindow: nextWindowState
    });
  }
}

function revealSessionWindowInactive(window: BrowserWindow | null): void {
  const target = currentWindow(window);
  if (!target || target.isDestroyed()) {
    return;
  }

  if (target.isMinimized()) {
    target.restore();
  }
  target.showInactive();
  app.dock?.show();
}

function endProPresenterSession(window: BrowserWindow | null): void {
  const previous = getSessionState();
  stopWatcher();
  sessionState = {
    status: 'ended',
    lastWorkspaceId: previous.lastWorkspaceId,
    lastWorkspaceName: previous.lastWorkspaceName,
    endedAt: new Date().toISOString()
  };

  const target = currentWindow(window);
  if (target && !target.isDestroyed()) {
    if (target.isMinimized()) {
      target.restore();
    }
    target.show();
    target.focus();
    app.focus({ steal: true });
  }
  emitSessionState(target);

  void logInfo('ProPresenter session ended', sessionState);
}
