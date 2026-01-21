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
function getTenants(projectName: string): Array<'ks' | 'mk'> {
  if (projectName === 'setup') return ['ks', 'mk'];
  return projectName.includes('mk') ? ['mk'] : ['ks'];
}

function getUserForTenant(roleKey: string, tenant: 'ks' | 'mk') {
  if (tenant === 'mk') {
    switch (roleKey) {
      case 'member':
        return E2E_USERS.MK_MEMBER;
      case 'admin':
        return E2E_USERS.MK_ADMIN;
      case 'agent':
        return E2E_USERS.MK_AGENT;
      case 'staff':
        return E2E_USERS.MK_STAFF;
      case 'branch_manager':
        return E2E_USERS.MK_BRANCH_MANAGER;
      default:
        throw new Error(`Unknown role key for mk: ${roleKey}`);
    }
  }

  // KS Tenant
  switch (roleKey) {
    case 'member':
      return E2E_USERS.KS_MEMBER;
    case 'admin':
      return E2E_USERS.KS_ADMIN;
    case 'agent':
      return E2E_USERS.KS_AGENT;
    case 'staff':
      return E2E_USERS.KS_STAFF;
    case 'branch_manager':
      return E2E_USERS.KS_BRANCH_MANAGER;
    default:
      throw new Error(`Unknown role key for ks: ${roleKey}`);
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
    const expected = getUserForTenant(role as any, tenant);

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
  authTest('Setup roles', async ({ saveState, browser }, testInfo) => {
    const targetTenants = getTenants(testInfo.project.name);

    for (const tenant of targetTenants) {
      const defaultLocale = tenant === 'mk' ? 'mk' : 'sq';
      const baseURL = (
        testInfo.project.use.baseURL ?? `http://localhost:3000/${defaultLocale}`
      ).toString();

      const roles =
        tenant === 'mk'
          ? (['member', 'admin', 'agent', 'staff', 'branch_manager'] as const)
          : (['member', 'admin', 'agent', 'staff'] as const);

      for (const role of roles) {
        // Explicitly pass tenant to helpers and fixtures instead of mutating env
        if (!process.env.FORCE_REGEN_STATE && (await stateExists(role, tenant))) {
          const ok = await stateIsValidForRole({ role, tenant, browser, baseURL });
          if (ok) continue;
        }
        await ensureDir(stateFile(role, tenant));
        process.env.PLAYWRIGHT_LOCALE = defaultLocale; // This might still be risky if reused, but less critical than tenant. Ideally pass locale too.
        await saveState(role, tenant);
      }
    }
  });
});
