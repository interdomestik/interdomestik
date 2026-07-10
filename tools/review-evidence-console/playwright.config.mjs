import { defineConfig } from '../../apps/web/node_modules/@playwright/test/index.mjs';

export default defineConfig({
  testDir: './tests',
  testMatch: 'fixture-browser.spec.mjs',
  workers: 1,
  use: { headless: true },
});
