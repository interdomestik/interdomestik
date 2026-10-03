import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

// Task-first reading order of the member case workspace.
const READING_ORDER_SELECTORS = [
  '#member-claim-detail-progress',
  '[data-testid="member-claim-help-summary"]',
  '#member-claim-detail-messaging',
  '#member-claim-detail-evidence',
  '#member-claim-detail-history',
];

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

test('member case workspace keeps reading order and keyboard destinations at 320 CSS px and enlarged presentation', async ({
  page,
  loginAs,
}, testInfo) => {
  await loginAs('member');
  await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'member-dashboard-ready' });
  const caseLinks = page
    .getByTestId('member-dashboard-ready')
    .locator('a[href*="/member/claims/"]:not([href$="/new"])');
  await expect(caseLinks.first()).toBeVisible();
  // One owned case is enough here; every detail assertion below stays unique and visible.
  await caseLinks.first().click();

  const detail = page.locator('[data-testid="member-claim-detail-page"]:visible');
  await expect(detail).toHaveCount(1);
  await expect(page.locator('[data-testid="member-claim-progress-summary"]:visible')).toHaveCount(
    1
  );
  await expect(page.locator('[data-testid="member-claim-help-summary"]:visible')).toHaveCount(1);
  const detailOverflow = () => detail.evaluate(node => node.scrollWidth - node.clientWidth);

  const documentOrder = await detail.evaluate((root, selectors) => {
    const found = selectors
      .map(selector => [selector, root.querySelector(selector)] as const)
      .filter((entry): entry is readonly [string, Element] => entry[1] !== null);
    return found
      .slice()
      .sort((a, b) =>
        a[1].compareDocumentPosition(b[1]) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
      )
      .map(entry => entry[0]);
  }, READING_ORDER_SELECTORS);
  expect(documentOrder).toEqual(READING_ORDER_SELECTORS);

  // 320 CSS px: no horizontal reflow inside the case workspace, all sections still reachable.
  await page.setViewportSize({ width: 320, height: 720 });
  for (const selector of READING_ORDER_SELECTORS) {
    await expect(page.locator(selector)).toBeVisible();
  }
  expect(await detailOverflow()).toBeLessThanOrEqual(1);

  const messagesLink = page.locator('a[href="#member-claim-detail-messaging"]:visible');
  await expect(messagesLink).toHaveCount(1);
  await messagesLink.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#member-claim-detail-messaging$/);
  await expect(page.locator('#member-claim-detail-messaging')).toBeInViewport();

  // 200% presentation emulated by halving the CSS viewport and doubling the root font size.
  await page.setViewportSize({ width: 640, height: 512 });
  await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
  await expect(page.locator('#member-claim-detail-progress')).toBeVisible();
  await expect(page.locator('[data-testid="member-claim-help-summary"]')).toBeVisible();
  await expect(page.locator('#member-claim-detail-messaging')).toBeVisible();
  expect(await detailOverflow()).toBeLessThanOrEqual(1);

  const supportLink = page.locator('[data-testid="member-claim-trust-sla-support-link"]:visible');
  await expect(supportLink).toHaveCount(1);
  const supportHref = await supportLink.getAttribute('href');
  expect(supportHref).toContain('/member/help');
  expect(supportHref).toContain('claimId=');
  expect(supportHref).toContain('source=member_claim_detail');
  await supportLink.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(url => url.pathname.includes('/member/help'));
  expect(page.url()).toContain('source=member_claim_detail');
  expect(page.url()).toContain('claimId=');
});
