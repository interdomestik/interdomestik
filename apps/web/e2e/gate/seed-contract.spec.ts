import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Seed Contract Verification', () => {
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
      await expect(page.getByTestId(`branch-card-${code}`)).toBeVisible();
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
      await expect(page.getByTestId(`branch-card-${code}`)).toBeVisible();
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
      await expect(page.getByTestId(`branch-card-${code}`)).not.toBeVisible();
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
      await expect(page.getByTestId(`branch-card-${code}`)).not.toBeVisible();
    }
  });
});
