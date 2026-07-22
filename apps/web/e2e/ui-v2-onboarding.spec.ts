import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Member dashboard to claim draft intake', () => {
  test('renders the current member dashboard shell', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'member-dashboard-ready' });

    await expect(page.getByTestId('member-app-header')).toBeVisible();
    await expect(page.getByTestId('member-welcome-status')).toBeVisible();
    await expect(page.getByTestId('member-primary-actions')).toBeVisible();
    await expect(page.getByTestId('trust-strip')).toBeVisible();
  });

  test('member can reach the dormant claim draft intake from UI_V2', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'member-dashboard-ready' });

    const primaryCta = page.getByTestId('member-primary-actions').locator('a');
    await expect(primaryCta).toBeVisible();
    const primaryHref = await primaryCta.getAttribute('href');
    if (!primaryHref) throw new Error('Expected the member dashboard primary CTA to have an href');
    await primaryCta.click();
    await expect(page).toHaveURL(new URL(primaryHref, page.url()).pathname);

    const memberClaims = routes.memberClaims(testInfo);
    const claimsNav = page.locator(`a[href="${memberClaims}"]:visible`).first();
    await expect(claimsNav).toBeVisible();
    await claimsNav.click();
    await expect(page).toHaveURL(new URL(memberClaims, page.url()).pathname);
    await expect(page.getByTestId('page-title')).toBeVisible();

    const memberNewClaim = routes.memberNewClaim(testInfo);
    const newClaimCta = page.getByTestId('create-claim-button');
    await expect(newClaimCta).toHaveAttribute('href', memberNewClaim);
    await newClaimCta.click();
    await expect(page).toHaveURL(new URL(memberNewClaim, page.url()).pathname);
    await expect(page.getByTestId('new-claim-page-ready')).toBeVisible();
    const cookieBanner = page.getByTestId('cookie-consent-banner');
    if (await cookieBanner.isVisible().catch(() => false)) {
      await page.getByTestId('cookie-consent-accept').click();
      await expect(cookieBanner).toHaveCount(0);
    }
    const intake = page.locator('[data-testid="claim-draft-intake"]:visible').first();
    await expect(intake).toBeVisible();
    await expect(intake.getByTestId('claim-draft-category-vehicle')).toBeEnabled();
    await expect(intake.getByTestId('claim-draft-category-injury')).toBeDisabled();
    await intake.getByTestId('claim-draft-category-vehicle').click();
    await intake.getByTestId('claim-draft-category-continue').click();
    const panel = intake.getByTestId('claim-draft-main-panel');
    await panel.locator('select').nth(0).selectOption('collision');
    await panel.locator('input[type="date"]').fill('2026-07-21');
    await panel.locator('input[type="text"]').fill('Mapped UI V2 retirement proof');
    await panel.locator('select').nth(1).selectOption('repair');
    await panel.locator('textarea').fill('Dormant intake stays preparation-only.');
    await panel.locator('button').last().click();

    await expect(intake.getByTestId('claim-draft-dormant-preview')).toBeVisible();
    const submit = intake.getByTestId('claim-draft-submit-disabled');
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute('aria-describedby', 'claim-draft-submit-explanation');
    await submit.evaluate(element => (element as HTMLButtonElement).click());
    await expect(page.getByTestId('claim-created-success')).toHaveCount(0);
    await expect(page).toHaveURL(/\/member\/claims\/new/);
  });
});
