import { app } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type {
  SessionEndSettings,
  SessionEndSettingsPatch,
  WorkspaceOverridePatch
} from '../shared/types';
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
  /** Stable admin-defined workspace order keyed by originally scanned folder path. */
  workspaceOrder?: string[];
  /** Workspaces visually marked as pinned in admin mode. */
  pinnedWorkspaceKeys?: string[];
  /** Buttons and system action shown after ProPresenter closes. */
  sessionEnd?: SessionEndSettings;
  /** True after the first-run Launch at Login choice has been shown. */
  launchAtLoginSetupComplete?: boolean;
}

export const DEFAULT_SESSION_END_SETTINGS: SessionEndSettings = {
  systemAction: 'logout'
};

export interface WorkspaceScanConfig {
  workspaceRoot: string;
  isCustomWorkspaceRoot: boolean;
  workspaceOverrides: Record<string, WorkspaceOverride>;
  workspaceOrder: string[];
  pinnedWorkspaceKeys: string[];
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

function sanitizePathList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) {
      continue;
    }

    const normalized = normalizeFilePath(item);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }

  return result;
}

export function sanitizeSessionEndSettings(value: unknown): SessionEndSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_SESSION_END_SETTINGS };
  }

  const candidate = value as Partial<SessionEndSettings>;
  return {
    systemAction:
      candidate.systemAction === 'logout' || candidate.systemAction === 'shutdown'
        ? candidate.systemAction
        : DEFAULT_SESSION_END_SETTINGS.systemAction
  };
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

    const workspaceOrder = sanitizePathList((parsed as LauncherConfig).workspaceOrder);
    if (workspaceOrder.length > 0) {
      config.workspaceOrder = workspaceOrder;
    }

    const pinnedWorkspaceKeys = sanitizePathList((parsed as LauncherConfig).pinnedWorkspaceKeys);
    if (pinnedWorkspaceKeys.length > 0) {
      config.pinnedWorkspaceKeys = pinnedWorkspaceKeys;
    }

    if ((parsed as LauncherConfig).sessionEnd !== undefined) {
      config.sessionEnd = sanitizeSessionEndSettings((parsed as LauncherConfig).sessionEnd);
    }

    const launchAtLoginSetupComplete = (parsed as LauncherConfig).launchAtLoginSetupComplete;
    if (typeof launchAtLoginSetupComplete === 'boolean') {
      config.launchAtLoginSetupComplete = launchAtLoginSetupComplete;
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

/**
 * Read every setting needed by workspace discovery from one config snapshot.
 *
 * Startup used to parse the same file three times before it could touch the
 * workspace folder. Keeping these values together also prevents a scan from
 * mixing settings from two config revisions.
 */
export async function getWorkspaceScanConfig(): Promise<WorkspaceScanConfig> {
  const config = await readConfig();
  return {
    workspaceRoot: config.workspaceRoot
      ? normalizeFilePath(config.workspaceRoot)
      : normalizeFilePath(DEFAULT_WORKSPACE_ROOT),
    isCustomWorkspaceRoot: Boolean(config.workspaceRoot),
    workspaceOverrides: config.workspaceOverrides ?? {},
    workspaceOrder: config.workspaceOrder ?? [],
    pinnedWorkspaceKeys: config.pinnedWorkspaceKeys ?? []
  };
}

export async function setCustomWorkspaceRoot(workspaceRoot: string): Promise<void> {
  await updateConfig((config) => {
    config.workspaceRoot = normalizeFilePath(workspaceRoot);
  });
}

export async function getLaunchAtLoginSetupCompleteConfig(): Promise<boolean> {
  const config = await readConfig();
  return config.launchAtLoginSetupComplete ?? false;
}

export async function setLaunchAtLoginSetupCompleteConfig(value: boolean): Promise<void> {
  await updateConfig((config) => {
    config.launchAtLoginSetupComplete = value;
  });
}

export async function getSessionEndSettingsConfig(): Promise<SessionEndSettings> {
  const config = await readConfig();
  return sanitizeSessionEndSettings(config.sessionEnd);
}

export async function setSessionEndSettingsConfig(
  patch: SessionEndSettingsPatch
): Promise<SessionEndSettings> {
  if (!patch || typeof patch !== 'object') {
    throw new Error('Session-end settings must be an object.');
  }
  if (
    patch.systemAction !== undefined &&
    patch.systemAction !== 'logout' &&
    patch.systemAction !== 'shutdown'
  ) {
    throw new Error('Unsupported session-end system action.');
  }
  let updated = { ...DEFAULT_SESSION_END_SETTINGS };
  await updateConfig((config) => {
    const current = sanitizeSessionEndSettings(config.sessionEnd);
    updated = {
      systemAction: patch.systemAction ?? current.systemAction
    };
    config.sessionEnd = updated;
  });
  return updated;
}

function normalizedKnownKeys(keys: string[]): string[] {
  return sanitizePathList(keys);
}

function orderedKnownKeys(existingOrder: string[] | undefined, knownKeys: string[]): string[] {
  const normalizedKnown = normalizedKnownKeys(knownKeys);
  const known = new Set(normalizedKnown);
  const ordered = sanitizePathList(existingOrder).filter((key) => known.has(key));
  const orderedSet = new Set(ordered);

  for (const key of normalizedKnown) {
    if (!orderedSet.has(key)) {
      ordered.push(key);
    }
  }

  return ordered;
}

export async function setWorkspacePinnedConfig(
  key: string,
  pinned: boolean,
  knownKeys: string[]
): Promise<void> {
  const normalizedKey = normalizeFilePath(key);
  await updateConfig((config) => {
    const order = orderedKnownKeys(config.workspaceOrder, knownKeys).filter(
      (orderedKey) => orderedKey !== normalizedKey
    );
    const pinnedKeys = sanitizePathList(config.pinnedWorkspaceKeys).filter(
      (pinnedKey) => pinnedKey !== normalizedKey
    );

    if (pinned) {
      order.splice(pinnedKeys.length, 0, normalizedKey);
      pinnedKeys.push(normalizedKey);
    } else {
      order.push(normalizedKey);
    }

    config.workspaceOrder = order;
    if (pinnedKeys.length > 0) {
      config.pinnedWorkspaceKeys = pinnedKeys;
    } else {
      delete config.pinnedWorkspaceKeys;
    }
  });
}

export async function moveWorkspaceInOrderConfig(
  key: string,
  direction: 'up' | 'down',
  knownKeys: string[]
): Promise<void> {
  const normalizedKey = normalizeFilePath(key);
  await updateConfig((config) => {
    const order = orderedKnownKeys(config.workspaceOrder, knownKeys);
    const currentIndex = order.indexOf(normalizedKey);
    if (currentIndex === -1) {
      return;
    }

    const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (nextIndex < 0 || nextIndex >= order.length) {
      return;
    }

    const [item] = order.splice(currentIndex, 1);
    order.splice(nextIndex, 0, item);
    config.workspaceOrder = order;
  });
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
