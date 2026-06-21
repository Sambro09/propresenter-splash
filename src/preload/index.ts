import { contextBridge, ipcRenderer } from 'electron';
import type {
  LauncherApi,
  LauncherState,
  LaunchResult,
  LaunchWorkspaceOptions
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
  launchWorkspace: (workspaceId: string, options?: LaunchWorkspaceOptions) =>
    ipcRenderer.invoke('launcher:launch-workspace', workspaceId, options) as Promise<LaunchResult>
};

contextBridge.exposeInMainWorld('launcher', api);
