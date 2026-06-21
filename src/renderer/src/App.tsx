import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Circle,
  ExternalLink,
  Loader2,
  MonitorUp,
  RefreshCw
} from 'lucide-react';
import type { LauncherState, Workspace } from '../../shared/types';

type LoadStatus = 'loading' | 'ready' | 'error';

function App(): JSX.Element {
  const [launcherState, setLauncherState] = useState<LauncherState | null>(null);
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading');
  const [refreshing, setRefreshing] = useState(false);
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadState = useCallback(async () => {
    setMessage(null);
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

  async function handleRefresh(): Promise<void> {
    setRefreshing(true);
    setMessage(null);

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

  async function handleLaunch(workspace: Workspace): Promise<void> {
    setLaunchingId(workspace.id);
    setMessage(null);

    try {
      const result = await window.launcher.launchWorkspace(workspace.id);
      if (!result.ok) {
        setMessage(result.message);
        const nextState = await window.launcher.getState();
        setLauncherState(nextState);
        return;
      }

      setMessage(result.message);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Could not open ProPresenter. ${detail}`);
    } finally {
      setLaunchingId(null);
    }
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

      <StatusStrip state={launcherState} />

      {message ? (
        <div className="notice" role="alert">
          <AlertCircle size={18} />
          <span>{message}</span>
        </div>
      ) : null}

      <section className="workspacePanel" aria-live="polite">
        {loadStatus === 'loading' ? <LoadingState /> : null}
        {loadStatus === 'error' ? <ErrorState /> : null}
        {loadStatus === 'ready' && launcherState ? (
          <WorkspaceList
            launcherState={launcherState}
            launchingId={launchingId}
            onLaunch={handleLaunch}
          />
        ) : null}
      </section>

      <footer className="footer">
        <span>{launcherState?.workspaceRoot ?? ''}</span>
        <strong>v0.1.0</strong>
      </footer>
    </main>
  );
}

function StatusStrip({ state }: { state: LauncherState | null }): JSX.Element {
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
  launchingId,
  onLaunch
}: {
  launcherState: LauncherState;
  launchingId: string | null;
  onLaunch: (workspace: Workspace) => Promise<void>;
}): JSX.Element {
  if (launcherState.workspaces.length === 0) {
    return (
      <div className="emptyState">
        <AlertCircle size={24} />
        <h2>No workspaces found</h2>
        <p>{launcherState.workspaceRoot}</p>
      </div>
    );
  }

  return (
    <div className="workspaceList">
      {launcherState.workspaces.map((workspace) => {
        const launching = launchingId === workspace.id;
        return (
          <button
            type="button"
            className={`workspaceRow${workspace.isActive ? ' active' : ''}`}
            key={workspace.id}
            onClick={() => void onLaunch(workspace)}
            disabled={Boolean(launchingId) || !launcherState.proPresenter.installed}
          >
            <span className="workspaceIcon" aria-hidden="true">
              {launching ? (
                <Loader2 className="spin" size={22} />
              ) : workspace.isActive ? (
                <CheckCircle2 size={22} />
              ) : (
                <Circle size={22} />
              )}
            </span>
            <span className="workspaceText">
              <span className="workspaceName">{workspace.name}</span>
              <span className="workspacePath">{workspace.path}</span>
            </span>
            {workspace.isActive ? <span className="badge">Active</span> : null}
            {!workspace.isActive ? <ExternalLink className="launchIcon" size={18} /> : null}
          </button>
        );
      })}

      {launcherState.errors.length > 0 ? (
        <div className="details">
          {launcherState.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : null}
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

export default App;
