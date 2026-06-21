import { stat } from 'node:fs/promises';
import type { LauncherState, LaunchResult } from '../shared/types';
import { writeActiveWorkspace } from './activeWorkspace';
import { normalizeFilePath } from './pathUtils';
import { scanWorkspaces } from './workspaceScanner';
import { isProPresenterRunning, launchProPresenter, locateProPresenter } from './proPresenterController';

export async function getLauncherState(): Promise<LauncherState> {
  const [scan, appPath, running] = await Promise.all([
    scanWorkspaces(),
    locateProPresenter(),
    isProPresenterRunning()
  ]);

  return {
    ...scan,
    proPresenter: {
      installed: Boolean(appPath),
      running,
      appPath
    }
  };
}

export async function launchWorkspace(workspaceId: string): Promise<LaunchResult> {
  const targetPath = normalizeFilePath(workspaceId);
  const appPath = await locateProPresenter();

  if (!appPath) {
    return {
      ok: false,
      code: 'PROPRESENTER_NOT_FOUND',
      message: 'ProPresenter could not be found on this Mac.'
    };
  }

  const running = await isProPresenterRunning();
  if (running) {
    return {
      ok: false,
      code: 'PROPRESENTER_RUNNING',
      message: 'ProPresenter is open. Quit ProPresenter, then choose the workspace again.'
    };
  }

  try {
    const stats = await stat(targetPath);
    if (!stats.isDirectory()) {
      throw new Error('Selected path is not a directory.');
    }
  } catch {
    return {
      ok: false,
      code: 'WORKSPACE_NOT_FOUND',
      message: 'The selected workspace folder no longer exists.'
    };
  }

  try {
    await writeActiveWorkspace(targetPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: 'PREFERENCE_WRITE_FAILED',
      message: `Could not switch ProPresenter to that workspace. ${detail}`
    };
  }

  try {
    await launchProPresenter(appPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      code: 'LAUNCH_FAILED',
      message: `The workspace was selected, but ProPresenter could not be opened. ${detail}`
    };
  }

  return {
    ok: true,
    message: 'Opening ProPresenter.'
  };
}
