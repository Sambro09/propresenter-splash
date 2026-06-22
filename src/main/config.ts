import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { WorkspaceOverridePatch } from '../shared/types';
import { DEFAULT_WORKSPACE_ROOT } from './proPresenterConstants';
import { normalizeFilePath } from './pathUtils';
import { logError } from './logger';

export interface WorkspaceOverride {
  name?: string;
  path?: string;
}

interface LauncherConfig {
  workspaceRoot?: string;
  /** Per-workspace admin overrides keyed by the originally scanned folder path. */
  workspaceOverrides?: Record<string, WorkspaceOverride>;
}

function configPath(): string {
  return join(app.getPath('userData'), 'config.json');
}

function sanitizeOverrides(value: unknown): Record<string, WorkspaceOverride> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const result: Record<string, WorkspaceOverride> = {};
  for (const [rawKey, rawOverride] of Object.entries(value as Record<string, unknown>)) {
    if (!rawOverride || typeof rawOverride !== 'object') {
      continue;
    }

    const override: WorkspaceOverride = {};
    const name = (rawOverride as WorkspaceOverride).name;
    const path = (rawOverride as WorkspaceOverride).path;

    if (typeof name === 'string' && name.trim()) {
      override.name = name.trim();
    }
    if (typeof path === 'string' && path.trim()) {
      override.path = normalizeFilePath(path);
    }

    if (override.name || override.path) {
      result[normalizeFilePath(rawKey)] = override;
    }
  }

  return result;
}

async function readConfig(): Promise<LauncherConfig> {
  try {
    const raw = await readFile(configPath(), 'utf8');
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return {};
    }

    const workspaceRoot = (parsed as LauncherConfig).workspaceRoot;
    const config: LauncherConfig = {};

    if (typeof workspaceRoot === 'string' && workspaceRoot.trim()) {
      config.workspaceRoot = normalizeFilePath(workspaceRoot);
    }

    const overrides = sanitizeOverrides((parsed as LauncherConfig).workspaceOverrides);
    if (Object.keys(overrides).length > 0) {
      config.workspaceOverrides = overrides;
    }

    return config;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {};
    }

    void logError('Could not read ProPresenter Splash config; falling back to defaults', error);
    return {};
  }
}

async function writeConfig(config: LauncherConfig): Promise<void> {
  const path = configPath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

async function updateConfig(mutate: (config: LauncherConfig) => void): Promise<void> {
  const config = await readConfig();
  mutate(config);
  await writeConfig(config);
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
  await updateConfig((config) => {
    config.workspaceRoot = normalizeFilePath(workspaceRoot);
  });
}

export async function getWorkspaceOverrides(): Promise<Record<string, WorkspaceOverride>> {
  const config = await readConfig();
  return config.workspaceOverrides ?? {};
}

export async function setWorkspaceOverride(
  key: string,
  patch: WorkspaceOverridePatch
): Promise<void> {
  const normalizedKey = normalizeFilePath(key);
  const override: WorkspaceOverride = {};

  if (typeof patch.name === 'string' && patch.name.trim()) {
    override.name = patch.name.trim();
  }
  if (typeof patch.path === 'string' && patch.path.trim()) {
    override.path = normalizeFilePath(patch.path);
  }

  await updateConfig((config) => {
    const overrides = config.workspaceOverrides ?? {};

    if (override.name || override.path) {
      overrides[normalizedKey] = override;
    } else {
      delete overrides[normalizedKey];
    }

    if (Object.keys(overrides).length > 0) {
      config.workspaceOverrides = overrides;
    } else {
      delete config.workspaceOverrides;
    }
  });
}

export async function clearWorkspaceOverride(key: string): Promise<void> {
  const normalizedKey = normalizeFilePath(key);
  await updateConfig((config) => {
    if (!config.workspaceOverrides) {
      return;
    }

    delete config.workspaceOverrides[normalizedKey];
    if (Object.keys(config.workspaceOverrides).length === 0) {
      delete config.workspaceOverrides;
    }
  });
}
