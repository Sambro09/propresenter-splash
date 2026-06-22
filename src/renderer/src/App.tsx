import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CaretRight,
  Check,
  CheckCircle,
  CircleNotch,
  Clipboard,
  DownloadSimple,
  FolderOpen,
  Gear,
  IconContext,
  MonitorPlay,
  PencilSimple,
  Stack,
  Warning,
  WarningCircle
} from '@phosphor-icons/react';
import type {
  LauncherState,
  LaunchWorkspaceOptions,
  Workspace,
  WorkspaceOverridePatch
} from '../../shared/types';

type LoadStatus = 'loading' | 'ready' | 'error';
type LaunchingState = {
  workspaceId: string;
  label: string;
};

// Phosphor regular weight everywhere, matching ProPresenter's line-weight UI chrome.
const ICON_DEFAULTS = { weight: 'regular' as const, size: 18 };

function App(): JSX.Element {
  const [launcherState, setLauncherState] = useState<LauncherState | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [launching, setLaunching] = useState<LaunchingState | null>(null);
  const [confirmingWorkspace, setConfirmingWorkspace] = useState<Workspace | null>(null);
  const [retryWorkspace, setRetryWorkspace] = useState<Workspace | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    setMessage(null);
    setCopyStatus(null);
    setLoadStatus('loading');

    try {
      const nextState = await window.launcher.getState();
      setLauncherState(nextState);
      setLoadStatus('ready');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Could not load launcher state. ${detail}`);
      setLoadStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  async function handleRefresh(): Promise<void> {
    setRefreshing(true);
    setMessage(null);
    setCopyStatus(null);
    setRetryWorkspace(null);

    try {
      const nextState = await window.launcher.rescan();
      setLauncherState(nextState);
      setLoadStatus('ready');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Could not rescan workspaces. ${detail}`);
    } finally {
      setRefreshing(false);
    }
  }

  async function handleChooseFolder(): Promise<void> {
    setRefreshing(true);
    setMessage(null);
    setCopyStatus(null);
    setRetryWorkspace(null);

    try {
      const nextState = await window.launcher.chooseWorkspacesFolder();
      setLauncherState(nextState);
      setLoadStatus('ready');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Could not choose a workspace folder. ${detail}`);
    } finally {
      setRefreshing(false);
    }
  }

  // Keep menu-bar actions pointed at the latest handlers without re-subscribing.
  const menuHandlers = useRef({ rescan: handleRefresh, chooseFolder: handleChooseFolder });
  menuHandlers.current = { rescan: handleRefresh, chooseFolder: handleChooseFolder };

  useEffect(() => {
    const offMenu = window.launcher.onMenuAction((action) => {
      if (action === 'rescan') {
        void menuHandlers.current.rescan();
      } else if (action === 'choose-folder') {
        void menuHandlers.current.chooseFolder();
      }
    });
    const offEdit = window.launcher.onEditMode((value) => setEditMode(value));
    return () => {
      offMenu();
      offEdit();
    };
  }, []);

  const supportDetails = useMemo(
    () => buildSupportDetails(launcherState, message),
    [launcherState, message]
  );

  async function handleCopyDetails(): Promise<void> {
    try {
      await window.launcher.copySupportDetails(supportDetails);
      setCopyStatus('Support details copied.');
      window.setTimeout(() => setCopyStatus(null), 2_500);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Could not copy support details. ${detail}`);
    }
  }

  async function handleOpenDownload(): Promise<void> {
    await window.launcher.openProPresenterDownload();
  }

  async function handleExitEditMode(): Promise<void> {
    const value = await window.launcher.setEditMode(false);
    setEditMode(value);
    setEditingWorkspace(null);
  }

  async function handleSaveWorkspace(
    workspace: Workspace,
    patch: WorkspaceOverridePatch
  ): Promise<void> {
    setMessage(null);
    setCopyStatus(null);
    try {
      const nextState = await window.launcher.updateWorkspace(workspace.key, patch);
      setLauncherState(nextState);
      setEditingWorkspace(null);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Could not save workspace changes. ${detail}`);
    }
  }

  async function handleResetWorkspace(workspace: Workspace): Promise<void> {
    setMessage(null);
    setCopyStatus(null);
    try {
      const nextState = await window.launcher.resetWorkspace(workspace.key);
      setLauncherState(nextState);
      setEditingWorkspace(null);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Could not reset workspace. ${detail}`);
    }
  }

  async function handleLaunch(
    workspace: Workspace,
    options: LaunchWorkspaceOptions = {}
  ): Promise<void> {
    const proPresenterIsRunning = launcherState?.proPresenter.running === true;
    setLaunching({
      workspaceId: workspace.id,
      label:
        options.confirmQuit && proPresenterIsRunning
          ? 'Quitting ProPresenter…'
          : `Opening “${workspace.name}”…`
    });
    setMessage(null);
    setCopyStatus(null);
    setRetryWorkspace(null);

    try {
      const result = await window.launcher.launchWorkspace(workspace.id, options);
      if (!result.ok) {
        if (result.requiresConfirmation) {
          setConfirmingWorkspace(workspace);
          return;
        }

        setMessage(result.message);
        setRetryWorkspace(result.code === 'QUIT_FAILED' ? workspace : null);
        const nextState = await window.launcher.getState();
        setLauncherState(nextState);
        return;
      }

      setMessage(result.message);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Could not open ProPresenter. ${detail}`);
    } finally {
      setLaunching(null);
    }
  }

  async function handleConfirmSwitch(): Promise<void> {
    if (!confirmingWorkspace) {
      return;
    }

    const workspace = confirmingWorkspace;
    setConfirmingWorkspace(null);
    await handleLaunch(workspace, { confirmQuit: true });
  }

  return (
    <IconContext.Provider value={ICON_DEFAULTS}>
      <div className="app">
        <header className="toolbar">
          <div className="toolbarTitle">
            <span className="toolbarText">
              <span className="toolbarHeading">Workspaces</span>
            </span>
          </div>
        </header>

        {editMode ? (
          <div className="editBar">
            <span className="editBarLabel">
              <PencilSimple size={15} weight="fill" />
              Edit Mode
            </span>
            <span className="editBarHint">Rename or repoint workspaces</span>
            <button className="editBarDone" type="button" onClick={() => void handleExitEditMode()}>
              Done
            </button>
          </div>
        ) : null}

        <div className="alerts">
          {launcherState && !launcherState.proPresenter.installed ? (
            <div className="banner warn" role="status">
              <WarningCircle size={18} weight="fill" />
              <span>ProPresenter isn’t installed on this Mac.</span>
              <button className="bannerBtn" type="button" onClick={() => void handleOpenDownload()}>
                <DownloadSimple size={15} />
                Download
              </button>
            </div>
          ) : null}

          {message ? (
            <div className="banner error" role="alert">
              <WarningCircle size={18} weight="fill" />
              <span>{message}</span>
              {retryWorkspace ? (
                <button
                  className="bannerBtn"
                  type="button"
                  onClick={() => void handleLaunch(retryWorkspace, { confirmQuit: true })}
                >
                  Retry
                </button>
              ) : null}
              <button className="bannerBtn" type="button" onClick={handleCopyDetails}>
                <Clipboard size={15} />
                Copy details
              </button>
            </div>
          ) : null}

          {copyStatus ? (
            <div className="banner success" role="status">
              <CheckCircle size={18} weight="fill" />
              <span>{copyStatus}</span>
            </div>
          ) : null}
        </div>

        <main className="library" aria-live="polite">
          {loadStatus === 'loading' ? <LoadingState /> : null}
          {loadStatus === 'error' ? <ErrorState /> : null}
          {loadStatus === 'ready' && launcherState ? (
            <WorkspaceLibrary
              launcherState={launcherState}
              launching={launching}
              editMode={editMode}
              onLaunch={handleLaunch}
              onEdit={setEditingWorkspace}
              onChooseFolder={handleChooseFolder}
              onCopyDetails={handleCopyDetails}
            />
          ) : null}
        </main>

        {confirmingWorkspace ? (
          <ConfirmDialog
            workspace={confirmingWorkspace}
            busy={launching?.workspaceId === confirmingWorkspace.id}
            onCancel={() => setConfirmingWorkspace(null)}
            onConfirm={handleConfirmSwitch}
          />
        ) : null}

        {editingWorkspace ? (
          <WorkspaceEditor
            workspace={editingWorkspace}
            onCancel={() => setEditingWorkspace(null)}
            onSave={handleSaveWorkspace}
            onReset={handleResetWorkspace}
          />
        ) : null}
      </div>
    </IconContext.Provider>
  );
}

function WorkspaceLibrary({
  launcherState,
  launching,
  editMode,
  onLaunch,
  onEdit,
  onChooseFolder,
  onCopyDetails
}: {
  launcherState: LauncherState;
  launching: LaunchingState | null;
  editMode: boolean;
  onLaunch: (workspace: Workspace) => Promise<void>;
  onEdit: (workspace: Workspace) => void;
  onChooseFolder: () => Promise<void>;
  onCopyDetails: () => Promise<void>;
}): JSX.Element {
  if (launcherState.workspaces.length === 0) {
    return (
      <div className="placeholder">
        <span className="placeholderGlyph" aria-hidden="true">
          <Stack size={26} />
        </span>
        <h2>No workspaces found</h2>
        <p>{launcherState.workspaceRoot}</p>
        <button className="primaryBtn" type="button" onClick={() => void onChooseFolder()}>
          <FolderOpen size={17} />
          Choose Folder
        </button>
      </div>
    );
  }

  const disabled = Boolean(launching) || !launcherState.proPresenter.installed;

  return (
    <>
      <div className="list">
        {launcherState.workspaces.map((workspace) => {
          const isLaunching = launching?.workspaceId === workspace.id;
          return (
            <div className="wsRowWrap" key={workspace.key}>
              <button
                type="button"
                className={`wsRow${workspace.isActive ? ' active' : ''}${editMode ? ' editing' : ''}`}
                onClick={() => void onLaunch(workspace)}
                disabled={disabled}
              >
                <span className="wsGlyph" aria-hidden="true">
                  {isLaunching ? (
                    <CircleNotch size={22} className="spin" />
                  ) : (
                    <MonitorPlay size={22} weight="regular" />
                  )}
                </span>
                <span className="wsText">
                  <span className="wsName">{workspace.name}</span>
                  {isLaunching ? (
                    <span className="wsPath">{launching.label}</span>
                  ) : editMode ? (
                    <span className="wsPath">{workspace.path}</span>
                  ) : null}
                </span>
                {workspace.isActive ? (
                  <span className="wsTrail wsCheck" aria-hidden="true">
                    <Check size={19} weight="bold" />
                  </span>
                ) : !editMode ? (
                  <span className="wsTrail" aria-hidden="true">
                    <CaretRight size={18} />
                  </span>
                ) : null}
              </button>

              {editMode ? (
                <button
                  className="wsGear"
                  type="button"
                  title={`Edit “${workspace.name}”`}
                  aria-label={`Edit ${workspace.name}`}
                  onClick={() => onEdit(workspace)}
                >
                  <Gear size={18} />
                </button>
              ) : null}
            </div>
          );
        })}

        {launcherState.errors.length > 0 ? (
          <div className="detailsBox">
            <div className="detailsHeader">
              <strong>Details</strong>
              <button className="bannerBtn" type="button" onClick={() => void onCopyDetails()}>
                <Clipboard size={15} />
                Copy
              </button>
            </div>
            {launcherState.errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}

function WorkspaceEditor({
  workspace,
  onCancel,
  onSave,
  onReset
}: {
  workspace: Workspace;
  onCancel: () => void;
  onSave: (workspace: Workspace, patch: WorkspaceOverridePatch) => Promise<void>;
  onReset: (workspace: Workspace) => Promise<void>;
}): JSX.Element {
  const [name, setName] = useState(workspace.name);
  const [path, setPath] = useState(workspace.path);
  const [busy, setBusy] = useState(false);

  async function handleChooseFolder(): Promise<void> {
    const picked = await window.launcher.chooseDirectory();
    if (picked) {
      setPath(picked);
    }
  }

  async function handleSave(): Promise<void> {
    setBusy(true);
    // Empty fields (or a path left at the detected folder) clear that override.
    await onSave(workspace, {
      name: name.trim(),
      path: path.trim() && path.trim() !== workspace.key ? path.trim() : ''
    });
    setBusy(false);
  }

  async function handleReset(): Promise<void> {
    setBusy(true);
    await onReset(workspace);
    setBusy(false);
  }

  return (
    <div className="modalBackdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <span className="modalIcon edit" aria-hidden="true">
          <Gear size={24} weight="fill" />
        </span>
        <h2 id="editor-title">Edit Workspace</h2>

        <label className="field">
          <span className="fieldLabel">Name</span>
          <input
            className="textInput"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Workspace name"
            autoFocus
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span className="fieldLabel">Folder</span>
          <div className="pathRow">
            <input
              className="textInput"
              type="text"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              placeholder="/path/to/workspace"
              spellCheck={false}
            />
            <button className="chooseBtn" type="button" onClick={() => void handleChooseFolder()}>
              <FolderOpen size={16} />
              Choose…
            </button>
          </div>
        </label>

        <div className="modalActions">
          {workspace.isCustomized ? (
            <button
              className="resetLink"
              type="button"
              onClick={() => void handleReset()}
              disabled={busy}
            >
              Reset to detected
            </button>
          ) : null}
          <span className="modalSpacer" />
          <button className="btn btnGhost" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn btnPrimary"
            type="button"
            onClick={() => void handleSave()}
            disabled={busy || !name.trim()}
          >
            {busy ? <CircleNotch size={16} className="spin" /> : null}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDialog({
  workspace,
  busy,
  onCancel,
  onConfirm
}: {
  workspace: Workspace;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}): JSX.Element {
  return (
    <div className="modalBackdrop">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <span className="modalIcon" aria-hidden="true">
          <Warning size={24} weight="fill" />
        </span>
        <h2 id="confirm-title">Switch Workspace?</h2>
        <p>
          Save any work first. The launcher will close ProPresenter and reopen it with{' '}
          <b>{workspace.name}</b>.
        </p>
        <div className="modalActions">
          <span className="modalSpacer" />
          <button className="btn btnGhost" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn btnDanger"
            type="button"
            onClick={() => void onConfirm()}
            disabled={busy}
          >
            {busy ? <CircleNotch size={16} className="spin" /> : null}
            Switch Workspace
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingState(): JSX.Element {
  return (
    <div className="placeholder">
      <CircleNotch size={30} className="spin" />
      <span>Scanning workspaces…</span>
    </div>
  );
}

function ErrorState(): JSX.Element {
  return (
    <div className="placeholder">
      <span className="placeholderGlyph" aria-hidden="true">
        <WarningCircle size={26} />
      </span>
      <h2>Launcher unavailable</h2>
      <p>The launcher could not start. Try reopening it.</p>
    </div>
  );
}

function buildSupportDetails(state: LauncherState | null, message: string | null): string {
  const lines = [
    'ProPresenter Workspace Launcher support details',
    `Generated: ${new Date().toISOString()}`,
    `Message: ${message ?? 'none'}`,
    `Workspace root: ${state?.workspaceRoot ?? 'unknown'}`,
    `Custom workspace root: ${state?.isCustomWorkspaceRoot ? 'yes' : 'no'}`,
    `Active workspace: ${state?.activeWorkspaceName ?? state?.activeWorkspaceId ?? 'unknown'}`,
    `ProPresenter installed: ${state?.proPresenter.installed ? 'yes' : 'no'}`,
    `ProPresenter running: ${state?.proPresenter.running ? 'yes' : 'no'}`,
    `ProPresenter path: ${state?.proPresenter.appPath ?? 'unknown'}`,
    `Support log: ${state?.supportLogPath ?? 'unknown'}`,
    '',
    'Errors:',
    ...(state?.errors.length ? state.errors.map((error) => `- ${error}`) : ['- none']),
    '',
    'Workspaces:',
    ...(state?.workspaces.length
      ? state.workspaces.map(
          (workspace) =>
            `- ${workspace.isActive ? '[active] ' : ''}${workspace.name}${workspace.isCustomized ? ' (custom)' : ''} (${workspace.source}): ${workspace.path}`
        )
      : ['- none'])
  ];

  return lines.join('\n');
}

export default App;
