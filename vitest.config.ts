import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The copier service imports `electron` (for the folder picker) and the logger
// imports `electron`'s `app`. Tests run in plain Node, so alias `electron` to a
// tiny stub that satisfies those imports without a real Electron runtime.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  },
  resolve: {
    alias: {
      electron: fileURLToPath(new URL('./test/electron-stub.ts', import.meta.url))
    }
  }
});
