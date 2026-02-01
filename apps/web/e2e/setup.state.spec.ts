/**
 * Setup Spec - Generate StorageState for Gate Tests
 * Tight, deterministic version for CI.
 */

import fs from 'node:fs';
import path from 'node:path';
import { test as authTest, expect } from './fixtures/auth.fixture';

const stateDir = path.resolve(__dirname, '..', '.playwright', 'state');

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

    // Extract storage state and save to the specific gate path
    await page.context().storageState({ path: outFile });

    // Verify file exists
    expect(fs.existsSync(outFile)).toBeTruthy();
    console.log(`[Setup] Successfully saved state to ${outFile}`);
  });
});
