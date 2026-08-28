import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CaretRight,
  Check,
  CheckCircle,
  CircleNotch,
  Clipboard,
  DownloadSimple,
  FolderOpen,
  Gear,
  IconContext,
  Info,
  MonitorPlay,
  PencilSimple,
  PushPin,
  SignOut,
  Stack,
  Warning,
  WarningCircle
} from '@phosphor-icons/react';
import type {
  LauncherState,
  LaunchWorkspaceOptions,
  SessionState,
  Workspace,
  WorkspaceOrderDirection,
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
  const [sessionState, setSessionState] = useState<SessionState>({ status: 'idle' });
  const [sessionAction, setSessionAction] = useState<
    'logout' | 'choose' | 'reopen' | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const stateUpdateVersion = useRef(0);

  const loadState = useCallback(async () => {
    const startingVersion = stateUpdateVersion.current;
    setMessage(null);
    setNotice(null);
    setCopyStatus(null);
    setLoadStatus('loading');

    try {
      const nextState = await window.launcher.getState();
      // A very fast background refresh can arrive before the cached IPC reply.
      // Never let that older cached reply overwrite the newer live state.
      if (stateUpdateVersion.current === startingVersion) {
        setLauncherState(nextState);
        setSessionState(nextState.session);
        setLoadStatus('ready');
      }
    } catch (error) {
      if (stateUpdateVersion.current !== startingVersion) {
        return;
      }
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Could not load ProPresenter Splash state. ${detail}`);
      setLoadStatus('error');
    }
  }, []);

  useEffect(() => {
    const offState = window.launcher.onLauncherState((state) => {
      stateUpdateVersion.current += 1;
      setLauncherState(state);
      setSessionState(state.session);
      setLoadStatus('ready');
    });
    void loadState();
    return offState;
  }, [loadState]);

  async function handleRefresh(): Promise<void> {
    setRefreshing(true);
    setMessage(null);
    setNotice(null);
    setCopyStatus(null);
    setRetryWorkspace(null);

    try {
      const nextState = await window.launcher.rescan();
      setLauncherState(nextState);
      setSessionState(nextState.session);
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
    setNotice(null);
    setCopyStatus(null);
    setRetryWorkspace(null);

    try {
      const nextState = await window.launcher.chooseWorkspacesFolder();
      setLauncherState(nextState);
      setSessionState(nextState.session);
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

  useEffect(() => {
    const offSession = window.launcher.onSessionState((state) => {
      setSessionState(state);
      if (state.status === 'ended') {
        void loadState();
      }
    });

    return () => offSession();
  }, [loadState]);

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

  async function handleFocusProPresenter(): Promise<void> {
    setMessage(null);
    setNotice(null);
    setCopyStatus(null);

    try {
      await window.launcher.focusProPresenter();
      setNotice('Bringing ProPresenter to the front.');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Could not bring ProPresenter to the front. ${detail}`);
    }
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
    setNotice(null);
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
    setNotice(null);
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

  async function handleSetLaunchAtLogin(value: boolean): Promise<void> {
    setMessage(null);
    setNotice(null);
    setCopyStatus(null);
    try {
      const nextState = await window.launcher.setLaunchAtLogin(value);
      setLauncherState(nextState);
      setSessionState(nextState.session);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Could not change the Login Item setting. ${detail}`);
    }
  }

  async function handleSetOperatorMode(value: boolean): Promise<void> {
    setMessage(null);
    setNotice(null);
    setCopyStatus(null);
    try {
      const nextState = await window.launcher.setOperatorMode(value);
      setLauncherState(nextState);
      setSessionState(nextState.session);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Could not change operator startup mode. ${detail}`);
    }
  }

  async function handleSetWorkspacePinned(workspace: Workspace, pinned: boolean): Promise<void> {
    setMessage(null);
    setNotice(null);
    setCopyStatus(null);
    try {
      const nextState = await window.launcher.setWorkspacePinned(workspace.key, pinned);
      setLauncherState(nextState);
      setSessionState(nextState.session);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Could not update workspace pinning. ${detail}`);
    }
  }

  async function handleMoveWorkspace(
    workspace: Workspace,
    direction: WorkspaceOrderDirection
  ): Promise<void> {
    setMessage(null);
    setNotice(null);
    setCopyStatus(null);
    try {
      const nextState = await window.launcher.moveWorkspace(workspace.key, direction);
      setLauncherState(nextState);
      setSessionState(nextState.session);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Could not update workspace order. ${detail}`);
    }
  }

  async function handleChooseAnotherWorkspace(): Promise<void> {
    setSessionAction('choose');
    setMessage(null);
    setNotice(null);
    setCopyStatus(null);
    try {
      const nextSession = await window.launcher.clearSession();
      setSessionState(nextSession);
      await loadState();
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Could not return to workspace selection. ${detail}`);
    } finally {
      setSessionAction(null);
    }
  }

  async function handleReopenLastWorkspace(): Promise<void> {
    setSessionAction('reopen');
    setMessage(null);
    setNotice(null);
    setCopyStatus(null);
    try {
      const result = await window.launcher.reopenLastWorkspace();
      if (!result.ok) {
        setMessage(result.message);
        return;
      }

      setSessionState({
        status: 'running',
        lastWorkspaceId: result.workspaceId,
        lastWorkspaceName: result.workspaceName
      });
      setNotice(result.message);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Could not reopen ProPresenter. ${detail}`);
    } finally {
      setSessionAction(null);
    }
  }

  async function handleRequestLogout(): Promise<void> {
    setSessionAction('logout');
    setMessage(null);
    setNotice(null);
    setCopyStatus(null);
    try {
      await window.launcher.requestLogout();
      setNotice('macOS logout confirmation opened.');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Could not open the macOS logout confirmation. ${detail}`);
    } finally {
      setSessionAction(null);
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
          ? 'Closing ProPresenter…'
          : `Opening “${workspace.name}”…`
    });
    setMessage(null);
    setNotice(null);
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

      setNotice(result.message);
      setSessionState({
        status: 'running',
        lastWorkspaceId: result.workspaceId ?? workspace.id,
        lastWorkspaceName: result.workspaceName ?? workspace.name
      });
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

  const showSessionEnded = sessionState.status === 'ended';
  const showWindowRecoveryBanner =
    sessionState.status === 'running' &&
    (sessionState.proPresenterWindow === 'minimized' ||
      sessionState.proPresenterWindow === 'background');

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
              Exit
            </button>
          </div>
        ) : null}

        {editMode && launcherState && !showSessionEnded ? (
          <AdminPanel
            launcherState={launcherState}
            refreshing={refreshing}
            onSetLaunchAtLogin={handleSetLaunchAtLogin}
            onSetOperatorMode={handleSetOperatorMode}
            onRefresh={handleRefresh}
            onChooseFolder={handleChooseFolder}
          />
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

          {showWindowRecoveryBanner ? (
            <div className="banner info recoveryBanner" role="status">
              <Info size={18} weight="fill" />
              <span>{proPresenterWindowRecoveryText(sessionState)}</span>
              <div className="bannerActions">
                <button
                  className="bannerBtn"
                  type="button"
                  onClick={() => void handleFocusProPresenter()}
                >
                  <MonitorPlay size={15} />
                  Bring to front
                </button>
                <button
                  className="bannerBtn"
                  type="button"
                  onClick={() => void handleChooseAnotherWorkspace()}
                >
                  <Stack size={15} />
                  Switch workspace
                </button>
              </div>
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

          {notice ? (
            <div className="banner info" role="status">
              <Info size={18} weight="fill" />
              <span>{notice}</span>
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
          {loadStatus === 'ready' && launcherState && showSessionEnded ? (
            <SessionEndedScreen
              session={sessionState}
              busyAction={sessionAction}
              onLogout={handleRequestLogout}
              onChooseAnother={handleChooseAnotherWorkspace}
              onReopenLast={handleReopenLastWorkspace}
            />
          ) : null}
          {loadStatus === 'ready' && launcherState && !showSessionEnded ? (
            <WorkspaceLibrary
              launcherState={launcherState}
              launching={launching}
              editMode={editMode}
              onLaunch={handleLaunch}
              onEdit={setEditingWorkspace}
              onPin={handleSetWorkspacePinned}
              onMove={handleMoveWorkspace}
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

function AdminPanel({
  launcherState,
  refreshing,
  onSetLaunchAtLogin,
  onSetOperatorMode,
  onRefresh,
  onChooseFolder
}: {
  launcherState: LauncherState;
  refreshing: boolean;
  onSetLaunchAtLogin: (value: boolean) => Promise<void>;
  onSetOperatorMode: (value: boolean) => Promise<void>;
  onRefresh: () => Promise<void>;
  onChooseFolder: () => Promise<void>;
}): JSX.Element {
  return (
    <section className="adminPanel" aria-label="Admin setup">
      <label className="toggleRow">
        <input
          type="checkbox"
          checked={launcherState.settings.launchAtLogin}
          disabled={!launcherState.settings.launchAtLoginAvailable}
          onChange={(event) => void onSetLaunchAtLogin(event.currentTarget.checked)}
        />
        <span>
          <strong>Launch at login</strong>
          <small>Register this launcher as the shared account Login Item.</small>
        </span>
      </label>

      <label className="toggleRow">
        <input
          type="checkbox"
          checked={launcherState.settings.operatorMode}
          onChange={(event) => void onSetOperatorMode(event.currentTarget.checked)}
        />
        <span>
          <strong>Focused startup mode</strong>
          <small>Open centered and focused when the operator logs in.</small>
        </span>
      </label>

      <div className="adminActions">
        <button
          className="adminBtn"
          type="button"
          onClick={() => void onRefresh()}
          disabled={refreshing}
        >
          {refreshing ? <CircleNotch size={15} className="spin" /> : <Stack size={15} />}
          Rescan
        </button>
        <button className="adminBtn" type="button" onClick={() => void onChooseFolder()}>
          <FolderOpen size={15} />
          Choose Folder
        </button>
      </div>
    </section>
  );
}

function SessionEndedScreen({
  session,
  busyAction,
  onLogout,
  onChooseAnother,
  onReopenLast
}: {
  session: SessionState;
  busyAction: 'logout' | 'choose' | 'reopen' | null;
  onLogout: () => Promise<void>;
  onChooseAnother: () => Promise<void>;
  onReopenLast: () => Promise<void>;
}): JSX.Element {
  const workspaceName = session.lastWorkspaceName ?? 'Last Workspace';

  return (
    <section className="sessionScreen">
      <div className="sessionIcon" aria-hidden="true">
        <CheckCircle size={34} weight="fill" />
      </div>
      <h2>Session Finished</h2>
      <p>{workspaceName}</p>
      <p className="sessionHint">
        Use these buttons, or the ProPresenter Splash menu-bar icon, to log out, switch, or
        reopen.
      </p>

      <div className="sessionActions">
        <button
          className="sessionBtn primary"
          type="button"
          onClick={() => void onLogout()}
          disabled={Boolean(busyAction)}
        >
          {busyAction === 'logout' ? (
            <CircleNotch size={18} className="spin" />
          ) : (
            <SignOut size={18} />
          )}
          Log Out
        </button>
        <button
          className="sessionBtn"
          type="button"
          onClick={() => void onChooseAnother()}
          disabled={Boolean(busyAction)}
        >
          {busyAction === 'choose' ? (
            <CircleNotch size={18} className="spin" />
          ) : (
            <Stack size={18} />
          )}
          Choose Another Workspace
        </button>
        <button
          className="sessionBtn"
          type="button"
          onClick={() => void onReopenLast()}
          disabled={Boolean(busyAction) || !session.lastWorkspaceId}
        >
          {busyAction === 'reopen' ? (
            <CircleNotch size={18} className="spin" />
          ) : (
            <MonitorPlay size={18} />
          )}
          Reopen Last Workspace
        </button>
      </div>
    </section>
  );
}

function WorkspaceLibrary({
  launcherState,
  launching,
  editMode,
  onLaunch,
  onEdit,
  onPin,
  onMove,
  onChooseFolder,
  onCopyDetails
}: {
  launcherState: LauncherState;
  launching: LaunchingState | null;
  editMode: boolean;
  onLaunch: (workspace: Workspace) => Promise<void>;
  onEdit: (workspace: Workspace) => void;
  onPin: (workspace: Workspace, pinned: boolean) => Promise<void>;
  onMove: (workspace: Workspace, direction: WorkspaceOrderDirection) => Promise<void>;
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
        {launcherState.workspaces.map((workspace, index) => {
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
                <div className="wsTools">
                  <button
                    className={`wsTool${workspace.isPinned ? ' active' : ''}`}
                    type="button"
                    title={workspace.isPinned ? `Unpin ${workspace.name}` : `Pin ${workspace.name}`}
                    aria-label={
                      workspace.isPinned ? `Unpin ${workspace.name}` : `Pin ${workspace.name}`
                    }
                    onClick={() => void onPin(workspace, !workspace.isPinned)}
                    disabled={Boolean(launching)}
                  >
                    <PushPin size={17} weight={workspace.isPinned ? 'fill' : 'regular'} />
                  </button>
                  <button
                    className="wsTool"
                    type="button"
                    title={`Move ${workspace.name} up`}
                    aria-label={`Move ${workspace.name} up`}
                    onClick={() => void onMove(workspace, 'up')}
                    disabled={Boolean(launching) || index === 0}
                  >
                    <ArrowUp size={17} />
                  </button>
                  <button
                    className="wsTool"
                    type="button"
                    title={`Move ${workspace.name} down`}
                    aria-label={`Move ${workspace.name} down`}
                    onClick={() => void onMove(workspace, 'down')}
                    disabled={Boolean(launching) || index === launcherState.workspaces.length - 1}
                  >
                    <ArrowDown size={17} />
                  </button>
                  <button
                    className="wsTool"
                    type="button"
                    title={`Edit ${workspace.name}`}
                    aria-label={`Edit ${workspace.name}`}
                    onClick={() => onEdit(workspace)}
                    disabled={Boolean(launching)}
                  >
                    <Gear size={17} />
                  </button>
                </div>
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
          Save any work first. ProPresenter Splash will close ProPresenter and reopen it with{' '}
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
      <h2>ProPresenter Splash unavailable</h2>
      <p>ProPresenter Splash could not start. Try reopening it.</p>
    </div>
  );
}

function buildSupportDetails(state: LauncherState | null, message: string | null): string {
  const lines = [
    'ProPresenter Splash support details',
    `Generated: ${new Date().toISOString()}`,
    `Message: ${message ?? 'none'}`,
    `Workspace root: ${state?.workspaceRoot ?? 'unknown'}`,
    `Custom workspace root: ${state?.isCustomWorkspaceRoot ? 'yes' : 'no'}`,
    `Active workspace: ${state?.activeWorkspaceName ?? state?.activeWorkspaceId ?? 'unknown'}`,
    `ProPresenter installed: ${state?.proPresenter.installed ? 'yes' : 'no'}`,
    `ProPresenter running: ${state?.proPresenter.running ? 'yes' : 'no'}`,
    `ProPresenter path: ${state?.proPresenter.appPath ?? 'unknown'}`,
    `ProPresenter window: ${state?.session.proPresenterWindow ?? 'unknown'}`,
    `Launch at login: ${state?.settings.launchAtLogin ? 'yes' : 'no'}`,
    `Operator mode: ${state?.settings.operatorMode ? 'yes' : 'no'}`,
    `Session: ${state?.session.status ?? 'unknown'}`,
    `Support log: ${state?.supportLogPath ?? 'unknown'}`,
    '',
    'Errors:',
    ...(state?.errors.length ? state.errors.map((error) => `- ${error}`) : ['- none']),
    '',
    'Workspaces:',
    ...(state?.workspaces.length
      ? state.workspaces.map(
          (workspace) =>
            `- ${workspace.isActive ? '[active] ' : ''}${workspace.isPinned ? '[pinned] ' : ''}${workspace.name}${workspace.isCustomized ? ' (custom)' : ''} (${workspace.source}): ${workspace.path}`
        )
      : ['- none'])
  ];

  return lines.join('\n');
}

function proPresenterWindowRecoveryText(session: SessionState): string {
  const menuBarHint =
    'You do not need to quit ProPresenter; use the ProPresenter Splash menu-bar icon to switch.';

  if (session.proPresenterWindow === 'minimized') {
    return `ProPresenter is still open but minimized. ${menuBarHint}`;
  }

  return `ProPresenter is still open but in the background. ${menuBarHint}`;
}

export default App;
