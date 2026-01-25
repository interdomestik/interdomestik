import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Sidebar Toggle', () => {
  test('should toggle sidebar expand/collapse state', async ({
    adminPage: page,
    isMobile,
  }, testInfo) => {
    test.skip(isMobile, 'Sidebar toggle is desktop-only in responsive layout.');

    // Navigate to admin dashboard
    await gotoApp(page, routes.admin(testInfo), testInfo, { marker: 'dashboard-page-ready' });

    // Check initial state (should be expanded due to defaultOpen={true})
    // Use [data-state] to distinguish the real sidebar from the spacer/ghost element
    const sidebar = page.locator('div[data-testid="admin-sidebar"][data-state]');
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toHaveAttribute('data-state', 'expanded');

    // Find trigger button
    const trigger = page.getByTestId('sidebar-trigger');
    await expect(trigger).toBeVisible();

    // Click to collapse
    await trigger.click();

    // Check if state changed to collapsed
    await expect(sidebar).toHaveAttribute('data-state', 'collapsed');

    // Click to expand
    await trigger.click();

    // Check if state changed back to expanded
    await expect(sidebar).toHaveAttribute('data-state', 'expanded');
  });
});
