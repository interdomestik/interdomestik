import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PORT = 3000;
const BASE_HOST = '127.0.0.1';
const BIND_HOST = '127.0.0.1';
const BASE_URL = `http://${BASE_HOST}:${PORT}`;
// Use nip.io to avoid /etc/hosts dependency in CI
const KS_HOST = process.env.KS_HOST ?? `ks.${BIND_HOST}.nip.io:${PORT}`;
const MK_HOST = process.env.MK_HOST ?? `mk.${BIND_HOST}.nip.io:${PORT}`;
const AL_HOST = process.env.AL_HOST ?? `al.${BIND_HOST}.nip.io:${PORT}`;
const PILOT_HOST = process.env.PILOT_HOST ?? `pilot.${BIND_HOST}.nip.io:${PORT}`;
const WEB_SERVER_SCRIPT = path.resolve(__dirname, '../../scripts/e2e-webserver.sh');

function tenantBaseUrl(hostWithPort: string, locale: string): string {
  return `http://${hostWithPort}/${locale}`;
}

const AUTH_DIR = path.resolve(__dirname, './e2e/.auth');
const KS_MEMBER_STATE = path.join(AUTH_DIR, 'ks', 'member.json');
const MK_MEMBER_STATE = path.join(AUTH_DIR, 'mk', 'member.json');

const GATE_STATE_DIR = path.resolve(__dirname, '.playwright', 'state');
const GATE_KS_STATE = path.join(GATE_STATE_DIR, 'ks.json');
const GATE_MK_STATE = path.join(GATE_STATE_DIR, 'mk.json');
const TEST_RESULTS_DIR = path.resolve(__dirname, 'test-results');
const JUNIT_REPORT_FILE = path.join(TEST_RESULTS_DIR, 'junit.xml');
const JSON_REPORT_FILE = path.join(TEST_RESULTS_DIR, 'report.json');

const GATE_DEFAULT_MATCH = ['gate/**/*.spec.ts'];
const PILOT_MATRIX_MATCH_GUARD = '/pilot/';
const RUNNING_PILOT_MATRIX = process.argv.some(arg => arg.includes(PILOT_MATRIX_MATCH_GUARD));
const GATE_KS_PILOT_MATCH = ['pilot/scenario-01-ks-e2e.spec.ts'];
const GATE_MK_PILOT_MATCH = [
  'pilot/c2-02-cross-tenant-artifact-isolation.spec.ts',
  'pilot/c2-03-cross-tenant-write-isolation.spec.ts',
  'pilot/c2-04-cross-tenant-staff-member-write-isolation.spec.ts',
];
const GATE_AL_PILOT_MATCH = ['pilot/c2-03-cross-tenant-write-isolation.spec.ts'];
const NOOP_TEST_MATCH = ['__never__/__none__.spec.ts'];

const GATE_KS_TEST_MATCH = RUNNING_PILOT_MATRIX
  ? [...GATE_DEFAULT_MATCH, ...GATE_KS_PILOT_MATCH]
  : GATE_DEFAULT_MATCH;
const GATE_MK_TEST_MATCH = RUNNING_PILOT_MATRIX
  ? [...GATE_DEFAULT_MATCH, ...GATE_MK_PILOT_MATCH]
  : GATE_DEFAULT_MATCH;
const GATE_AL_TEST_MATCH = RUNNING_PILOT_MATRIX ? GATE_AL_PILOT_MATCH : NOOP_TEST_MATCH;

function requireState(statePath: string) {
  if (fs.existsSync(statePath)) return;
  throw new Error(
    [
      `Missing storageState: ${statePath}`,
      'Generate it with:',
      '  pnpm --filter @interdomestik/web test:e2e -- e2e/setup.state.spec.ts --project=setup-ks --project=setup-mk',
    ].join('\n')
  );
}

// Fail fast when running the fast gate lanes locally/CI.
// This prevents confusing auth redirect cascades.
if (process.env.PW_FAST_GATES === '1') {
  requireState(GATE_KS_STATE);
  requireState(GATE_MK_STATE);
}

process.env.NEXT_PUBLIC_APP_URL = BASE_URL;
process.env.BETTER_AUTH_URL = BASE_URL;

// Manual env loading to satisfy track:audit (forbidden patterns avoided)
const envPaths = [
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../.env.local'),
  path.resolve(__dirname, '.env'),
  path.resolve(__dirname, '.env.local'),
];

