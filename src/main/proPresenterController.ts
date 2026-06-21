import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { PROPRESENTER_BUNDLE_ID } from './proPresenterConstants';
import { runCommand } from './shell';
import { normalizeFilePath } from './pathUtils';

const COMMON_APP_PATHS = [
  join(homedir(), 'Applications', 'ProPresenter.app'),
  '/Applications/ProPresenter.app'
];

async function exists(path: string): Promise<boolean> {
  try {
    const appStats = await stat(path);
    return appStats.isDirectory();
  } catch {
    return false;
  }
}

export async function locateProPresenter(): Promise<string | undefined> {
  const candidates = new Set<string>();

  const launchServicesPath = await resolveLaunchServicesAppPath();
  if (launchServicesPath && (await exists(launchServicesPath))) {
    candidates.add(launchServicesPath);
  }

  for (const appPath of COMMON_APP_PATHS) {
    if (await exists(appPath)) {
      candidates.add(appPath);
    }
  }

  try {
    const { stdout } = await runCommand(
      'mdfind',
      [`kMDItemCFBundleIdentifier == '${PROPRESENTER_BUNDLE_ID}'`],
      { timeout: 8_000 }
    );

    for (const line of stdout.split('\n')) {
      const candidate = line.trim();
      if (candidate.endsWith('.app') && (await exists(candidate))) {
        candidates.add(candidate);
      }
    }
  } catch {
    // Spotlight is a convenience path, not a hard dependency.
  }

  const candidateInfos = await Promise.all(
    [...candidates].map(async (appPath) => {
      const appStats = await stat(appPath);
      return { appPath, modifiedAt: appStats.mtimeMs };
    })
  );

  return candidateInfos.sort(
    (left, right) => right.modifiedAt - left.modifiedAt || left.appPath.localeCompare(right.appPath)
  )[0]?.appPath;
}

async function resolveLaunchServicesAppPath(): Promise<string | undefined> {
  try {
    const { stdout } = await runCommand('osascript', [
      '-e',
      `POSIX path of (path to application id "${PROPRESENTER_BUNDLE_ID}")`
    ]);
    const appPath = stdout.trim();
    return appPath ? normalizeFilePath(appPath) : undefined;
  } catch {
    return undefined;
  }
}

export async function isProPresenterRunning(): Promise<boolean> {
  try {
    const { stdout } = await runCommand('osascript', [
      '-e',
      `application id "${PROPRESENTER_BUNDLE_ID}" is running`
    ]);
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}

export async function focusProPresenter(appPath: string): Promise<void> {
  try {
    await runCommand('osascript', [
      '-e',
      `tell application id "${PROPRESENTER_BUNDLE_ID}" to activate`
    ]);
  } catch {
    await launchProPresenter(appPath);
  }
}

export async function quitProPresenterAndWait(timeoutMs = 30_000): Promise<void> {
  await runCommand('osascript', [
    '-e',
    `tell application id "${PROPRESENTER_BUNDLE_ID}" to quit`
  ]);

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!(await isProPresenterRunning())) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('ProPresenter did not quit within 30 seconds.');
}

export async function launchProPresenter(appPath: string): Promise<void> {
  await runCommand('open', [appPath], { timeout: 8_000 });
}
