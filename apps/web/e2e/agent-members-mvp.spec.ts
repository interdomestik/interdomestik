import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Agent My Members MVP', () => {
  test('seeded agent sees members list and can open owned member context', async ({
    agentPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.agentMembers(testInfo), testInfo, {
      marker: 'agent-members-ready',
    });

    await expect(page.getByTestId('agent-members-list')).toBeVisible();
    await expect(page.getByTestId('agent-member-row').first()).toBeVisible();
    const viewLink = page.getByTestId('agent-member-view-link').first();
    await expect(viewLink).toHaveText('View member');
    const memberHref = await viewLink.getAttribute('href');
    expect(memberHref).toMatch(/\/agent\/members\/[^/]+$/);

    try {
      await Promise.all([
        page.waitForURL(/\/agent\/members\/[^/]+$/, { timeout: 8000 }),
        viewLink.click(),
      ]);
    } catch {
      await page.goto(new URL(memberHref ?? '', page.url()).toString(), {
        waitUntil: 'domcontentloaded',
      });
      await expect(page).toHaveURL(/\/agent\/members\/[^/]+$/);
    }
    await expect(page.getByTestId('agent-member-detail-ready')).toBeVisible();
  });
});
