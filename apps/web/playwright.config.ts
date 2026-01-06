import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const HOST = process.env.PLAYWRIGHT_HOST ?? 'localhost';
const BIND_HOST = process.env.PLAYWRIGHT_BIND_HOST ?? HOST;
const BASE_URL = `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.mjs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : '50%',
  reporter: process.env.CI ? [['html'], ['list']] : [['list']],
  timeout: 60 * 1000,
  snapshotDir: './e2e/snapshots',
  expect: {
    timeout: 5 * 1000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.1,
    },
  },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15 * 1000,
    navigationTimeout: 60 * 1000,
  },
  projects: [
    // ═══════════════════════════════════════════════════════════════════════════
    // SETUP PROJECT - Run first to generate auth states
    // Usage: pnpm exec playwright test --project=setup
    // ═══════════════════════════════════════════════════════════════════════════
    {
      name: 'setup',
      testMatch: /setup\.state\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },

    // Main project - run each spec once by default.
    // Authenticated flows should use e2e/fixtures/auth.fixture.ts, which loads
    // per-role storageState into isolated browser contexts (fast, no UI login).
    {
      name: 'chromium',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /setup\.state\.spec\.ts/,
    },
    {
      name: 'firefox',
      dependencies: ['setup'],
      use: { ...devices['Desktop Firefox'] },
      testIgnore: /setup\.state\.spec\.ts/,
    },
    {
      name: 'webkit',
      dependencies: ['setup'],
      use: { ...devices['Desktop Safari'] },
      testIgnore: /setup\.state\.spec\.ts/,
    },
    {
      name: 'mobile-chrome',
      dependencies: ['setup'],
      use: { ...devices['Pixel 5'] },
      testIgnore: /setup\.state\.spec\.ts/,
    },
  ],
  ...(process.env.PLAYWRIGHT_EXTERNAL_SERVER === '1'
    ? {}
    : {
        webServer: {
          // Build once and run production server to avoid dev manifest corruption during parallel tests.
          command: `pnpm -C ../../packages/database migrate && pnpm exec next build && pnpm exec next start --hostname ${BIND_HOST} --port ${PORT}`,
          url: BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 300 * 1000,
          env: {
            NEXT_PUBLIC_APP_URL: BASE_URL,
            BETTER_AUTH_URL: BASE_URL,
            INTERDOMESTIK_AUTOMATED: '1',
            // Required for Paddle webhook signature validation tests.
            ...(process.env.PADDLE_WEBHOOK_SECRET_KEY
              ? { PADDLE_WEBHOOK_SECRET_KEY: process.env.PADDLE_WEBHOOK_SECRET_KEY }
              : {}),
          },
        },
      }),
});
