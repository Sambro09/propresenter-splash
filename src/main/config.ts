import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DEFAULT_WORKSPACE_ROOT } from './proPresenterConstants';
import { normalizeFilePath } from './pathUtils';
import { logError } from './logger';

interface LauncherConfig {
  workspaceRoot?: string;
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json');
}

async function readConfig(): Promise<LauncherConfig> {
  try {
    const raw = await readFile(configPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const workspaceRoot = (parsed as LauncherConfig).workspaceRoot;
    return typeof workspaceRoot === 'string' && workspaceRoot.trim()
      ? { workspaceRoot: normalizeFilePath(workspaceRoot) }
      : {};
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {};
    }

    void logError('Could not read launcher config; falling back to default workspace root', error);
    return {};
  }
}

async function writeConfig(config: LauncherConfig): Promise<void> {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export async function getWorkspaceRootConfig(): Promise<{
  workspaceRoot: string;
  isCustomWorkspaceRoot: boolean;
}> {
  const config = await readConfig();
  const workspaceRoot = config.workspaceRoot
    ? normalizeFilePath(config.workspaceRoot)
    : normalizeFilePath(DEFAULT_WORKSPACE_ROOT);

  return {
    workspaceRoot,
    isCustomWorkspaceRoot: Boolean(config.workspaceRoot)
  };
}

export async function setCustomWorkspaceRoot(workspaceRoot: string): Promise<void> {
  await writeConfig({ workspaceRoot: normalizeFilePath(workspaceRoot) });
}
