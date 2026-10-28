import fs from 'node:fs';
import { defineConfig } from '@playwright/test';
import { assertOwnedBrowserOutput } from './browser-output.mjs';
const origin = new URL(process.env.M4_COMPILED_FIXTURE_ORIGIN ?? '');
if (
  origin.protocol !== 'https:' ||
  origin.hostname !== '127.0.0.1' ||
  origin.pathname !== '/' ||
  origin.search ||
  origin.hash ||
  origin.username ||
  origin.password
)
  throw Error('Owned HTTPS fixture origin required');
const output = process.env.M4_COMPILED_BROWSER_OUTPUT;
const executable = process.env.M4_COMPILED_BROWSER_EXECUTABLE;
if (!executable || fs.realpathSync(executable) !== executable)
  throw Error('Owned browser executable/output required');
assertOwnedBrowserOutput(output);
export default defineConfig({
  testDir: './tests',
  testMatch: '**/compiled-entry.spec.mjs',
  outputDir: output,
  globalTimeout: 120000,
  timeout: 30000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: [['json', { outputFile: output + '/playwright-results.json' }]],
  use: {
    baseURL: origin.origin,
    browserName: 'firefox',
    ignoreHTTPSErrors: false,
    launchOptions: { executablePath: executable },
    trace: 'off',
  },
  // No webServer/globalSetup: root starts the frozen owned services and SQL fixture first.
});
