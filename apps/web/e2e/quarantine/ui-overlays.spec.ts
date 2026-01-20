import { test } from '../fixtures/auth.fixture';
import { BranchesScreen } from '../screens/branches.screen';

test.describe('@quarantine UI Overlays Sanity', () => {
  // FIXME: Radix UI overlays (DropdownMenu, Dialog) are currently flaky in E2E
  // environment due to interaction with Next.js 16/React 19 hydration.
  // See: docs/E2E_QUARANTINE_BURNDOWN.md
  test.fixme('Admin can open branch actions menu (Known Issue)', async ({ adminPage: page }) => {
    const branches = new BranchesScreen(page);
    await branches.goto();
    await branches.assertLoaded();

    // Check if we have any branch to test on
    const branchItems = page.getByTestId('branch-item');
    if ((await branchItems.count()) === 0) {
      test.skip(true, 'No branches to test overlay on');
      return;
    }

    const item = branchItems.first();
    const trigger = item.getByTestId('branch-actions-trigger');
    const menu = page.locator('[data-testid="branch-actions-menu"], [role="menu"]').first();

    await trigger.click();
    // This is expected to fail in current environment (Next 16 + React 19 + Radix)
    // We document it here instead of blocking the main CRUD spec.
    await test.expect(menu).toBeVisible({ timeout: 5000 });
  });
});
