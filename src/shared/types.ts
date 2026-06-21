export interface Workspace {
  /** Effective launch target path (an override may repoint this away from `key`). */
  id: string;
  /** Stable identity for overrides — the originally scanned folder path. */
  key: string;
  name: string;
  path: string;
  isActive: boolean;
  source: 'registry' | 'folder';
  /** True when an admin override changes this workspace's name and/or path. */
  isCustomized: boolean;
}

export interface WorkspaceOverridePatch {
  name?: string;
  path?: string;
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

export type MenuAction = 'rescan' | 'choose-folder';

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
  /** Apply a name/path override to a workspace (admin/edit mode). */
  updateWorkspace: (key: string, patch: WorkspaceOverridePatch) => Promise<LauncherState>;
  /** Clear any override for a workspace, reverting to auto-detected values. */
  resetWorkspace: (key: string) => Promise<LauncherState>;
  /** Prompt for a folder and return the chosen path without persisting it. */
  chooseDirectory: () => Promise<string | null>;
  /** Set edit/admin mode; keeps the native menu checkbox in sync. */
  setEditMode: (value: boolean) => Promise<boolean>;
  /** Subscribe to edit-mode changes driven from the menu bar. Returns an unsubscribe fn. */
  onEditMode: (handler: (value: boolean) => void) => () => void;
  /** Subscribe to menu-bar actions (rescan / choose folder / toggle edit). Returns an unsubscribe fn. */
  onMenuAction: (handler: (action: MenuAction) => void) => () => void;
}
