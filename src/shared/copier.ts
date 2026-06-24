/*
 * Shared types and category catalog for the ProPresenter workspace settings
 * copier. This module is dependency-free (no Node/Electron imports) so it can be
 * imported from the main process, the preload bridge, and the renderer alike.
 *
 * See docs/propresenter-workspace-settings-copier.md for the full design.
 */

export type CopierCategoryId = 'screens' | 'looks' | 'macros' | 'props' | 'messages' | 'timers';

export interface CopierCategory {
  id: CopierCategoryId;
  label: string;
  /** The `Configuration/` file this category maps to. */
  file: string;
  /** How reliably the file was observed in real ProPresenter exports. */
  confidence: 'high' | 'low';
  description: string;
}

/**
 * Conservative category → file mapping observed in a ProPresenter "sync" export
 * (and confirmed against the `ProPresenter Sync/` sample in this repo). Only
 * these files are ever read or written; everything else in `Configuration/` is
 * left untouched.
 */
export const COPIER_CATEGORIES: CopierCategory[] = [
  {
    id: 'screens',
    label: 'Screen configuration',
    file: 'Workspace',
    confidence: 'high',
    description: 'Audience & stage screens, switchers, resolutions.'
  },
  {
    id: 'looks',
    label: 'Looks',
    file: 'Looks',
    confidence: 'low',
    description: 'Often absent from exports — check the preview.'
  },
  {
    id: 'macros',
    label: 'Macros',
    file: 'Macros',
    confidence: 'high',
    description: 'Saved macros.'
  },
  {
    id: 'props',
    label: 'Props',
    file: 'Props',
    confidence: 'high',
    description: 'Prop definitions.'
  },
  {
    id: 'messages',
    label: 'Messages',
    file: 'Messages',
    confidence: 'high',
    description: 'Message templates.'
  },
  {
    id: 'timers',
    label: 'Timers',
    file: 'Timers',
    confidence: 'high',
    description: 'Timer definitions.'
  }
];

/** Result of scanning a folder the admin picked as a source or target. */
export interface CopierFolderScan {
  /** The path the admin actually selected (normalized). */
  pickedPath: string;
  /** Resolved `Configuration/` folder, or null when none was found. */
  configurationPath: string | null;
  hasConfiguration: boolean;
  /** Category ids whose mapped file is present in this folder. */
  matched: CopierCategoryId[];
  /** Non-noise file names found in the `Configuration/` folder (sorted). */
  files: string[];
}

export interface CopierCopyRequest {
  sourcePath: string;
  targetPaths: string[];
  categories: CopierCategoryId[];
}

export type CopierSkipReason = 'no-source-file' | 'no-target-file';

export interface CopierSkippedCategory {
  category: CopierCategoryId;
  reason: CopierSkipReason;
}

export interface CopierTargetOutcome {
  /** The path the admin selected for this target (normalized). */
  targetPath: string;
  configurationPath: string | null;
  /** Where the pre-copy backup of `Configuration/` was written (null if nothing copied). */
  backupPath: string | null;
  copied: CopierCategoryId[];
  skipped: CopierSkippedCategory[];
  error?: string;
}

export interface CopierCopyResult {
  outcomes: CopierTargetOutcome[];
}
