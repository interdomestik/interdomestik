import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Sidebar Toggle', () => {
  test('should toggle sidebar expand/collapse state', async ({
    adminPage: page,
    isMobile,
  }, testInfo) => {
    test.skip(isMobile, 'Sidebar toggle is desktop-only in responsive layout.');
    // Navigate to dashboard
    await gotoApp(page, routes.member(), testInfo);

    // Check initial state (should be expanded due to defaultOpen={true})
    // data-state="expanded" is on the wrapper. data-collapsible="icon" is also on the wrapper.
    // The wrapper is the outer div in Sidebar component (shell.tsx returns div with data-state).
    // Let's rely on data-state attribute.
    const sidebar = page.locator('div[data-state="expanded"][data-collapsible="icon"]');
    await expect(sidebar).toBeVisible();

    // Verify width is larger than icon width (approx checking)
    // Or just rely on data-state "expanded" vs "collapsed".
    // The component logic says: state: open ? 'expanded' : 'collapsed'.

    // Find trigger button
    // It has data-sidebar="trigger" based on controls.tsx
    const trigger = page.locator('button[data-sidebar="trigger"]');
    await expect(trigger).toBeVisible();

    // Click to collapse
    await trigger.click();

    // Check if state changed to collapsed
    const collapsedSidebar = page.locator('div[data-state="collapsed"][data-collapsible="icon"]');
    await expect(collapsedSidebar).toBeVisible();

    // Click to expand
    await trigger.click();

    // Check if state changed back to expanded
    await expect(sidebar).toBeVisible();
  });
});
