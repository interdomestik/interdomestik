import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@interdomestik/domain-membership-billing': path.resolve(
        __dirname,
        '../domain-membership-billing/src'
      ),
    },
  },
});
