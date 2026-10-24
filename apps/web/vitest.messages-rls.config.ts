import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Actual SQL lane: no web setup mocks or database URL overrides.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@interdomestik/database': path.resolve(__dirname, '../../packages/database/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/actions/messages/audit.rls.integration.test.ts'],
    maxWorkers: 1,
    fileParallelism: false,
  },
});
