import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CaretRight,
  Check,
  CheckCircle,
  CircleNotch,
  Clipboard,
  Copy,
  DownloadSimple,
  FolderOpen,
  FolderPlus,
  Gear,
  IconContext,
  Info,
  MonitorPlay,
  PencilSimple,
  PushPin,
  SignOut,
  Stack,
  Trash,
  Warning,
  WarningCircle
} from '@phosphor-icons/react';
import type {
  CopierCategoryId,
  CopierCopyResult,
  CopierFolderScan,
  LauncherState,
  LaunchWorkspaceOptions,
  SessionState,
  Workspace,
  WorkspaceOrderDirection,
  WorkspaceOverridePatch
} from '../../shared/types';
import { COPIER_CATEGORIES } from '../../shared/copier';

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
  const [copierOpen, setCopierOpen] = useState(false);
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

  const loadState = useCallback(async () => {
    setMessage(null);
    setNotice(null);
    setCopyStatus(null);
    setLoadStatus('loading');

    try {
      const nextState = await window.launcher.getState();
      setLauncherState(nextState);
      setSessionState(nextState.session);
      setLoadStatus('ready');
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setMessage(`Could not load ProPresenter Splash state. ${detail}`);
      setLoadStatus('error');
    }
  }, []);

  useEffect(() => {
    void loadState();
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
          ? 'Quitting ProPresenter…'
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
            onOpenCopier={() => setCopierOpen(true)}
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

        {copierOpen ? <SettingsCopierModal onClose={() => setCopierOpen(false)} /> : null}
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
  onChooseFolder,
  onOpenCopier
}: {
  launcherState: LauncherState;
  refreshing: boolean;
  onSetLaunchAtLogin: (value: boolean) => Promise<void>;
  onSetOperatorMode: (value: boolean) => Promise<void>;
  onRefresh: () => Promise<void>;
  onChooseFolder: () => Promise<void>;
  onOpenCopier: () => void;
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
        <button className="adminBtn" type="button" onClick={onOpenCopier}>
          <Copy size={15} />
          Copy Settings…
        </button>
      </div>
    </section>
  );
}

function folderLabel(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const parts = trimmed.split('/');
  return parts[parts.length - 1] || trimmed;
}

function categoryLabel(id: CopierCategoryId): string {
  return COPIER_CATEGORIES.find((category) => category.id === id)?.label ?? id;
}

