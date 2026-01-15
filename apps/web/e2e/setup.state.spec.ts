/**
 * Setup Spec - Generate StorageState for All Roles
 *
 * Run this once to generate auth state files, then tests can skip UI login.
 * Usage: pnpm exec playwright test e2e/setup.state.spec.ts --project=setup
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { test as authTest } from './fixtures/auth.fixture';

function stateFile(role: string): string {
  return path.join(__dirname, '.auth', `${role}.json`);
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
  role: 'member' | 'admin' | 'agent' | 'staff' | 'branch_manager' | 'admin_mk';
  browser: import('@playwright/test').Browser;
  baseURL: string;
}): Promise<boolean> {
  const { role, browser, baseURL } = opts;
  const storageStatePath = stateFile(role);

  try {
    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();

    // Avoid navigating to heavy dashboard pages just to validate auth state.
    // Better-auth exposes session info under /api/auth/get-session.
    const response = await page.request.get(new URL('/api/auth/get-session', baseURL).toString());
    if (response.status() !== 200) {
      await context.close();
      return false;
    }

    const data = (await response.json().catch(() => null)) as null | {
      user?: { role?: string };
      session?: unknown;
    };
    const userRole = data?.user?.role;

    const expected = role === 'member' ? 'user' : role;
    await context.close();
    return userRole === expected;
  } catch {
    return false;
  }
}

authTest.describe('Generate StorageState Files', () => {
  authTest('Setup member auth state', async ({ saveState, browser }, testInfo) => {
    const baseURL = (testInfo.project.use.baseURL ?? 'http://localhost:3000').toString();
    if (!process.env.FORCE_REGEN_STATE && (await stateExists('member'))) {
      const ok = await stateIsValidForRole({ role: 'member', browser, baseURL });
      if (ok) return;
    }
    await saveState('member');
  });

  authTest('Setup admin auth state', async ({ saveState, browser }, testInfo) => {
    const baseURL = (testInfo.project.use.baseURL ?? 'http://localhost:3000').toString();
    if (!process.env.FORCE_REGEN_STATE && (await stateExists('admin'))) {
      const ok = await stateIsValidForRole({ role: 'admin', browser, baseURL });
      if (ok) return;
    }
    await saveState('admin');
  });

  authTest('Setup agent auth state', async ({ saveState, browser }, testInfo) => {
    const baseURL = (testInfo.project.use.baseURL ?? 'http://localhost:3000').toString();
    if (!process.env.FORCE_REGEN_STATE && (await stateExists('agent'))) {
      const ok = await stateIsValidForRole({ role: 'agent', browser, baseURL });
      if (ok) return;
    }
    await saveState('agent');
  });

  authTest('Setup staff auth state', async ({ saveState, browser }, testInfo) => {
    const baseURL = (testInfo.project.use.baseURL ?? 'http://localhost:3000').toString();
    if (!process.env.FORCE_REGEN_STATE && (await stateExists('staff'))) {
      const ok = await stateIsValidForRole({ role: 'staff', browser, baseURL });
      if (ok) return;
    }
    await saveState('staff');
  });

  authTest('Setup branch_manager auth state', async ({ saveState, browser }, testInfo) => {
    const baseURL = (testInfo.project.use.baseURL ?? 'http://localhost:3000').toString();
    if (!process.env.FORCE_REGEN_STATE && (await stateExists('branch_manager'))) {
      const ok = await stateIsValidForRole({ role: 'branch_manager', browser, baseURL });
      if (ok) return;
    }
    await saveState('branch_manager');
  });

  authTest('Setup admin_mk auth state', async ({ saveState, browser }, testInfo) => {
    const baseURL = (testInfo.project.use.baseURL ?? 'http://localhost:3000').toString();
    if (!process.env.FORCE_REGEN_STATE && (await stateExists('admin_mk'))) {
      const ok = await stateIsValidForRole({ role: 'admin_mk', browser, baseURL });
      if (ok) return;
    }
    await saveState('admin_mk');
  });
});
