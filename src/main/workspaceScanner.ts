import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Workspace } from '../shared/types';
import {
  getWorkspaceDisplayConfig,
  getWorkspaceOverrides,
  getWorkspaceRootConfig
} from './config';
import { logError } from './logger';
import {
  readActiveWorkspaceState,
  registryEntryPath,
  type WorkspaceRegistryEntry
} from './activeWorkspace';
import { normalizeFilePath, samePath } from './pathUtils';

export interface WorkspaceScanResult {
  workspaceRoot: string;
  isCustomWorkspaceRoot: boolean;
  activeWorkspaceId?: string;
  activeWorkspaceName?: string;
  workspaces: Workspace[];
  errors: string[];
}

function registryName(entry: WorkspaceRegistryEntry | undefined, fallbackPath: string): string {
  return entry?.name?.trim() || basename(fallbackPath);
}

export async function scanWorkspaces(): Promise<WorkspaceScanResult> {
  const errors: string[] = [];
  const { workspaceRoot, isCustomWorkspaceRoot } = await getWorkspaceRootConfig();
  const [overrides, displayConfig] = await Promise.all([
    getWorkspaceOverrides(),
    getWorkspaceDisplayConfig()
  ]);
  const pinnedKeys = new Set(displayConfig.pinnedWorkspaceKeys);
  const orderIndex = new Map(
    displayConfig.workspaceOrder.map((workspaceKey, index) => [workspaceKey, index])
  );
  const directories = new Set<string>();

  let activeState = await readActiveWorkspaceState().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Could not read ProPresenter workspace preferences: ${message}`);
    void logError('Could not read ProPresenter workspace preferences', error);
    return {
      registry: [],
      activePath: undefined,
      activeRegistryPath: undefined,
      applicationShowDirectoryPath: undefined
    };
  });

  try {
    const entries = await readdir(workspaceRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        directories.add(normalizeFilePath(join(workspaceRoot, entry.name)));
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Could not read workspace folder: ${message}`);
    void logError('Could not read workspace folder', { workspaceRoot, error });
  }

  for (const entry of activeState.registry) {
    const entryPath = registryEntryPath(entry);
    if (!entryPath || directories.has(entryPath)) {
      continue;
    }

    try {
      const stats = await stat(entryPath);
      if (stats.isDirectory()) {
        directories.add(entryPath);
      }
    } catch {
      // Registry entries can outlive folders; ignore missing paths during scanning.
    }
  }

  const registryByPath = new Map<string, WorkspaceRegistryEntry>();
  for (const entry of activeState.registry) {
    const entryPath = registryEntryPath(entry);
    if (entryPath) {
      registryByPath.set(normalizeFilePath(entryPath), entry);
    }
  }

  const workspaces = [...directories]
    .map((directoryPath): Workspace => {
      const registryEntry = registryByPath.get(directoryPath);
      const override = overrides[directoryPath];
      const effectivePath = override?.path ?? directoryPath;
      const name = override?.name ?? registryName(registryEntry, directoryPath);

      return {
        id: effectivePath,
        key: directoryPath,
        name,
        path: effectivePath,
        isActive: samePath(activeState.activePath, effectivePath),
        isPinned: pinnedKeys.has(directoryPath),
        source: registryEntry ? 'registry' : 'folder',
        isCustomized: Boolean(override)
      };
    })
    .sort((left, right) => {
      const leftOrder = orderIndex.get(left.key);
      const rightOrder = orderIndex.get(right.key);

      if (leftOrder !== undefined && rightOrder !== undefined) {
        return leftOrder - rightOrder;
      }

      if (leftOrder !== undefined) {
        return -1;
      }

      if (rightOrder !== undefined) {
        return 1;
      }

      return left.name.localeCompare(right.name);
    });

  const activeWorkspace = workspaces.find((workspace) => workspace.isActive);
  const activeWorkspaceId =
    activeWorkspace?.id ??
    (activeState.activePath ? normalizeFilePath(activeState.activePath) : undefined);

  const activeWorkspaceName =
    activeWorkspace?.name ??
    activeState.registry.find((entry) => samePath(registryEntryPath(entry), activeState.activePath))
      ?.name;

  return {
    workspaceRoot,
    isCustomWorkspaceRoot,
    activeWorkspaceId,
    activeWorkspaceName,
    workspaces,
    errors
  };
}
