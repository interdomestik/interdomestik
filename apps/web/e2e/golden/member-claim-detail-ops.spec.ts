import { expect } from '@playwright/test';
import mk from '../../src/messages/mk/claims.json';
import sq from '../../src/messages/sq/claims.json';
import { test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

const SECTION_IDS = [
  'member-claim-detail-progress',
  'member-claim-detail-evidence',
  'member-claim-detail-history',
  'member-claim-detail-messaging',
] as const;

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
        const targetHref = await targetLink.getAttribute('href');
        if (!targetHref) throw new Error('Claim detail link is missing its href');
        const claimId = decodeURIComponent(
          new URL(targetHref, page.url()).pathname.split('/').at(-1)!
        );
        await targetLink.click();
        const catalog = (routes.getLocale(testInfo) === 'mk' ? mk : sq).claims;
        const continuity = catalog.detail.continuity;
        const back = page.getByRole('link', { name: continuity.backToWorkspace, exact: true });
        await expect(back).toBeVisible();
        await expect(back).toHaveAttribute('href', routes.member(testInfo));
        await expect(
          back.locator('xpath=ancestor::header').getByText(claimId, { exact: true })
        ).toBeVisible();

        const navigation = page.getByRole('navigation', {
          name: continuity.sectionNavigation,
          exact: true,
        });
        const labels = [
          continuity.progress,
          continuity.evidence,
          continuity.history,
          continuity.messages,
        ];
        await expect(navigation.getByRole('link')).toHaveCount(SECTION_IDS.length);
        for (const [index, id] of SECTION_IDS.entries()) {
          const link = navigation.getByRole('link').nth(index);
          await expect(link).toHaveAccessibleName(labels[index]);
          await expect(link).toHaveAttribute('href', `#${id}`);
          await expect(page.locator(`#${id}`)).toBeVisible();
        }

        expect(
          await page.locator('#member-claim-detail-progress').evaluate(progress => {
            const summary = progress.querySelector('[data-testid="member-claim-progress-summary"]');
            const companion = progress.querySelector(
              '[data-testid="member-claim-case-companion-next-step"]'
            );
            return Boolean(
              summary &&
              companion &&
              summary.compareDocumentPosition(companion) & Node.DOCUMENT_POSITION_FOLLOWING
            );
          })
        ).toBe(true);

        await expect(page.getByTestId('ops-timeline')).toBeVisible();
        await expect(page.getByTestId('ops-documents-panel')).toBeVisible();
      } else {
        console.log('No detail links found, only /new');
      }
    } else {
      console.log('No claims found for member, skipping detail check');
    }
  });
});
