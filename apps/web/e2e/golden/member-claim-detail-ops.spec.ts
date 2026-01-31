import { expect } from '@playwright/test';
import { test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

test.describe('Member Claim Detail Ops (Golden)', () => {
  test('renders ops claim detail view', async ({ page, loginAs }, testInfo) => {
    await loginAs('member');
    await gotoApp(page, routes.memberClaims(testInfo), testInfo, { marker: 'page-ready' });

    // We look for a link to a claim detail, avoiding the /new link.
    const claimLink = page
      .locator('a[href^="/"][href*="/member/claims/"]')
      .filter({ hasNotText: /New|Krijo/i });
    const count = await claimLink.count();

    if (count > 0) {
      // Find the first link that looks like a claim ID (not /new)
      let targetLink = null;
      for (let i = 0; i < count; i++) {
        const href = await claimLink.nth(i).getAttribute('href');
        if (href && !href.endsWith('/new')) {
          targetLink = claimLink.nth(i);
          break;
        }
      }

      if (targetLink) {
        await targetLink.click();
        await page.waitForLoadState('networkidle');

        // Check Ops Action Bar
        await expect(page.getByTestId('ops-action-bar')).toBeVisible();

        // Check Timeline
        await expect(page.getByTestId('ops-timeline')).toBeVisible();

        // Check Documents
        await expect(page.getByTestId('ops-documents-panel')).toBeVisible();
      } else {
        console.log('No detail links found, only /new');
      }
    } else {
      console.log('No claims found for member, skipping detail check');
    }
  });
});