function SettingsCopierModal({ onClose }: { onClose: () => void }): JSX.Element {
  const [source, setSource] = useState<CopierFolderScan | null>(null);
  const [targets, setTargets] = useState<CopierFolderScan[]>([]);
  const [selected, setSelected] = useState<Set<CopierCategoryId>>(new Set());
  const [picking, setPicking] = useState<'source' | 'target' | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CopierCopyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function chooseSource(): Promise<void> {
    setPicking('source');
    setError(null);
    setResult(null);
    try {
      const scan = await window.launcher.pickCopierFolder();
      if (scan) {
        setSource(scan);
        // Default selection: high-confidence categories that exist in the source.
        const defaults = COPIER_CATEGORIES.filter(
          (category) => category.confidence === 'high' && scan.matched.includes(category.id)
        ).map((category) => category.id);
        setSelected(new Set(defaults));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPicking(null);
    }
  }

  async function addTarget(): Promise<void> {
    setPicking('target');
    setError(null);
    setResult(null);
    try {
      const scan = await window.launcher.pickCopierFolder();
      if (scan) {
        setTargets((prev) =>
          prev.some((existing) => existing.pickedPath === scan.pickedPath) ? prev : [...prev, scan]
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPicking(null);
    }
  }

  function removeTarget(pickedPath: string): void {
    setTargets((prev) => prev.filter((target) => target.pickedPath !== pickedPath));
    setResult(null);
  }

  function toggleCategory(id: CopierCategoryId): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setResult(null);
  }

  async function runCopy(): Promise<void> {
    if (!source) {
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const res = await window.launcher.runCopier({
        sourcePath: source.pickedPath,
        targetPaths: targets.map((target) => target.pickedPath),
        categories: [...selected]
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  const selectedIds = [...selected];
  const validTargets = targets.filter((target) => target.hasConfiguration);
  const copyable = selectedIds.filter((id) => source?.matched.includes(id));
  const canCopy =
    Boolean(source?.hasConfiguration) && validTargets.length > 0 && copyable.length > 0 && !running;

  const warnings: string[] = [];
  if (source && !source.hasConfiguration) {
    warnings.push(
      'The chosen source has no Configuration folder. Pick the sync folder that contains “Configuration”.'
    );
  }
  for (const target of targets) {
    if (!target.hasConfiguration) {
      warnings.push(`“${folderLabel(target.pickedPath)}” has no Configuration folder and is skipped.`);
    }
  }
  if (source?.hasConfiguration) {
    for (const id of selectedIds) {
      const meta = COPIER_CATEGORIES.find((category) => category.id === id);
      if (!meta) {
        continue;
      }
      if (!source.matched.includes(id)) {
        warnings.push(`${meta.label}: no “${meta.file}” file in the source — it will be skipped.`);
      } else if (validTargets.length > 0) {
        const missing = validTargets.filter((target) => !target.matched.includes(id)).length;
        if (missing > 0) {
          warnings.push(`${meta.label}: missing in ${missing} target(s) — skipped there.`);
        }
      }
    }
  }

  const busyPicking = picking !== null;

  return (
    <div className="modalBackdrop">
      <div
        className="modal copierModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="copier-title"
      >
        <span className="modalIcon edit" aria-hidden="true">
          <Copy size={24} weight="fill" />
        </span>
        <h2 id="copier-title">Copy Workspace Settings</h2>
        <p>
          Copies selected ProPresenter <b>Configuration</b> settings from one sync folder into
          others. The <b>source</b> is the folder you copy settings <b>from</b> — it is only read
          and never changed. Each <b>target</b> is a destination folder you copy those settings{' '}
          <b>into</b> — its matching files are overwritten (after an automatic backup). This is not
          official ProPresenter sync.
        </p>

        {result ? (
          <>
            <div className="copierBody">
              <div className="copierSection">
                <span className="copierSectionTitle">Results</span>
                {result.outcomes.map((outcome) => (
                  <div className="copierResultCard" key={outcome.targetPath}>
                    <div className="copierResultHead">
                      {outcome.error ? (
                        <WarningCircle size={16} weight="fill" />
                      ) : outcome.copied.length > 0 ? (
                        <CheckCircle size={16} weight="fill" />
                      ) : (
                        <Info size={16} weight="fill" />
                      )}
                      <strong>{folderLabel(outcome.targetPath)}</strong>
                    </div>
                    {outcome.error ? (
                      <p className="copierResultError">{outcome.error}</p>
                    ) : (
                      <>
                        <p className="copierResultLine">
                          {outcome.copied.length > 0
                            ? `Copied: ${outcome.copied.map(categoryLabel).join(', ')}`
                            : 'Nothing copied.'}
                        </p>
                        {outcome.skipped.length > 0 ? (
                          <p className="copierResultMuted">
                            Skipped:{' '}
                            {outcome.skipped
                              .map(
                                (entry) =>
                                  `${categoryLabel(entry.category)} (${
                                    entry.reason === 'no-source-file' ? 'not in source' : 'not in target'
                                  })`
                              )
                              .join(', ')}
                          </p>
                        ) : null}
                        {outcome.backupPath ? (
                          <p className="copierResultMuted">Backup: {outcome.backupPath}</p>
                        ) : null}
                      </>
                    )}
                  </div>
                ))}
              </div>
              <p className="copierNote">
                Quit and reopen ProPresenter, then verify screens/looks/macros before going live. Keep
                each backup folder until you’ve confirmed the result.
              </p>
            </div>
            <div className="modalActions">
              <button className="resetLink" type="button" onClick={() => setResult(null)}>
                Copy again
              </button>
              <span className="modalSpacer" />
              <button className="btn btnPrimary" type="button" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="copierBody">
              <div className="copierSection">
                <span className="copierSectionTitle">Source</span>
                {source ? (
                  <div className="copierFolder">
                    <FolderOpen size={16} />
                    <span className="copierFolderText">
                      <span className="copierFolderName">{folderLabel(source.pickedPath)}</span>
                      <span className="copierFolderPath">
                        {source.configurationPath ?? source.pickedPath}
                      </span>
                      {!source.hasConfiguration ? (
                        <span className="copierFolderBad">No Configuration folder found</span>
                      ) : null}
                    </span>
                    <button
                      className="chooseBtn"
                      type="button"
                      onClick={() => void chooseSource()}
                      disabled={busyPicking}
                    >
                      Change…
                    </button>
                  </div>
                ) : (
                  <button
                    className="chooseBtn"
                    type="button"
                    onClick={() => void chooseSource()}
                    disabled={busyPicking}
                  >
                    {picking === 'source' ? (
                      <CircleNotch size={15} className="spin" />
                    ) : (
                      <FolderOpen size={15} />
                    )}
                    Choose source folder…
                  </button>
                )}
              </div>

              <div className="copierSection">
                <span className="copierSectionTitle">Targets</span>
                {targets.map((target) => (
                  <div className="copierFolder" key={target.pickedPath}>
                    <FolderOpen size={16} />
                    <span className="copierFolderText">
                      <span className="copierFolderName">{folderLabel(target.pickedPath)}</span>
                      <span className="copierFolderPath">
                        {target.configurationPath ?? target.pickedPath}
                      </span>
                      {!target.hasConfiguration ? (
                        <span className="copierFolderBad">No Configuration folder found</span>
                      ) : null}
                    </span>
                    <button
                      className="copierRemove"
                      type="button"
                      title={`Remove ${folderLabel(target.pickedPath)}`}
                      aria-label={`Remove ${folderLabel(target.pickedPath)}`}
                      onClick={() => removeTarget(target.pickedPath)}
                    >
                      <Trash size={15} />
                    </button>
                  </div>
                ))}
                <button
                  className="chooseBtn"
                  type="button"
                  onClick={() => void addTarget()}
                  disabled={busyPicking}
                >
                  {picking === 'target' ? (
                    <CircleNotch size={15} className="spin" />
                  ) : (
                    <FolderPlus size={15} />
                  )}
                  Add target folder…
                </button>
              </div>

              <div className="copierSection">
                <span className="copierSectionTitle">Settings to copy</span>
                {COPIER_CATEGORIES.map((category) => {
                  const inSource = source?.matched.includes(category.id) ?? false;
                  const targetsWith = validTargets.filter((target) =>
                    target.matched.includes(category.id)
                  ).length;
                  const hint = !source
                    ? null
                    : inSource
                      ? `source ✓ · ${targetsWith}/${validTargets.length} targets`
                      : 'not in source';
                  return (
                    <label className="copierCatRow" key={category.id}>
                      <input
                        type="checkbox"
                        checked={selected.has(category.id)}
                        onChange={() => toggleCategory(category.id)}
                      />
                      <span className="copierCatMain">
                        <span className="copierCatLabel">{category.label}</span>
                        <span className="copierCatMeta">Configuration/{category.file}</span>
                      </span>
                      {hint ? <span className="copierCatHint">{hint}</span> : null}
                    </label>
                  );
                })}
              </div>

              {warnings.length > 0 ? (
                <div className="copierWarnings">
                  {warnings.map((warning) => (
                    <p key={warning}>
                      <Warning size={13} weight="fill" /> {warning}
                    </p>
                  ))}
                </div>
              ) : null}

              {error ? (
                <div className="copierWarnings copierError">
                  <p>
                    <WarningCircle size={13} weight="fill" /> {error}
                  </p>
                </div>
              ) : null}

              <p className="copierNote">
                Quit ProPresenter before copying. Each target’s Configuration folder is backed up
                first, so the copy is reversible.
              </p>
            </div>

            <div className="modalActions">
              <span className="modalSpacer" />
              <button className="btn btnGhost" type="button" onClick={onClose} disabled={running}>
                Cancel
              </button>
              <button
                className="btn btnPrimary"
                type="button"
                onClick={() => void runCopy()}
                disabled={!canCopy}
              >
                {running ? <CircleNotch size={16} className="spin" /> : <Copy size={16} />}
                Copy settings
              </button>
            </div>
          </>
        )}
      </div>
    </div>
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
      <h2>ProPresenter Closed</h2>
      <p>{workspaceName}</p>

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

export default App;
