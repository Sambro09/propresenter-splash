import {
  app,
  BrowserWindow,
  Menu,
  type MenuItemConstructorOptions
} from 'electron';
import type { MenuAction } from '../shared/types';

const EDIT_MODE_MENU_ID = 'workspaces-edit-mode';

let editMode = false;

function targetWindow(): BrowserWindow | null {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

function sendMenuAction(action: MenuAction): void {
  targetWindow()?.webContents.send('launcher:menu-action', action);
}

function applyEditModeCheckbox(value: boolean): void {
  const item = Menu.getApplicationMenu()?.getMenuItemById(EDIT_MODE_MENU_ID);
  if (item) {
    item.checked = value;
  }
}

/**
 * Edit/admin mode lives in the main process so the menu-bar checkbox and the
 * in-window banner can never drift out of sync. Set `notifyRenderer` when the
 * change originates from the menu so the window updates its UI.
 */
export function setEditMode(value: boolean, { notifyRenderer }: { notifyRenderer: boolean }): boolean {
  editMode = value;
  applyEditModeCheckbox(value);
  if (notifyRenderer) {
    targetWindow()?.webContents.send('launcher:edit-mode', value);
  }
  return editMode;
}

export function getEditMode(): boolean {
  return editMode;
}

export function createApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      role: 'appMenu'
    },
    {
      label: 'Workspaces',
      submenu: [
        {
          label: 'Rescan Workspaces',
          accelerator: 'CmdOrCtrl+R',
          click: () => sendMenuAction('rescan')
        },
        {
          label: 'Choose Workspace Folder…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendMenuAction('choose-folder')
        },
        { type: 'separator' },
        {
          id: EDIT_MODE_MENU_ID,
          label: 'Edit Mode',
          type: 'checkbox',
          checked: editMode,
          accelerator: 'CmdOrCtrl+E',
          click: (menuItem) => setEditMode(menuItem.checked, { notifyRenderer: true })
        }
      ]
    },
    {
      role: 'editMenu'
    },
    {
      role: 'windowMenu'
    }
  ];

  if (process.platform !== 'darwin') {
    // Drop the macOS-only application menu on other platforms.
    template.shift();
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  applyEditModeCheckbox(editMode);

  app.on('browser-window-focus', () => applyEditModeCheckbox(editMode));
}
