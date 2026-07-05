import {
  app,
  dialog,
  Menu,
  nativeImage,
  Tray,
  type MessageBoxOptions,
  type MessageBoxReturnValue,
  type MenuItemConstructorOptions,
  type NativeImage
} from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { LauncherState, Workspace } from '../shared/types';
import { getLauncherState } from './launcherService';
import { logError } from './logger';
import {
  focusProPresenter,
  locateProPresenter,
  quitProPresenterAndWait
} from './proPresenterController';
import { getMainWindow } from './windowManager';
import { runWorkspaceLaunch } from './workspaceLauncher';

export type UpdateTrayMenu = (state?: LauncherState) => void;

let tray: Tray | undefined;
let updateSequence = 0;

function resolveTrayIconPath(): string {
  const candidates = [
    join(process.resourcesPath, 'trayTemplate.png'),
    join(app.getAppPath(), 'build', 'trayTemplate.png'),
    join(app.getAppPath(), 'build', 'icon.png')
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[1];
}

function createTrayIcon(): NativeImage {
  const icon = nativeImage.createFromPath(resolveTrayIconPath());
  icon.setTemplateImage(true);
  return icon;
}

function workspaceName(workspace: Pick<Workspace, 'name' | 'path'>): string {
  return workspace.name.trim() || workspace.path;
}

function statusLabel(state: LauncherState): string {
  if (state.session.status === 'running') {
    return `Running: ${state.session.lastWorkspaceName ?? state.activeWorkspaceName ?? 'workspace'}`;
  }

  if (state.proPresenter.running) {
    return state.activeWorkspaceName
      ? `Running: ${state.activeWorkspaceName}`
      : 'ProPresenter running';
  }

  if (state.session.status === 'ended') {
    return 'ProPresenter closed';
  }

  return 'No workspace open';
}

async function showMessageBox(options: MessageBoxOptions): Promise<MessageBoxReturnValue> {
  const window = getMainWindow();
  if (window && !window.isDestroyed() && window.isVisible()) {
    return dialog.showMessageBox(window, options);
  }

  return dialog.showMessageBox(options);
}

async function confirmWorkspaceSwitch(workspace: Workspace, message: string): Promise<boolean> {
  const result = await showMessageBox({
    type: 'warning',
    buttons: ['Cancel', 'Switch Workspace'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: 'Switch workspace?',
    message: `Switch to "${workspaceName(workspace)}"?`,
    detail: `${message}\n\nProPresenter will be asked to close before the selected workspace opens.`
  });

  return result.response === 1;
}

async function confirmQuitProPresenter(): Promise<boolean> {
  const result = await showMessageBox({
    type: 'warning',
    buttons: ['Cancel', 'Quit ProPresenter'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: 'Quit ProPresenter?',
    message: 'Quit ProPresenter?',
    detail: 'Only continue if the current service is finished or the operator has saved any changes.'
  });

  return result.response === 1;
}

async function showTrayError(title: string, message: string): Promise<void> {
  await showMessageBox({
    type: 'error',
    buttons: ['OK'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title,
    message: title,
    detail: message
  });
}

async function launchWorkspaceFromTray(workspace: Workspace): Promise<void> {
  try {
    let result = await runWorkspaceLaunch(workspace.id);

    if (result.requiresConfirmation) {
      if (!(await confirmWorkspaceSwitch(workspace, result.message))) {
        updateTrayMenu();
        return;
      }
      result = await runWorkspaceLaunch(workspace.id, { confirmQuit: true });
    }

    if (!result.ok) {
      await showTrayError('Workspace could not be opened', result.message);
    }
  } catch (error) {
    await logError('Tray workspace launch failed', error);
    await showTrayError('Workspace could not be opened', formatError(error));
  } finally {
    updateTrayMenu();
  }
}

async function focusRunningProPresenter(): Promise<void> {
  try {
    const appPath = (await locateProPresenter()) ?? (await getLauncherState()).proPresenter.appPath;
    if (!appPath) {
      await showTrayError('ProPresenter could not be found', 'The ProPresenter app could not be located on this Mac.');
      return;
    }

    await focusProPresenter(appPath);
  } catch (error) {
    await logError('Tray focus ProPresenter failed', error);
    await showTrayError('ProPresenter could not be focused', formatError(error));
  } finally {
    updateTrayMenu();
  }
}

async function quitProPresenterFromTray(): Promise<void> {
  try {
    if (!(await confirmQuitProPresenter())) {
      updateTrayMenu();
      return;
    }

    await quitProPresenterAndWait();
  } catch (error) {
    await logError('Tray quit ProPresenter failed', error);
    await showTrayError('ProPresenter could not be quit', formatError(error));
  } finally {
    updateTrayMenu();
  }
}

function workspaceMenuItems(state: LauncherState): MenuItemConstructorOptions[] {
  if (state.workspaces.length === 0) {
    return [
      {
        label: 'No workspaces found',
        enabled: false
      }
    ];
  }

  return state.workspaces.map((workspace) => ({
    label: workspaceName(workspace),
    type: 'checkbox',
    checked: workspace.isActive,
    click: () => {
      void launchWorkspaceFromTray(workspace);
    }
  }));
}

function buildMenu(
  state: LauncherState,
  showSplash: () => void | Promise<void>
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [
    {
      label: statusLabel(state),
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Switch Workspace...',
      enabled: state.workspaces.length > 0,
      submenu: workspaceMenuItems(state)
    },
    {
      label: 'Show ProPresenter Splash',
      click: () => {
        void showSplash();
      }
    }
  ];

  if (state.proPresenter.running) {
    items.push(
      {
        label: 'Bring ProPresenter to Front',
        click: () => {
          void focusRunningProPresenter();
        }
      },
      {
        label: 'Quit ProPresenter',
        click: () => {
          void quitProPresenterFromTray();
        }
      }
    );
  }

  items.push(
    { type: 'separator' },
    {
      label: 'Quit ProPresenter Splash',
      click: () => app.quit()
    }
  );

  return items;
}

function setTrayMenu(template: MenuItemConstructorOptions[]): void {
  tray?.setContextMenu(Menu.buildFromTemplate(template));
}

function setLoadingMenu(): void {
  setTrayMenu([
    {
      label: 'Loading workspaces...',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Quit ProPresenter Splash',
      click: () => app.quit()
    }
  ]);
}

function setErrorMenu(showSplash: () => void | Promise<void>, message: string): void {
  setTrayMenu([
    {
      label: 'Could not load launcher state',
      enabled: false
    },
    {
      label: 'Show ProPresenter Splash',
      click: () => {
        void showSplash();
      }
    },
    {
      label: 'Details...',
      click: () => {
        void showTrayError('Could not load launcher state', message);
      }
    },
    { type: 'separator' },
    {
      label: 'Quit ProPresenter Splash',
      click: () => app.quit()
    }
  ]);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let updateTrayMenu: UpdateTrayMenu = () => {};

export function createTray({
  showSplash
}: {
  showSplash: () => void | Promise<void>;
}): UpdateTrayMenu {
  if (!tray) {
    tray = new Tray(createTrayIcon());
    tray.setToolTip('ProPresenter Splash');
  }

  updateTrayMenu = (state?: LauncherState): void => {
    const sequence = ++updateSequence;

    if (state) {
      setTrayMenu(buildMenu(state, showSplash));
      return;
    }

    setLoadingMenu();
    void getLauncherState()
      .then((nextState) => {
        if (sequence === updateSequence) {
          setTrayMenu(buildMenu(nextState, showSplash));
        }
      })
      .catch((error: unknown) => {
        if (sequence === updateSequence) {
          void logError('Could not update tray menu', error);
          setErrorMenu(showSplash, formatError(error));
        }
      });
  };

  updateTrayMenu();
  return updateTrayMenu;
}
