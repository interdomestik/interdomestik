import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test('member owned cases remain accessible across dashboard, list and mobile account menu', async ({
  page,
  loginAs,
}, testInfo) => {
  await loginAs('member');
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'member-dashboard-ready' });
  const links = page
    .getByTestId('member-dashboard-ready')
    .locator('a[href*="/member/claims/"]:not([href$="/new"])');
  await expect(links.first()).toBeVisible();
  const detailHref = await links.first().getAttribute('href');
  expect(detailHref).toBeTruthy();
  await links.first().click();
  await expect(page.locator('[data-testid="member-claim-progress-summary"]:visible')).toHaveCount(
    1
  );
  await page.reload();
  await expect(page.locator('[data-testid="member-claim-progress-summary"]:visible')).toHaveCount(
    1
  );
  await gotoApp(page, routes.memberClaims(testInfo), testInfo, {
    marker: 'member-claims-table-region',
  });
  await expect(page.getByTestId('member-claims-table-region')).toBeVisible();
  await expect(page.locator(`a[href="${detailHref}"]`).first()).toBeVisible();
  const account = page.getByTestId('user-nav');
  await expect(account).toBeVisible();
  await account.click();
  await expect(page.getByRole('menu')).toBeVisible();
  // Logout is the final action in the existing shared account menu.
  await page.getByRole('menuitem').last().click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'auth-ready' });
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
});
