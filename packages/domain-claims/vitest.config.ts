import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@interdomestik\/database$/,
        replacement: path.resolve(__dirname, '../database/src/index.ts'),
      },
      {
        find: '@interdomestik/domain-ai',
        replacement: path.resolve(__dirname, '../domain-ai/src'),
      },
      {
        find: /^nodemailer$/,
        replacement: path.resolve(__dirname, '../domain-communications/node_modules/nodemailer'),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: ['node_modules/', 'src/test/', '**/*.d.ts'],
    },
  },
});
