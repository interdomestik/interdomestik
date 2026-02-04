import { defineConfig } from 'checkly';

export default defineConfig({
  projectName: 'Interdomestik Monitor',
  logicalId: 'interdomestik-monitor',
  repoUrl: 'https://github.com/interdomestik/interdomestik',
  checks: {
    locations: ['us-east-1', 'eu-central-1'],
    tags: ['website'],
    runtimeId: '2024.02',
    browserChecks: {
      frequency: 10,
      testMatch: '**/__checks__/**/*.check.ts',
    },
  },
  cli: {
    runLocation: 'eu-central-1',
  },
});
