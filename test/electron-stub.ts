/*
 * Minimal `electron` stand-in for unit tests (see vitest.config.ts alias).
 * Only the surface the copier service and logger import at module load time
 * needs to exist; tests never open a real dialog or window.
 */
import { tmpdir } from 'node:os';

export const app = {
  getPath: (): string => tmpdir()
};

export class BrowserWindow {}

export const dialog = {
  showOpenDialog: async (): Promise<{ canceled: boolean; filePaths: string[] }> => ({
    canceled: true,
    filePaths: []
  })
};
