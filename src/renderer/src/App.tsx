import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clipboard,
  Circle,
  Download,
  ExternalLink,
  FolderOpen,
  Loader2,
  MonitorUp,
  RefreshCw
} from 'lucide-react';
import type { LauncherState, LaunchWorkspaceOptions, Workspace } from '../../shared/types';

type LoadStatus = 'loading' | 'ready' | 'error';
type LaunchingState = {
  workspaceId: string;
  label: string;
};

function App(): JSX.Element {
  const [launcherState, setLauncherState] = useState<LauncherState | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [refreshing, setRefreshing] = useState(false);
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

  const activeLabel = useMemo(() => {
    if (!launcherState?.activeWorkspaceName) {
      return 'None selected';
    }

    return launcherState.activeWorkspaceName;
  }, [launcherState]);

  const supportDetails = useMemo(
    () => buildSupportDetails(launcherState, message),
    [launcherState, message]
  );

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

  async function handleLaunch(
    workspace: Workspace,
    options: LaunchWorkspaceOptions = {}
  ): Promise<void> {
    const proPresenterIsRunning = launcherState?.proPresenter.running === true;
    setLaunching({
      workspaceId: workspace.id,
      label:
        options.confirmQuit && proPresenterIsRunning
          ? 'Quitting ProPresenter...'
          : `Opening "${workspace.name}"...`
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
    <main className="shell">
      <header className="header">
        <div className="titleBlock">
          <h1>Choose a Workspace</h1>
          <p>Current: {activeLabel}</p>
        </div>
        <button
          className="iconButton"
          type="button"
          title="Rescan"
          aria-label="Rescan"
          onClick={handleRefresh}
          disabled={refreshing || loadStatus === 'loading'}
        >
          <RefreshCw className={refreshing ? 'spin' : undefined} size={19} />
        </button>
      </header>

      <StatusStrip state={launcherState} onDownload={handleOpenDownload} />

      {message ? (
        <div className="notice" role="alert">
          <AlertCircle size={18} />
          <span>{message}</span>
          {retryWorkspace ? (
            <button
              className="inlineButton"
              type="button"
              onClick={() => void handleLaunch(retryWorkspace, { confirmQuit: true })}
            >
              <RefreshCw size={15} />
              Retry
            </button>
          ) : null}
          <button className="inlineButton" type="button" onClick={handleCopyDetails}>
            <Clipboard size={15} />
            Copy details
          </button>
        </div>
      ) : null}

      {copyStatus ? (
        <div className="notice success" role="status">
          <CheckCircle2 size={18} />
          <span>{copyStatus}</span>
        </div>
      ) : null}

      <section className="workspacePanel" aria-live="polite">
        {loadStatus === 'loading' ? <LoadingState /> : null}
        {loadStatus === 'error' ? <ErrorState /> : null}
        {loadStatus === 'ready' && launcherState ? (
          <WorkspaceList
            launcherState={launcherState}
            launching={launching}
            onLaunch={handleLaunch}
            onChooseFolder={handleChooseFolder}
            onCopyDetails={handleCopyDetails}
          />
        ) : null}
      </section>

      <footer className="footer">
        <span>{launcherState?.workspaceRoot ?? ''}</span>
        <button
          className="footerButton"
          type="button"
          onClick={handleChooseFolder}
          disabled={refreshing}
        >
          <FolderOpen size={14} />
          Choose folder
        </button>
        <strong>v0.1.0</strong>
      </footer>

      {confirmingWorkspace ? (
        <ConfirmDialog
          workspace={confirmingWorkspace}
          busy={launching?.workspaceId === confirmingWorkspace.id}
          onCancel={() => setConfirmingWorkspace(null)}
          onConfirm={handleConfirmSwitch}
        />
      ) : null}
    </main>
  );
}

function StatusStrip({
  state,
  onDownload
}: {
  state: LauncherState | null;
  onDownload: () => Promise<void>;
}): JSX.Element {
  if (!state) {
    return (
      <div className="statusStrip">
        <Loader2 className="spin" size={16} />
        <span>Scanning</span>
      </div>
    );
  }

  if (!state.proPresenter.installed) {
    return (
      <div className="statusStrip warning">
        <AlertCircle size={16} />
        <span>ProPresenter not found</span>
        <button className="inlineButton" type="button" onClick={() => void onDownload()}>
          <Download size={15} />
          Download
        </button>
      </div>
    );
  }

  return (
    <div className="statusStrip">
      <MonitorUp size={16} />
      <span>{state.proPresenter.running ? 'ProPresenter is open' : 'ProPresenter is closed'}</span>
    </div>
  );
}

function WorkspaceList({
  launcherState,
  launching,
  onLaunch,
  onChooseFolder,
  onCopyDetails
}: {
  launcherState: LauncherState;
  launching: LaunchingState | null;
  onLaunch: (workspace: Workspace) => Promise<void>;
  onChooseFolder: () => Promise<void>;
  onCopyDetails: () => Promise<void>;
}): JSX.Element {
  if (launcherState.workspaces.length === 0) {
    return (
      <div className="emptyState">
        <AlertCircle size={24} />
        <h2>No workspaces found</h2>
        <p>{launcherState.workspaceRoot}</p>
        <button className="primaryButton" type="button" onClick={() => void onChooseFolder()}>
          <FolderOpen size={17} />
          Choose folder
        </button>
      </div>
    );
  }

  return (
    <div className="workspaceList">
      {launcherState.workspaces.map((workspace) => {
        const isLaunching = launching?.workspaceId === workspace.id;
        return (
          <button
            type="button"
            className={`workspaceRow${workspace.isActive ? ' active' : ''}`}
            key={workspace.id}
            onClick={() => void onLaunch(workspace)}
            disabled={Boolean(launching) || !launcherState.proPresenter.installed}
          >
            <span className="workspaceIcon" aria-hidden="true">
              {isLaunching ? (
                <Loader2 className="spin" size={22} />
              ) : workspace.isActive ? (
                <CheckCircle2 size={22} />
              ) : (
                <Circle size={22} />
              )}
            </span>
            <span className="workspaceText">
              <span className="workspaceName">{workspace.name}</span>
              <span className="workspacePath">
                {isLaunching ? launching.label : workspace.path}
              </span>
            </span>
            {workspace.isActive ? <span className="badge">Active</span> : null}
            {!workspace.isActive ? <ExternalLink className="launchIcon" size={18} /> : null}
          </button>
        );
      })}

      {launcherState.errors.length > 0 ? (
        <div className="details">
          <div className="detailsHeader">
            <strong>Details</strong>
            <button className="inlineButton" type="button" onClick={() => void onCopyDetails()}>
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
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <h2 id="confirm-title">Quit ProPresenter?</h2>
        <p>Save any work first. Quit ProPresenter and switch to "{workspace.name}"?</p>
        <div className="modalActions">
          <button className="secondaryButton" type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="dangerButton" type="button" onClick={() => void onConfirm()} disabled={busy}>
            {busy ? <Loader2 className="spin" size={16} /> : null}
            Quit & Switch
          </button>
        </div>
      </div>
    </div>
  );
}

function LoadingState(): JSX.Element {
  return (
    <div className="loadingState">
      <Loader2 className="spin" size={26} />
      <span>Scanning</span>
    </div>
  );
}

function ErrorState(): JSX.Element {
  return (
    <div className="emptyState">
      <AlertCircle size={24} />
      <h2>Launcher unavailable</h2>
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
            `- ${workspace.isActive ? '[active] ' : ''}${workspace.name} (${workspace.source}): ${workspace.path}`
        )
      : ['- none'])
  ];

  return lines.join('\n');
}

export default App;
