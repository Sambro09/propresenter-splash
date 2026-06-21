export interface Workspace {
  id: string;
  name: string;
  path: string;
  isActive: boolean;
  source: 'registry' | 'folder';
}

export interface ProPresenterStatus {
  installed: boolean;
  running: boolean;
  appPath?: string;
  error?: string;
}

export interface LauncherState {
  workspaceRoot: string;
  activeWorkspaceId?: string;
  activeWorkspaceName?: string;
  workspaces: Workspace[];
  proPresenter: ProPresenterStatus;
  errors: string[];
}

export interface LaunchResult {
  ok: boolean;
  message: string;
  code?:
    | 'PROPRESENTER_RUNNING'
    | 'PROPRESENTER_NOT_FOUND'
    | 'WORKSPACE_NOT_FOUND'
    | 'PREFERENCE_WRITE_FAILED'
    | 'LAUNCH_FAILED';
}

export interface LauncherApi {
  getState: () => Promise<LauncherState>;
  rescan: () => Promise<LauncherState>;
  launchWorkspace: (workspaceId: string) => Promise<LaunchResult>;
}
