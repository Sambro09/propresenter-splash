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
  isCustomWorkspaceRoot: boolean;
  supportLogPath: string;
  activeWorkspaceId?: string;
  activeWorkspaceName?: string;
  workspaces: Workspace[];
  proPresenter: ProPresenterStatus;
  errors: string[];
}

export interface LaunchWorkspaceOptions {
  confirmQuit?: boolean;
}

export interface LaunchResult {
  ok: boolean;
  message: string;
  code?:
    | 'CONFIRM_QUIT_REQUIRED'
    | 'PROPRESENTER_NOT_FOUND'
    | 'WORKSPACE_NOT_FOUND'
    | 'PREFERENCE_WRITE_FAILED'
    | 'QUIT_FAILED'
    | 'FOCUS_FAILED'
    | 'LAUNCH_FAILED';
  requiresConfirmation?: boolean;
}

export interface LauncherApi {
  getState: () => Promise<LauncherState>;
  rescan: () => Promise<LauncherState>;
  chooseWorkspacesFolder: () => Promise<LauncherState>;
  copySupportDetails: (details: string) => Promise<void>;
  openProPresenterDownload: () => Promise<void>;
  launchWorkspace: (
    workspaceId: string,
    options?: LaunchWorkspaceOptions
  ) => Promise<LaunchResult>;
}
