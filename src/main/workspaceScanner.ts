import { readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { Workspace } from '../shared/types';
import { DEFAULT_WORKSPACE_ROOT } from './proPresenterConstants';
import {
  readActiveWorkspaceState,
  registryEntryPath,
  type WorkspaceRegistryEntry
} from './activeWorkspace';
import { normalizeFilePath, samePath } from './pathUtils';

export interface WorkspaceScanResult {
  workspaceRoot: string;
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
  const workspaceRoot = DEFAULT_WORKSPACE_ROOT;
  const directories = new Set<string>();

  let activeState = await readActiveWorkspaceState().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Could not read ProPresenter workspace preferences: ${message}`);
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
      return {
        id: directoryPath,
        name: registryName(registryEntry, directoryPath),
        path: directoryPath,
        isActive: samePath(activeState.activePath, directoryPath),
        source: registryEntry ? 'registry' : 'folder'
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));

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
    activeWorkspaceId,
    activeWorkspaceName,
    workspaces,
    errors
  };
}
