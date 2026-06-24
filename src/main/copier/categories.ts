/*
 * Pure category matching and copy-planning helpers for the workspace settings
 * copier. No Node/Electron imports here so the logic can be unit-tested in
 * isolation (see categories.test.ts).
 */
import {
  COPIER_CATEGORIES,
  type CopierCategory,
  type CopierCategoryId,
  type CopierSkipReason
} from '../../shared/copier';

/** macOS sidecar/noise files that must never be matched, copied, or compared. */
export function isNoiseFile(name: string): boolean {
  return name === '.DS_Store' || name.startsWith('._');
}

/** Real (non-noise) Configuration file names, sorted for stable display/compare. */
export function configurationFiles(names: string[]): string[] {
  return names.filter((name) => !isNoiseFile(name)).sort((a, b) => a.localeCompare(b));
}

export function categoryById(id: CopierCategoryId): CopierCategory {
  const category = COPIER_CATEGORIES.find((entry) => entry.id === id);
  if (!category) {
    throw new Error(`Unknown copier category: ${id}`);
  }
  return category;
}

export function fileForCategory(id: CopierCategoryId): string {
  return categoryById(id).file;
}

/**
 * Categories whose mapped file is present among the given file names. Matching is
 * case-insensitive (macOS file systems are), anchored to the exact Configuration
 * file name so unrelated files never match.
 */
export function matchedCategories(names: string[]): CopierCategoryId[] {
  const present = new Set(
    names.filter((name) => !isNoiseFile(name)).map((name) => name.toLowerCase())
  );
  return COPIER_CATEGORIES.filter((category) => present.has(category.file.toLowerCase())).map(
    (category) => category.id
  );
}

export interface PlannedCategory {
  category: CopierCategoryId;
  action: 'copy' | CopierSkipReason;
}

/**
 * Decide, per selected category, whether it can be copied from source to target.
 * Replace-only: a category copies only when BOTH the source and the target
 * already contain its file. The tool never invents a path in the target.
 */
export function planCopy(
  selected: CopierCategoryId[],
  sourceMatched: CopierCategoryId[],
  targetMatched: CopierCategoryId[]
): PlannedCategory[] {
  const inSource = new Set(sourceMatched);
  const inTarget = new Set(targetMatched);
  return selected.map((category) => {
    if (!inSource.has(category)) {
      return { category, action: 'no-source-file' };
    }
    if (!inTarget.has(category)) {
      return { category, action: 'no-target-file' };
    }
    return { category, action: 'copy' };
  });
}

/** Stable backup folder name for a given timestamp string (e.g. `20260624-141530`). */
export function backupFolderName(timestamp: string): string {
  return `Configuration.backup-${timestamp}`;
}
