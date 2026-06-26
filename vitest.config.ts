import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Main-process modules import Electron at module load time. Tests run in plain
// Node, so alias `electron` to a tiny stub without a real Electron runtime.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true
  },
  resolve: {
    alias: {
      electron: fileURLToPath(new URL('./test/electron-stub.ts', import.meta.url))
    }
  }
});
