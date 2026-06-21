import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { PROPRESENTER_BUNDLE_ID } from './proPresenterConstants';
import { runCommand } from './shell';

const COMMON_APP_PATHS = [
  join(homedir(), 'Applications', 'ProPresenter.app'),
  '/Applications/ProPresenter.app'
];

async function exists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

export async function locateProPresenter(): Promise<string | undefined> {
  const candidates = new Set<string>();

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

  return [...candidates].sort((left, right) => scoreAppPath(left) - scoreAppPath(right))[0];
}

function scoreAppPath(appPath: string): number {
  const commonIndex = COMMON_APP_PATHS.indexOf(appPath);
  return commonIndex === -1 ? 100 : commonIndex;
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

export async function launchProPresenter(appPath: string): Promise<void> {
  await runCommand('open', [appPath], { timeout: 8_000 });
}
