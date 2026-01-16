/**
 * Setup Spec - Generate StorageState for All Roles
 *
 * Run this once to generate auth state files, then tests can skip UI login.
 * Usage: pnpm exec playwright test e2e/setup.state.spec.ts --project=setup
 */

import { E2E_USERS } from '@interdomestik/database';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test as authTest } from './fixtures/auth.fixture';

// Helper to determine tenant from project name
function getTenant(projectName: string): 'ks' | 'mk' {
  return projectName.includes('mk') ? 'mk' : 'ks';
}

/**
 * Maps the legacy test role keys (e.g. 'member', 'admin_mk') to the strict E2E identity.
 */
function getExampleUser(roleKey: string) {
  switch (roleKey) {
    case 'member':
      return E2E_USERS.KS_MEMBER;
    case 'admin':
      return E2E_USERS.KS_ADMIN;
    case 'agent':
      return E2E_USERS.KS_AGENT;
    case 'staff':
      return E2E_USERS.KS_STAFF;
    case 'admin_mk':
      return E2E_USERS.MK_ADMIN;
    case 'branch_manager':
      return E2E_USERS.MK_BRANCH_MANAGER;
    default:
      throw new Error(`Unknown role key: ${roleKey}`);
  }
}

function stateFile(role: string, tenant: 'ks' | 'mk'): string {
  return path.join(__dirname, '.auth', tenant, `${role}.json`);
}

async function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function stateExists(role: string, tenant: 'ks' | 'mk'): Promise<boolean> {
  try {
    await fs.access(stateFile(role, tenant));
    return true;
  } catch {
    return false;
  }
}

async function stateIsValidForRole(opts: {
  role: string;
  tenant: 'ks' | 'mk';
  browser: import('@playwright/test').Browser;
  baseURL: string;
}): Promise<boolean> {
  const { role, tenant, browser, baseURL } = opts;
  const storageStatePath = stateFile(role, tenant);

  try {
    const context = await browser.newContext({ storageState: storageStatePath });
    const page = await context.newPage();

    // Check better-auth session
    const response = await page.request.get(new URL('/api/auth/get-session', baseURL).toString());
    if (response.status() !== 200) {
      await context.close();
      return false;
    }

    const data = (await response.json().catch(() => null)) as null | {
      user?: { role?: string; tenantId?: string };
    };

    const userRole = data?.user?.role;
    const userTenant = data?.user?.tenantId;

    // Strict validation against golden path truth
    const expected = getExampleUser(role);

    // Check match
    const roleMatches = userRole === expected.dbRole;
    // Map tenantId to code if needed, but here we expect the ID in the session
    const tenantMatches = userTenant === expected.tenantId;

    await context.close();
    return roleMatches && tenantMatches;
  } catch {
    return false;
  }
}

authTest.describe('Generate StorageState Files', () => {
  // KS ROLES
  authTest('Setup KS roles', async ({ saveState, browser }, testInfo) => {
    const tenant = getTenant(testInfo.project.name);
    // Only run for KS project
    if (tenant !== 'ks') return;

    const baseURL = (testInfo.project.use.baseURL ?? 'http://localhost:3000/sq').toString();
    const roles = ['member', 'admin', 'agent', 'staff'] as const;

    for (const role of roles) {
      if (!process.env.FORCE_REGEN_STATE && (await stateExists(role, tenant))) {
        const ok = await stateIsValidForRole({ role, tenant, browser, baseURL });
        if (ok) continue;
      }
      await ensureDir(stateFile(role, tenant));
      // Pass tenant to saveState via fixture or handle logic here?
      // NOTE: The saveState fixture in auth.fixture.ts is generic.
      // We will call it directly using the logic below to avoid strict deps on old fixture.
      await saveState(role);
    }
  });

  // MK ROLES
  authTest('Setup MK roles', async ({ saveState, browser }, testInfo) => {
    const tenant = getTenant(testInfo.project.name);
    // Only run for MK project
    if (tenant !== 'mk') return;

    const baseURL = (testInfo.project.use.baseURL ?? 'http://localhost:3000/mk').toString();
    const roles = ['admin_mk', 'branch_manager'] as const;

    for (const role of roles) {
      if (!process.env.FORCE_REGEN_STATE && (await stateExists(role, tenant))) {
        const ok = await stateIsValidForRole({ role, tenant, browser, baseURL });
        if (ok) continue;
      }
      await ensureDir(stateFile(role, tenant));
      await saveState(role);
    }
  });
});
