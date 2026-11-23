import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [react() as any],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@interdomestik/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@interdomestik/database': path.resolve(__dirname, '../../packages/database/src'),
      '@interdomestik/domain-ai': path.resolve(__dirname, '../../packages/domain-ai/src'),
      '@interdomestik/domain-membership-billing': path.resolve(
        __dirname,
        '../../packages/domain-membership-billing/src'
      ),
      '@interdomestik/domain-referrals': path.resolve(
        __dirname,
        '../../packages/domain-referrals/src'
      ),
      'server-only': path.resolve(__dirname, './src/test/__mocks__/server-only.ts'),
    },
  },
  test: {
    // The opt-in identity and recovery contracts snapshot and restore the same tenant's switch rows.
    fileParallelism:
      process.env.REQUIRE_PILOT_IDENTITY_CONTRACT !== '1' &&
      process.env.REQUIRE_DIFFERENT_EMAIL_RECOVERY_CONTRACT !== '1',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'dist', '.next'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: ['node_modules/', 'src/test/', '**/*.d.ts', '**/*.config.*', '**/types/**'],
    },
    env: {
      ...(process.env.DATABASE_URL === undefined && {
        DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/interdomestik_test',
      }),
    },
  },
});
