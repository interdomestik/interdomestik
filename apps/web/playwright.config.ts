import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const HOST = process.env.PLAYWRIGHT_HOST ?? 'localhost';
const BASE_URL = `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    // Use webpack dev server (more stable for Playwright) instead of Turbopack default
    command: 'pnpm exec next dev --webpack --hostname 0.0.0.0 --port 3000',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
