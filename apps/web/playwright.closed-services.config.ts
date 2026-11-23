import { readDisposableTargetClass } from '@interdomestik/database/constants';
import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

// The Mac lane supplies a dedicated seeded database, server port and loopback mail catcher.
const ownerUrl = process.env.E2E_DATABASE_URL?.trim();
if (!ownerUrl) {
  throw new Error('Closed services require E2E_DATABASE_URL for a dedicated loopback database');
}

// The built server derives its restricted role from the owner URL. Fixtures still need to read
// the same switch rows if a separate runtime URL was configured.
const defaultPort = process.env.PGPORT || '5432';
for (const runtimeUrl of [
  process.env.DATABASE_URL_RLS,
  process.env.E2E_SERVER_DATABASE_URL_RLS?.trim() || ownerUrl,
]) {
  const targetEnv = { ...process.env, DATABASE_URL: ownerUrl, DATABASE_URL_RLS: runtimeUrl };
  if (!runtimeUrl || readDisposableTargetClass(targetEnv) !== 'local') {
    throw new Error('Closed services require loopback database URLs');
  }
  const ownerTarget = new URL(ownerUrl);
  const runtimeTarget = new URL(runtimeUrl);
  if (
    ownerTarget.pathname.length <= 1 ||
    ownerTarget.pathname !== runtimeTarget.pathname ||
    (ownerTarget.port || defaultPort) !== (runtimeTarget.port || defaultPort)
  ) {
    throw new Error('Closed services require fixture and server roles on the same database');
  }
}

const ksProject = baseConfig.projects?.find(project => project.name === 'gate-ks-sq');
const server = baseConfig.webServer;
if (!ksProject || !server || Array.isArray(server)) {
  throw new Error('Closed services require the KS project and a dedicated Playwright web server');
}

const serviceChecks = [
  'persists submission, staff verification, and member-safe continuity$',
  'eligible member exchanges public case messages and retains localized accessible controls$',
  'sq: GET is inert; confirmation announces and focuses completion$',
  'Public tracking link shows status without login$',
  'should create and access a share pack$',
  '@closed-services',
];

export default defineConfig({
  ...baseConfig,
  testDir: '.',
  globalSetup: './e2e-mac/closed-services.setup.ts',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  outputDir: './test-results/closed-services',
  reporter: 'list',
  projects: [
    {
      name: 'closed-services-ks',
      testMatch: [
        '**/e2e/gate/member-staff-evidence-journey.spec.ts',
        '**/e2e/gate/member-case-messages.spec.ts',
        '**/e2e/gate/acq3b-opt-out.spec.ts',
        '**/e2e/claim-tracking.ks.spec.ts',
        '**/e2e/share-pack.spec.ts',
        '**/e2e-mac/closed-services.spec.ts',
      ],
      grep: new RegExp(serviceChecks.join('|'), 'u'),
      use: { ...ksProject.use, storageState: undefined },
    },
  ],
  webServer: { ...server, reuseExistingServer: false },
});
