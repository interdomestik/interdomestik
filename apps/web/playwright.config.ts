import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from root (prioritize .env.local)
dotenv.config({ path: path.resolve(__dirname, '../../.env.local'), quiet: true });
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });

const PORT = 3000;
const BASE_HOST = '127.0.0.1';
const BIND_HOST = '127.0.0.1';
const BASE_URL = `http://${BASE_HOST}:${PORT}`;
const KS_HOST = process.env.KS_HOST ?? `ks.localhost:${PORT}`;
const MK_HOST = process.env.MK_HOST ?? `mk.localhost:${PORT}`;
const WEB_SERVER_SCRIPT = path.resolve(__dirname, '../../scripts/e2e-webserver.sh');

process.env.NEXT_PUBLIC_APP_URL = BASE_URL;
process.env.BETTER_AUTH_URL = BASE_URL;

// If the caller runs Playwright with `--project=ks-sq` (or `mk-mk`) but forgets
// to set `PLAYWRIGHT_LOCALE`, default it here so URL helpers (e.g. e2e/routes.ts)
// generate the right locale-prefixed paths.
if (!process.env.PLAYWRIGHT_LOCALE) {
  const argv = process.argv.join(' ');
  if (argv.includes('ks-sq') || argv.includes('setup-ks') || argv.includes('smoke')) {
    process.env.PLAYWRIGHT_LOCALE = 'sq';
  } else if (argv.includes('mk-mk') || argv.includes('setup-mk')) {
    process.env.PLAYWRIGHT_LOCALE = 'mk';
  }
}

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
    contextOptions: {
      reducedMotion: 'reduce',
    },
  },
  projects: [
    // ═══════════════════════════════════════════════════════════════════════════
    // SETUP PROJECTS - Generate auth states per tenant
    // ═══════════════════════════════════════════════════════════════════════════
    {
      name: 'setup-ks',
      testMatch: /setup\.state\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://${KS_HOST}/sq`,
      },
    },
    {
      name: 'setup-mk',
      testMatch: /setup\.state\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://${MK_HOST}/mk`,
      },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // TEST LANES - Isolated by Tenant + Locale
    // ═══════════════════════════════════════════════════════════════════════════
    {
      name: 'ks-sq',
      dependencies: ['setup-ks'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://${KS_HOST}/sq`,
      },
      testIgnore: [/setup\.state\.spec\.ts/, /claim-resolver-isolation\.spec\.ts/], // Ignore MK tests
    },
    {
      name: 'mk-mk',
      dependencies: ['setup-mk'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://${MK_HOST}/mk`,
      },
      // Mirror the ks-sq lane: run the normal E2E suite against the MK tenant + mk locale.
      testIgnore: [/setup\.state\.spec\.ts/],
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // SMOKE (Legacy/Cross-Check)
    // ═══════════════════════════════════════════════════════════════════════════
    {
      name: 'smoke',
      dependencies: ['setup-ks'], // Default to KS for general smoke
      testMatch: /.*\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://${KS_HOST}/sq`,
        actionTimeout: 20 * 1000,
        navigationTimeout: 60 * 1000,
      },
    },
  ],
  webServer: {
    // E2E runs against a production server (Next `start`) for artifact consistency.
    // Orchestration (build/migrate/seed) is explicit and performed outside Playwright.
    command: `bash "${WEB_SERVER_SCRIPT}"`,
    url: BASE_URL,
    // Never reuse a stale server by default (prevents origin/env mismatches).
    reuseExistingServer: process.env.PW_REUSE_SERVER === '1' && !process.env.CI,
    timeout: 300 * 1000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOSTNAME: BIND_HOST,
      NODE_OPTIONS: '--dns-result-order=ipv4first',
      NEXT_PUBLIC_APP_URL: BASE_URL,
      BETTER_AUTH_URL: BASE_URL,
      BETTER_AUTH_TRUSTED_ORIGINS: `http://127.0.0.1:3000,http://localhost:3000,http://${KS_HOST},http://${MK_HOST},${BASE_URL}`,
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
