/**
 * Setup Spec - Generate StorageState for Gate Tests
 * Tight, deterministic version for CI.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { test as authTest, expect } from './fixtures/auth.fixture';

const stateDir = path.resolve(__dirname, '..', '.playwright', 'state');
const COOKIE_CONSENT_STORAGE_KEY = 'interdomestik_cookie_consent_v1';
const COOKIE_CONSENT_COOKIE_NAME = 'cookie_consent';

async function persistCookieConsent(page: Page) {
  await page.evaluate(
    ({ cookieName, storageKey }) => {
      window.localStorage.setItem(storageKey, 'accepted');
      document.cookie = `${cookieName}=accepted; Max-Age=${60 * 60 * 24 * 365}; Path=/; SameSite=Lax`;
    },
    {
      cookieName: COOKIE_CONSENT_COOKIE_NAME,
      storageKey: COOKIE_CONSENT_STORAGE_KEY,
    }
  );
}

authTest.describe('E2E Setup', () => {
  authTest('save auth storage state', async ({ page, saveState }, testInfo) => {
    // Ensure directory exists
    if (!fs.existsSync(stateDir)) {
      fs.mkdirSync(stateDir, { recursive: true });
    }

    // 1. Derive tenant robustly from headers (not project name)
    const headers = testInfo.project.use.extraHTTPHeaders || {};
    const host = (headers['x-forwarded-host'] || '').toLowerCase();
    const tenant = host.startsWith('mk.') ? 'mk' : 'ks';
    const outFile = path.join(stateDir, `${tenant}.json`);

    console.log(`[Setup] Generating state for ${tenant} -> ${outFile}`);

    // Perform login (using the robust saveState fixture)
    await saveState('member');
    await persistCookieConsent(page);

    // Extract storage state and save to the specific gate path
    await page.context().storageState({ path: outFile });

    // Verify file exists
    expect(fs.existsSync(outFile)).toBeTruthy();
    console.log(`[Setup] Successfully saved state to ${outFile}`);
  });
});
