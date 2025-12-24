/**
 * Setup Spec - Generate StorageState for All Roles
 *
 * Run this once to generate auth state files, then tests can skip UI login.
 * Usage: pnpm exec playwright test e2e/setup.state.spec.ts --project=setup
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from './fixtures/auth.fixture';

const LOGIN_RX = /(?:\/|^)(?:[a-z]{2}\/)?(?:login|signin|auth\/sign-in)(?:\/|\?|$)/i;

function stateFile(role: string): string {
  return path.join(__dirname, 'fixtures', '.auth', `${role}.json`);
}

async function stateExists(role: string): Promise<boolean> {
  try {
    await fs.access(stateFile(role));
    return true;
  } catch {
    return false;
  }
}

async function stateIsValidForRole(opts: {
  role: 'member' | 'admin' | 'agent' | 'staff';
  browser: import('@playwright/test').Browser;
  baseURL: string;
}): Promise<boolean> {
  const { role, browser, baseURL } = opts;
  const storageStatePath = stateFile(role);

  try {
    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();

    const targetPath =
      role === 'admin'
        ? '/en/admin'
        : role === 'agent'
          ? '/en/agent'
          : role === 'staff'
            ? '/en/staff'
            : '/en/member';

    await page.goto(new URL(targetPath, baseURL).toString(), { waitUntil: 'domcontentloaded' });
    // If we get bounced to a sign-in route, state is not usable.
    const url = page.url();
    await context.close();
    return !LOGIN_RX.test(url);
  } catch {
    return false;
  }
}

test.describe('Generate StorageState Files', () => {
  test('Setup member auth state', async ({ saveState, browser }, testInfo) => {
    const baseURL = (testInfo.project.use.baseURL ?? 'http://localhost:3000').toString();
    if (!process.env.FORCE_REGEN_STATE && (await stateExists('member'))) {
      const ok = await stateIsValidForRole({ role: 'member', browser, baseURL });
      if (ok) return;
    }
    await saveState('member');
  });

  test('Setup admin auth state', async ({ saveState, browser }, testInfo) => {
    const baseURL = (testInfo.project.use.baseURL ?? 'http://localhost:3000').toString();
    if (!process.env.FORCE_REGEN_STATE && (await stateExists('admin'))) {
      const ok = await stateIsValidForRole({ role: 'admin', browser, baseURL });
      if (ok) return;
    }
    await saveState('admin');
  });

  test('Setup agent auth state', async ({ saveState, browser }, testInfo) => {
    const baseURL = (testInfo.project.use.baseURL ?? 'http://localhost:3000').toString();
    if (!process.env.FORCE_REGEN_STATE && (await stateExists('agent'))) {
      const ok = await stateIsValidForRole({ role: 'agent', browser, baseURL });
      if (ok) return;
    }
    await saveState('agent');
  });

  test('Setup staff auth state', async ({ saveState, browser }, testInfo) => {
    const baseURL = (testInfo.project.use.baseURL ?? 'http://localhost:3000').toString();
    if (!process.env.FORCE_REGEN_STATE && (await stateExists('staff'))) {
      const ok = await stateIsValidForRole({ role: 'staff', browser, baseURL });
      if (ok) return;
    }
    await saveState('staff');
  });
});
