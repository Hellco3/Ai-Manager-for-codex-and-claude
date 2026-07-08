import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: resolve(__dirname),
  },
  resolve: {
    alias: {
      '@ai_manager/shared': resolve(__dirname, '../shared/src/index.ts'),
    },
  },
});
