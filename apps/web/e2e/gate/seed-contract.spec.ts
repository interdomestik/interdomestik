import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Seed Contract Verification', () => {
  test('Tenant KS has required branch codes', async ({ adminPage: page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('ks'), 'KS-only contract');

    await gotoApp(page, routes.adminBranches, testInfo);

    const requiredBranches = ['KS-A', 'KS-B', 'KS-C'];
    for (const code of requiredBranches) {
      await expect(page.getByTestId(`branch-card-${code}`)).toBeVisible();
    }
  });

  test('Tenant MK has required branch codes', async ({ adminPage: page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('mk'), 'MK-only contract');

    await gotoApp(page, routes.adminBranches, testInfo);

    const requiredBranches = ['MK-A', 'MK-B', 'MK-E'];
    for (const code of requiredBranches) {
      await expect(page.getByTestId(`branch-card-${code}`)).toBeVisible();
    }
  });

  test('Isolation: KS Admin cannot see MK Branches', async ({ adminPage: page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('ks'), 'KS-only check');

    await gotoApp(page, routes.adminBranches, testInfo);

    const mkBranches = ['MK-A', 'MK-B', 'MK-E'];
    for (const code of mkBranches) {
      await expect(page.getByTestId(`branch-card-${code}`)).not.toBeVisible();
    }
  });

  test('Isolation: MK Admin cannot see KS Branches', async ({ adminPage: page }, testInfo) => {
    test.skip(!testInfo.project.name.includes('mk'), 'MK-only check');

    await gotoApp(page, routes.adminBranches, testInfo);

    const ksBranches = ['KS-A', 'KS-B', 'KS-C'];
    for (const code of ksBranches) {
      await expect(page.getByTestId(`branch-card-${code}`)).not.toBeVisible();
    }
  });
});
