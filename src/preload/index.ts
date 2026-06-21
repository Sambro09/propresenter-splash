import { contextBridge, ipcRenderer } from 'electron';
import type { LauncherApi, LauncherState, LaunchResult } from '../shared/types';

const api: LauncherApi = {
  getState: () => ipcRenderer.invoke('launcher:get-state') as Promise<LauncherState>,
  rescan: () => ipcRenderer.invoke('launcher:get-state') as Promise<LauncherState>,
  launchWorkspace: (workspaceId: string) =>
    ipcRenderer.invoke('launcher:launch-workspace', workspaceId) as Promise<LaunchResult>
};

contextBridge.exposeInMainWorld('launcher', api);
