import { defineConfig } from '@playwright/test';
import { assertClosedServicesDatabase } from './e2e-mac/closed-services-target.fixture';
import baseConfig from './playwright.config';

assertClosedServicesDatabase();

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
  globalSetup: './e2e-mac/closed-services.setup.fixture.ts',
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