function loadEnvManual(envPath: string) {
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...values] = trimmed.split('=');
    if (key && values.length > 0) {
      const val = values.join('=').trim().replace(/^['"]/, '').replace(/['"]$/, '');
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

envPaths.forEach(loadEnvManual);

fs.mkdirSync(TEST_RESULTS_DIR, { recursive: true });

if (!process.env.DATABASE_URL) {
  console.log('⚠️ DATABASE_URL not found, using default local fallback.');
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : '50%',
  reporter: process.env.CI
    ? [
        ['html'],
        ['list'],
        ['junit', { outputFile: JUNIT_REPORT_FILE }],
        ['json', { outputFile: JSON_REPORT_FILE }],
      ]
    : [
        ['list'],
        ['junit', { outputFile: JUNIT_REPORT_FILE }],
        ['json', { outputFile: JSON_REPORT_FILE }],
      ],
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
    // FAST GATE LANES (No deps)
    // - Runs only e2e/gate/**
    // - Does not generate state
    // - Uses prebuilt storageState under .playwright/state
    // Enable fail-fast state validation by setting PW_FAST_GATES=1.
    // ═══════════════════════════════════════════════════════════════════════════
    {
      name: 'gate-ks-sq',
      testMatch: GATE_KS_TEST_MATCH,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: tenantBaseUrl(KS_HOST, 'sq'),
        extraHTTPHeaders: {
          'x-forwarded-host': KS_HOST,
        },
        storageState: GATE_KS_STATE,
        actionTimeout: 20 * 1000,
        navigationTimeout: 60 * 1000,
      },
    },
    {
      name: 'gate-mk-mk',
      testMatch: GATE_MK_TEST_MATCH,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: tenantBaseUrl(MK_HOST, 'mk'),
        extraHTTPHeaders: {
          'x-forwarded-host': MK_HOST,
        },
        storageState: GATE_MK_STATE,
        actionTimeout: 20 * 1000,
        navigationTimeout: 60 * 1000,
      },
    },
    {
      name: 'gate-al-sq',
      testMatch: GATE_AL_TEST_MATCH,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: tenantBaseUrl(AL_HOST, 'sq'),
        extraHTTPHeaders: {
          'x-forwarded-host': AL_HOST,
        },
        actionTimeout: 20 * 1000,
        navigationTimeout: 60 * 1000,
      },
    },

    // ═══════════════════════════════════════════════════════════════════════════
    // SETUP PROJECTS - Generate auth states per tenant
    // ═══════════════════════════════════════════════════════════════════════════
    {
      name: 'setup-ks',
      testMatch: /setup\.state\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: tenantBaseUrl(KS_HOST, 'sq'),
        extraHTTPHeaders: {
          'x-forwarded-host': KS_HOST,
        },
      },
    },
    {
      name: 'setup-mk',
      testMatch: /setup\.state\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: tenantBaseUrl(MK_HOST, 'mk'),
        extraHTTPHeaders: {
          'x-forwarded-host': MK_HOST,
        },
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
        baseURL: tenantBaseUrl(KS_HOST, 'sq'),
        extraHTTPHeaders: {
          'x-forwarded-host': KS_HOST,
        },
        storageState: KS_MEMBER_STATE,
      },
      testIgnore: [/setup\.state\.spec\.ts/, /claim-resolver-isolation\.spec\.ts/], // Ignore MK tests
    },
    {
      name: 'mk-mk',
      dependencies: ['setup-mk'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: tenantBaseUrl(MK_HOST, 'mk'),
        extraHTTPHeaders: {
          'x-forwarded-host': MK_HOST,
        },
        storageState: MK_MEMBER_STATE,
      },
      // Mirror the ks-sq lane: run the normal E2E suite against the MK tenant + mk locale.
      testIgnore: [/setup\.state\.spec\.ts/],
    },
    {
      name: 'pilot-mk',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: tenantBaseUrl(PILOT_HOST, 'en'),
        extraHTTPHeaders: {
          'x-forwarded-host': PILOT_HOST,
        },
      },
      testMatch: ['pilot/**/*.spec.ts'],
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
        baseURL: tenantBaseUrl(KS_HOST, 'sq'),
        extraHTTPHeaders: {
          'x-forwarded-host': KS_HOST,
        },
        storageState: KS_MEMBER_STATE,
        actionTimeout: 20 * 1000,
        navigationTimeout: 60 * 1000,
      },
    },
  ],
  webServer: {
    // E2E runs against a production server (Next `start`) for artifact consistency.
    // Orchestration (build/migrate/seed) is explicit and performed outside Playwright.
    command: `bash ${WEB_SERVER_SCRIPT}`,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: process.env.PW_REUSE_SERVER === '1',
    timeout: 300 * 1000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOSTNAME: BIND_HOST,
      NODE_OPTIONS: '--dns-result-order=ipv4first',
      NEXT_PUBLIC_APP_URL: BASE_URL,
      BETTER_AUTH_URL: BASE_URL,
      BETTER_AUTH_TRUSTED_ORIGINS: `http://127.0.0.1:3000,http://localhost:3000,http://${KS_HOST},http://${MK_HOST},http://${AL_HOST},http://${PILOT_HOST},${BASE_URL}`,
      INTERDOMESTIK_AUTOMATED: '1',
      PLAYWRIGHT: '1',
      NEXT_PUBLIC_BILLING_TEST_MODE: '1',
      // Disable Sentry noise in E2E (placeholder DSNs cause console errors that break tests).
      SENTRY_DSN: '',
      NEXT_PUBLIC_SENTRY_DSN: '',
      // Disable rate limiting completely by unsetting Upstash vars
      UPSTASH_REDIS_REST_URL: '',
      UPSTASH_REDIS_REST_TOKEN: '',
      // Explicitly pass the secret for the standalone server
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? '',
      // Required for Paddle webhook signature validation tests.
      ...(process.env.PADDLE_WEBHOOK_SECRET_KEY
        ? { PADDLE_WEBHOOK_SECRET_KEY: process.env.PADDLE_WEBHOOK_SECRET_KEY }
        : {}),
    },
  },
});
