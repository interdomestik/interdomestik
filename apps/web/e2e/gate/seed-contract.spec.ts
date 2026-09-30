import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Seed Contract Verification', () => {
  const branchCard = (page: Page, code: string) =>
    page.getByTestId('branches-screen').getByTestId(`branch-card-${code}`);

  test('Tenant KS has required branch codes', async ({ adminPage: page }, testInfo) => {
    if (!testInfo.project.name.includes('ks')) {
      testInfo.annotations.push({
        type: 'note',
        description: 'No-op on MK lane: KS-only branch contract',
      });
      return;
    }

    await gotoApp(page, routes.adminBranches(testInfo), testInfo, { marker: 'branches-screen' });

    const requiredBranches = ['KS-A', 'KS-B', 'KS-C'];
    for (const code of requiredBranches) {
      await expect(branchCard(page, code).first()).toBeVisible();
    }
  });

  test('Admin user lists stay tenant-scoped in every pilot locale', async ({
    adminPage: page,
  }, testInfo) => {
    const isKs = testInfo.project.name.includes('ks');
    const isMk = testInfo.project.name.includes('mk');
    if (!isKs && !isMk) return;

    const expectedStaff = isKs ? 'staff.ks@interdomestik.com' : 'staff.mk@interdomestik.com';
    const otherTenantStaff = isKs ? 'staff.mk@interdomestik.com' : 'staff.ks@interdomestik.com';
    const expectedMember = isKs
      ? 'member.ks.a1@interdomestik.com'
      : 'member.mk.1@interdomestik.com';
    const otherTenantMember = isKs
      ? 'member.mk.1@interdomestik.com'
      : 'member.ks.a1@interdomestik.com';

    for (const locale of ['en', 'sq', 'mk', 'sr'] as const) {
      await gotoApp(page, `${routes.adminUsers(locale)}?role=admin%2Cstaff`, testInfo, {
        marker: 'admin-users-page',
      });
      expect(new URL(page.url()).pathname).toBe(routes.adminUsers(locale));
      await expect(page.getByRole('row').filter({ hasText: expectedStaff }).first()).toBeVisible();
      await expect(page.getByRole('row').filter({ hasText: otherTenantStaff })).toHaveCount(0);

      await gotoApp(page, routes.adminUsers(locale), testInfo, { marker: 'admin-users-page' });
      expect(new URL(page.url()).pathname).toBe(routes.adminUsers(locale));
      await expect(page.getByRole('row').filter({ hasText: expectedMember }).first()).toBeVisible();
      await expect(page.getByRole('row').filter({ hasText: otherTenantMember })).toHaveCount(0);
    }
  });

  test('Tenant MK has required branch codes', async ({ adminPage: page }, testInfo) => {
    if (!testInfo.project.name.includes('mk')) {
      testInfo.annotations.push({
        type: 'note',
        description: 'No-op on KS lane: MK-only branch contract',
      });
      return;
    }

    await gotoApp(page, routes.adminBranches(testInfo), testInfo, { marker: 'branches-screen' });

    const requiredBranches = ['MK-A', 'MK-B', 'MK-E'];
    for (const code of requiredBranches) {
      await expect(branchCard(page, code).first()).toBeVisible();
    }
  });

  test('Isolation: KS Admin cannot see MK Branches', async ({ adminPage: page }, testInfo) => {
    if (!testInfo.project.name.includes('ks')) {
      testInfo.annotations.push({
        type: 'note',
        description: 'No-op on MK lane: KS-only isolation check',
      });
      return;
    }

    await gotoApp(page, routes.adminBranches(testInfo), testInfo, { marker: 'branches-screen' });

    const mkBranches = ['MK-A', 'MK-B', 'MK-E'];
    for (const code of mkBranches) {
      await expect(branchCard(page, code)).toHaveCount(0);
    }
  });

  test('Isolation: MK Admin cannot see KS Branches', async ({ adminPage: page }, testInfo) => {
    if (!testInfo.project.name.includes('mk')) {
      testInfo.annotations.push({
        type: 'note',
        description: 'No-op on KS lane: MK-only isolation check',
      });
      return;
    }

    await gotoApp(page, routes.adminBranches(testInfo), testInfo, { marker: 'branches-screen' });

    const ksBranches = ['KS-A', 'KS-B', 'KS-C'];
    for (const code of ksBranches) {
      await expect(branchCard(page, code)).toHaveCount(0);
    }
  });
});
