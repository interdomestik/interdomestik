import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

const ksProject = baseConfig.projects?.find(project => project.name === 'gate-ks-sq');
if (!ksProject) throw new Error('The parallel KS gate requires the gate-ks-sq project');

const intakeSwitch = /@ks-intake-switch/u;

export default defineConfig({
  ...baseConfig,
  projects: [
    { ...ksProject, testMatch: 'gate/**/*.spec.ts', grepInvert: intakeSwitch },
    {
      ...ksProject,
      name: 'gate-ks-intake-switch',
      testMatch: 'gate/different-email-recovery.spec.ts',
      grep: intakeSwitch,
      workers: 1,
    },
  ],
});
