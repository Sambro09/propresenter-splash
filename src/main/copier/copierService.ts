/*
 * Filesystem glue for the workspace settings copier. Runs in the Electron main
 * process: it resolves a picked folder to its `Configuration/` directory, scans
 * the inventory, makes a backup-first copy, and writes the selected category
 * files atomically. Nothing ever leaves the local machine.
 */
import { BrowserWindow, dialog, type OpenDialogOptions } from 'electron';
import { copyFile, cp, readdir, rename, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type {
  CopierCategoryId,
  CopierCopyRequest,
  CopierCopyResult,
  CopierFolderScan,
  CopierSkippedCategory,
  CopierTargetOutcome
} from '../../shared/copier';
import { logError, logInfo } from '../logger';
import { normalizeFilePath } from '../pathUtils';
import {
  backupFolderName,
  configurationFiles,
  fileForCategory,
  matchedCategories,
  planCopy
} from './categories';

const CONFIGURATION_DIRNAME = 'Configuration';

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Accept either a sync root that contains a `Configuration/` folder, a
 * `Configuration/` folder chosen directly, or any folder that already holds the
 * mapped settings files. Returns null when none of those apply.
 */
async function resolveConfigurationPath(pickedPath: string): Promise<string | null> {
  const root = normalizeFilePath(pickedPath);

  const nested = join(root, CONFIGURATION_DIRNAME);
  if (await isDirectory(nested)) {
    return nested;
  }

  if (basename(root).toLowerCase() === CONFIGURATION_DIRNAME.toLowerCase()) {
    return root;
  }

  try {
    const names = await readdir(root);
    if (matchedCategories(names).length > 0) {
      return root;
    }
  } catch {
    // Unreadable folder — treat as "no Configuration found".
  }

  return null;
}

export async function scanCopierFolder(pickedPath: string): Promise<CopierFolderScan> {
  const normalizedPick = normalizeFilePath(pickedPath);
  const configurationPath = await resolveConfigurationPath(normalizedPick);
  if (!configurationPath) {
    return {
      pickedPath: normalizedPick,
      configurationPath: null,
      hasConfiguration: false,
      matched: [],
      files: []
    };
  }

  let names: string[] = [];
  try {
    const entries = await readdir(configurationPath, { withFileTypes: true });
    names = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  } catch (error) {
    void logError('Could not read Configuration folder', { configurationPath, error });
  }

  return {
    pickedPath: normalizedPick,
    configurationPath,
    hasConfiguration: true,
    matched: matchedCategories(names),
    files: configurationFiles(names)
  };
}

export async function pickCopierFolder(
  parentWindow: BrowserWindow | undefined
): Promise<CopierFolderScan | null> {
  const dialogOptions: OpenDialogOptions = {
    title: 'Choose ProPresenter Sync Folder',
    buttonLabel: 'Choose',
    properties: ['openDirectory']
  };

  const result = parentWindow
    ? await dialog.showOpenDialog(parentWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  const selected = result.filePaths[0];
  if (result.canceled || !selected) {
    return null;
  }

  return scanCopierFolder(selected);
}

function backupTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

async function uniqueBackupPath(configurationPath: string): Promise<string> {
  const parent = dirname(configurationPath);
  const base = backupFolderName(backupTimestamp(new Date()));
  let candidate = join(parent, base);
  let counter = 2;
  while (await isDirectory(candidate)) {
    candidate = join(parent, `${base}-${counter}`);
    counter += 1;
  }
  return candidate;
}

async function copyToTarget(
  source: CopierFolderScan,
  targetPickedPath: string,
  categories: CopierCategoryId[]
): Promise<CopierTargetOutcome> {
  const target = await scanCopierFolder(targetPickedPath);
  const base: CopierTargetOutcome = {
    targetPath: target.pickedPath,
    configurationPath: target.configurationPath,
    backupPath: null,
    copied: [],
    skipped: []
  };

  if (!source.configurationPath) {
    return { ...base, error: 'The source folder has no Configuration folder.' };
  }
  if (!target.configurationPath) {
    return { ...base, error: 'This folder has no Configuration folder.' };
  }

  const toCopy: CopierCategoryId[] = [];
  const skipped: CopierSkippedCategory[] = [];
  for (const entry of planCopy(categories, source.matched, target.matched)) {
    if (entry.action === 'copy') {
      toCopy.push(entry.category);
    } else {
      skipped.push({ category: entry.category, reason: entry.action });
    }
  }

  if (toCopy.length === 0) {
    return { ...base, skipped };
  }

  // Back up the entire Configuration folder before touching anything, so every
  // run stays reversible.
  let backupPath: string;
  try {
    backupPath = await uniqueBackupPath(target.configurationPath);
    await cp(target.configurationPath, backupPath, { recursive: true });
  } catch (error) {
    void logError('Could not back up target Configuration folder', {
      configurationPath: target.configurationPath,
      error
    });
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      skipped,
      error: `Could not create a backup, so nothing was copied. ${detail}`
    };
  }

  const copied: CopierCategoryId[] = [];
  for (const category of toCopy) {
    const file = fileForCategory(category);
    const from = join(source.configurationPath, file);
    const to = join(target.configurationPath, file);
    const temp = `${to}.copier-tmp`;
    try {
      await copyFile(from, temp);
      await rename(temp, to);
      copied.push(category);
    } catch (error) {
      void logError('Could not copy a settings file', { file, from, to, error });
      const detail = error instanceof Error ? error.message : String(error);
      return {
        ...base,
        backupPath,
        copied,
        skipped,
        error:
          `Copied ${copied.length} of ${toCopy.length} file(s); failed on "${file}". ` +
          `${detail} The backup is at ${backupPath}.`
      };
    }
  }

  return { ...base, backupPath, copied, skipped };
}

export async function runCopier(request: CopierCopyRequest): Promise<CopierCopyResult> {
  const source = await scanCopierFolder(request.sourcePath);
  await logInfo('Workspace settings copy started', {
    source: source.configurationPath,
    targets: request.targetPaths,
    categories: request.categories
  });

  const outcomes: CopierTargetOutcome[] = [];
  for (const targetPath of request.targetPaths) {
    outcomes.push(await copyToTarget(source, targetPath, request.categories));
  }

  await logInfo('Workspace settings copy finished', {
    outcomes: outcomes.map((outcome) => ({
      target: outcome.configurationPath,
      copied: outcome.copied,
      error: outcome.error
    }))
  });

  return { outcomes };
}
