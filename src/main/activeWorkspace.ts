import { stat } from 'node:fs/promises';
import {
  APPLICATION_SHOW_DIRECTORY_KEY,
  PREFERENCES_DOMAIN,
  PREFERENCES_PLIST,
  USER_WORKSPACES_KEY
} from './proPresenterConstants';
import { normalizeFilePath, pathFromFileUrl, samePath, toPreferencePath } from './pathUtils';
import { runCommand } from './shell';

export interface WorkspaceRegistryEntry {
  name?: string;
  minimumRequiredProPresenterVersion?: string;
  isActive?: boolean;
  url?: string;
  [key: string]: unknown;
}

export interface ActiveWorkspaceState {
  applicationShowDirectoryPath?: string;
  registry: WorkspaceRegistryEntry[];
  activeRegistryPath?: string;
  activePath?: string;
}

export function registryEntryPath(entry: WorkspaceRegistryEntry): string | undefined {
  return pathFromFileUrl(entry.url);
}

export async function readApplicationShowDirectory(): Promise<string | undefined> {
  try {
    const { stdout } = await runCommand('defaults', [
      'read',
      PREFERENCES_DOMAIN,
      APPLICATION_SHOW_DIRECTORY_KEY
    ]);
    const value = stdout.trim();
    return value ? normalizeFilePath(value) : undefined;
  } catch {
    return undefined;
  }
}

export async function readWorkspaceRegistry(): Promise<WorkspaceRegistryEntry[]> {
  try {
    await stat(PREFERENCES_PLIST);
  } catch {
    return [];
  }

  const { stdout } = await runCommand('plutil', [
    '-extract',
    USER_WORKSPACES_KEY,
    'raw',
    '-o',
    '-',
    PREFERENCES_PLIST
  ]);

  const base64Value = stdout.trim();
  if (!base64Value) {
    return [];
  }

  const json = Buffer.from(base64Value, 'base64').toString('utf8');
  const parsed: unknown = JSON.parse(json);

  if (!Array.isArray(parsed)) {
    throw new Error('ProPresenter userWorkspaces preference is not an array.');
  }

  return parsed.filter((entry): entry is WorkspaceRegistryEntry => {
    return Boolean(entry) && typeof entry === 'object';
  });
}

export async function readActiveWorkspaceState(): Promise<ActiveWorkspaceState> {
  const [applicationShowDirectoryPath, registry] = await Promise.all([
    readApplicationShowDirectory(),
    readWorkspaceRegistry()
  ]);

  const activeRegistryEntry = registry.find((entry) => entry.isActive === true);
  const activeRegistryPath = registryEntryPath(activeRegistryEntry ?? {});

  return {
    applicationShowDirectoryPath,
    registry,
    activeRegistryPath,
    activePath: activeRegistryPath ?? applicationShowDirectoryPath
  };
}

export async function writeActiveWorkspace(targetPath: string): Promise<void> {
  const normalizedTarget = normalizeFilePath(targetPath);
  const registry = await readWorkspaceRegistry();

  if (registry.length === 0) {
    throw new Error('The ProPresenter workspace registry is empty or missing.');
  }

  const hasTarget = registry.some((entry) => samePath(registryEntryPath(entry), normalizedTarget));
  if (!hasTarget) {
    throw new Error('The selected workspace is not present in the ProPresenter registry.');
  }

  const updatedRegistry = registry.map((entry) => ({
    ...entry,
    isActive: samePath(registryEntryPath(entry), normalizedTarget)
  }));

  const activeCount = updatedRegistry.filter((entry) => entry.isActive === true).length;
  if (activeCount !== 1) {
    throw new Error(`Expected exactly one active workspace after update, got ${activeCount}.`);
  }

  const registryHex = Buffer.from(JSON.stringify(updatedRegistry), 'utf8').toString('hex');

  await runCommand('defaults', [
    'write',
    PREFERENCES_DOMAIN,
    APPLICATION_SHOW_DIRECTORY_KEY,
    '-string',
    toPreferencePath(normalizedTarget)
  ]);

  await runCommand('defaults', [
    'write',
    PREFERENCES_DOMAIN,
    USER_WORKSPACES_KEY,
    '-data',
    registryHex
  ]);

  await runCommand('defaults', ['synchronize', PREFERENCES_DOMAIN]).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 150));

  const readback = await readActiveWorkspaceState();

  if (!samePath(readback.applicationShowDirectoryPath, normalizedTarget)) {
    throw new Error('Readback failed: applicationShowDirectory did not match the selection.');
  }

  if (!samePath(readback.activeRegistryPath, normalizedTarget)) {
    throw new Error('Readback failed: userWorkspaces active entry did not match the selection.');
  }
}
