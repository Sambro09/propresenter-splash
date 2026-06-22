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
const PROPRESENTER_PROCESS_NAME = 'ProPresenter';

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
  return (await getProPresenterPids()).length > 0;
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
  await requestProPresenterQuit();

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!(await isProPresenterRunning())) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error('ProPresenter did not quit within 30 seconds.');
}

async function requestProPresenterQuit(): Promise<void> {
  const pids = await getProPresenterPids();
  if (pids.length === 0) {
    return;
  }

  try {
    await runCommand('kill', ['-TERM', ...pids.map(String)], { timeout: 8_000 });
    return;
  } catch (error) {
    if (!(await isProPresenterRunning())) {
      return;
    }

    throw new Error(
      `Could not close ProPresenter without showing its quit prompt. ${formatQuitError(error)}`
    );
  }
}

async function getProPresenterPids(): Promise<number[]> {
  const pids = new Set<number>();

  for (const pid of await getLaunchServicesPids()) {
    pids.add(pid);
  }

  for (const pid of await getProcessNamePids()) {
    pids.add(pid);
  }

  return [...pids];
}

async function getLaunchServicesPids(): Promise<number[]> {
  try {
    const { stdout } = await runCommand(
      'lsappinfo',
      ['find', `bundleid=${PROPRESENTER_BUNDLE_ID}`],
      { timeout: 8_000 }
    );
    const applicationRecords = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('ASN:'));

    const pidResults = await Promise.all(
      applicationRecords.map((applicationRecord) =>
        runCommand('lsappinfo', ['info', '-only', 'pid', applicationRecord], {
          timeout: 8_000
        })
      )
    );

    return pidResults.flatMap((result) => parsePids(result.stdout));
  } catch {
    return [];
  }
}

async function getProcessNamePids(): Promise<number[]> {
  try {
    const { stdout } = await runCommand('pgrep', ['-x', PROPRESENTER_PROCESS_NAME], {
      timeout: 8_000
    });
    return parsePids(stdout);
  } catch {
    return [];
  }
}

function parsePids(output: string): number[] {
  return (output.match(/\d+/g) ?? []).map(Number).filter(Number.isSafeInteger);
}

function formatQuitError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function launchProPresenter(appPath: string): Promise<void> {
  await runCommand('open', [appPath], { timeout: 8_000 });
}
