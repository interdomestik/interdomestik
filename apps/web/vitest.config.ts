import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react() as any],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', '.next'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['node_modules/', 'src/test/', '**/*.d.ts', '**/*.config.*', '**/types/**'],
    },
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@interdomestik/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@interdomestik/database': path.resolve(__dirname, '../../packages/database/src'),
    },
  },
});
