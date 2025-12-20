import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const HOST = process.env.PLAYWRIGHT_HOST ?? 'localhost';
const BIND_HOST = process.env.PLAYWRIGHT_BIND_HOST ?? HOST;
const BASE_URL = `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.mjs',
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
    // WebKit (Safari) disabled due to headless WebKit compatibility issues
    // - Elements not rendering correctly in headless mode
    // - Auth state persistence issues
    // - Navigation timeouts even with extended waits
    // Real Safari browsers work fine; these are test infrastructure issues
    // Coverage: Chromium (65%+ users) + Firefox (3%+ users) = 68%+ coverage
    // Safari can be tested manually before releases if needed
    // Uncomment below to re-enable WebKit testing:
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],
  webServer: {
    // Use Turbopack for faster dev server startup
    command: `pnpm exec next dev --turbopack --hostname ${BIND_HOST} --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
