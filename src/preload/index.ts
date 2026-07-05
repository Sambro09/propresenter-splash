import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  LauncherApi,
  LauncherState,
  LaunchResult,
  LaunchWorkspaceOptions,
  MenuAction,
  SessionState,
  WorkspaceOrderDirection,
  WorkspaceOverridePatch
} from '../shared/types';

const api: LauncherApi = {
  getState: () => ipcRenderer.invoke('launcher:get-state') as Promise<LauncherState>,
  rescan: () => ipcRenderer.invoke('launcher:get-state') as Promise<LauncherState>,
  chooseWorkspacesFolder: () =>
    ipcRenderer.invoke('launcher:choose-workspaces-folder') as Promise<LauncherState>,
  copySupportDetails: (details: string) =>
    ipcRenderer.invoke('launcher:copy-support-details', details) as Promise<void>,
  openProPresenterDownload: () =>
    ipcRenderer.invoke('launcher:open-propresenter-download') as Promise<void>,
  focusProPresenter: () =>
    ipcRenderer.invoke('launcher:focus-propresenter') as Promise<void>,
  launchWorkspace: (workspaceId: string, options?: LaunchWorkspaceOptions) =>
    ipcRenderer.invoke('launcher:launch-workspace', workspaceId, options) as Promise<LaunchResult>,
  updateWorkspace: (key: string, patch: WorkspaceOverridePatch) =>
    ipcRenderer.invoke('launcher:update-workspace', key, patch) as Promise<LauncherState>,
  resetWorkspace: (key: string) =>
    ipcRenderer.invoke('launcher:reset-workspace', key) as Promise<LauncherState>,
  chooseDirectory: () =>
    ipcRenderer.invoke('launcher:choose-directory') as Promise<string | null>,
  setLaunchAtLogin: (value: boolean) =>
    ipcRenderer.invoke('launcher:set-launch-at-login', value) as Promise<LauncherState>,
  setOperatorMode: (value: boolean) =>
    ipcRenderer.invoke('launcher:set-operator-mode', value) as Promise<LauncherState>,
  setWorkspacePinned: (key: string, pinned: boolean) =>
    ipcRenderer.invoke('launcher:set-workspace-pinned', key, pinned) as Promise<LauncherState>,
  moveWorkspace: (key: string, direction: WorkspaceOrderDirection) =>
    ipcRenderer.invoke('launcher:move-workspace', key, direction) as Promise<LauncherState>,
  clearSession: () =>
    ipcRenderer.invoke('launcher:clear-session') as Promise<SessionState>,
  reopenLastWorkspace: () =>
    ipcRenderer.invoke('launcher:reopen-last-workspace') as Promise<LaunchResult>,
  requestLogout: () =>
    ipcRenderer.invoke('launcher:request-logout') as Promise<void>,
  setEditMode: (value: boolean) =>
    ipcRenderer.invoke('launcher:set-edit-mode', value) as Promise<boolean>,
  onSessionState: (handler: (state: SessionState) => void) => {
    const listener = (_event: IpcRendererEvent, state: SessionState): void => handler(state);
    ipcRenderer.on('launcher:session-state', listener);
    return () => ipcRenderer.removeListener('launcher:session-state', listener);
  },
  onEditMode: (handler: (value: boolean) => void) => {
    const listener = (_event: IpcRendererEvent, value: boolean): void => handler(value);
    ipcRenderer.on('launcher:edit-mode', listener);
    return () => ipcRenderer.removeListener('launcher:edit-mode', listener);
  },
  onMenuAction: (handler: (action: MenuAction) => void) => {
    const listener = (_event: IpcRendererEvent, action: MenuAction): void => handler(action);
    ipcRenderer.on('launcher:menu-action', listener);
    return () => ipcRenderer.removeListener('launcher:menu-action', listener);
  }
};

contextBridge.exposeInMainWorld('launcher', api);
