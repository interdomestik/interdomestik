import { defineConfig, devices } from '@playwright/test';

const PORT = 3000;
const BASE_HOST = 'localhost';
const BIND_HOST = '127.0.0.1';
const BASE_URL = `http://${BASE_HOST}:${PORT}`;

export default defineConfig({
  testDir: './e2e',
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
  webServer: {
    // E2E runs against a production server (Next `start`) for artifact consistency.
    // Orchestration (build/migrate/seed) is explicit and performed outside Playwright.
    command: `pnpm exec next start --hostname ${BIND_HOST} --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 300 * 1000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NEXT_PUBLIC_APP_URL: BASE_URL,
      BETTER_AUTH_URL: BASE_URL,
      INTERDOMESTIK_AUTOMATED: '1',
      PLAYWRIGHT: '1',
      // Disable Sentry noise in E2E (placeholder DSNs cause console errors that break tests).
      SENTRY_DSN: '',
      NEXT_PUBLIC_SENTRY_DSN: '',
      // Disable rate limiting completely by unsetting Upstash vars
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
      // Required for Paddle webhook signature validation tests.
      ...(process.env.PADDLE_WEBHOOK_SECRET_KEY
        ? { PADDLE_WEBHOOK_SECRET_KEY: process.env.PADDLE_WEBHOOK_SECRET_KEY }
        : {}),
    },
  },
});
