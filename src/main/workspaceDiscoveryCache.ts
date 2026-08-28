import { app } from 'electron';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ProPresenterStatus, Workspace } from '../shared/types';
import type { WorkspaceScanResult } from './workspaceScanner';

const CACHE_VERSION = 1;

export interface WorkspaceDiscoveryCache {
  version: typeof CACHE_VERSION;
  refreshedAt: string;
  scan: WorkspaceScanResult;
  proPresenter: ProPresenterStatus;
}

function cachePath(): string {
  return join(app.getPath('userData'), 'workspace-discovery-cache.json');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isWorkspace(value: unknown): value is Workspace {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.key === 'string' &&
    typeof value.name === 'string' &&
    typeof value.path === 'string' &&
    typeof value.isActive === 'boolean' &&
    typeof value.isPinned === 'boolean' &&
    (value.source === 'registry' || value.source === 'folder') &&
    typeof value.isCustomized === 'boolean'
  );
}

function isScanResult(value: unknown): value is WorkspaceScanResult {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.workspaceRoot === 'string' &&
    typeof value.isCustomWorkspaceRoot === 'boolean' &&
    optionalString(value.activeWorkspaceId) &&
    optionalString(value.activeWorkspaceName) &&
    Array.isArray(value.workspaces) &&
    value.workspaces.every(isWorkspace) &&
    Array.isArray(value.errors) &&
    value.errors.every((error) => typeof error === 'string')
  );
}

function isProPresenterStatus(value: unknown): value is ProPresenterStatus {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.installed === 'boolean' &&
    typeof value.running === 'boolean' &&
    optionalString(value.appPath) &&
    optionalString(value.error)
  );
}

export function parseWorkspaceDiscoveryCache(raw: string): WorkspaceDiscoveryCache | undefined {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      return undefined;
    }

    if (
      parsed.version !== CACHE_VERSION ||
      typeof parsed.refreshedAt !== 'string' ||
      !Number.isFinite(Date.parse(parsed.refreshedAt)) ||
      !isScanResult(parsed.scan) ||
      !isProPresenterStatus(parsed.proPresenter)
    ) {
      return undefined;
    }

    return parsed as unknown as WorkspaceDiscoveryCache;
  } catch {
    return undefined;
  }
}

export async function readWorkspaceDiscoveryCache(): Promise<
  WorkspaceDiscoveryCache | undefined
> {
  try {
    return parseWorkspaceDiscoveryCache(await readFile(cachePath(), 'utf8'));
  } catch {
    return undefined;
  }
}

export async function writeWorkspaceDiscoveryCache(
  scan: WorkspaceScanResult,
  proPresenter: ProPresenterStatus
): Promise<void> {
  // A transient permission or disconnected-volume failure must not replace the
  // last list that was known to be valid.
  if (scan.errors.length > 0) {
    return;
  }

  const path = cachePath();
  const temporaryPath = `${path}.tmp`;
  const cache: WorkspaceDiscoveryCache = {
    version: CACHE_VERSION,
    refreshedAt: new Date().toISOString(),
    scan,
    proPresenter
  };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(temporaryPath, `${JSON.stringify(cache)}\n`, 'utf8');
  await rename(temporaryPath, path);
}
