/*
 * Minimal `electron` stand-in for unit tests (see vitest.config.ts alias).
 * Only the surface imported by modules under test needs to exist.
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
