import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

const ksProject = baseConfig.projects?.find(project => project.name === 'gate-ks-sq');
if (!ksProject) throw new Error('The parallel KS gate requires the gate-ks-sq project');

const intakeSwitch = /@ks-intake-switch/u;

export default defineConfig({
  ...baseConfig,
  projects: [
    { ...ksProject, grepInvert: intakeSwitch },
    {
      ...ksProject,
      name: 'gate-ks-intake-switch',
      testMatch: 'gate/different-email-recovery.spec.ts',
      grep: intakeSwitch,
      // Finish the parallel gate before the recovery case closes shared intake.
      dependencies: ['gate-ks-sq'],
      workers: 1,
    },
  ],
});
