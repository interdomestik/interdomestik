import { defineConfig, devices } from '@playwright/test';
import baseConfig from './playwright.config';

const baseURL = 'http://ks.127.0.0.1.nip.io:3000/sq';
const extraHTTPHeaders = { 'x-forwarded-host': 'ks.127.0.0.1.nip.io:3000' };
const testMatch = ['evidence/public-accident-safety-cross-browser.evidence.ts'];

export default defineConfig({
  ...baseConfig,
  projects: [
    {
      name: 'public-entry-firefox',
      testMatch,
      use: { ...devices['Desktop Firefox'], baseURL, extraHTTPHeaders },
    },
    {
      name: 'public-entry-webkit',
      testMatch,
      use: { ...devices['Desktop Safari'], baseURL, extraHTTPHeaders },
    },
  ],
});
