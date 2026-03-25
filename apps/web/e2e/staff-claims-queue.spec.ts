import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Staff Claims Queue MVP', () => {
  test('seeded staff can filter the actionable queue and open a claim', async ({
    staffPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.staffClaims(testInfo), testInfo, {
      marker: 'staff-page-ready',
    });

    await expect(page.getByTestId('staff-claims-filters')).toBeVisible();
    await expect(page.getByTestId('staff-claims-queue')).toBeVisible();
    await expect(page.getByTestId('staff-claims-row').first()).toBeVisible();
    await expect(page.getByTestId('staff-claims-view').first()).toHaveText('Open');

    const firstTitle = (await page.getByTestId('staff-claim-title').first().textContent())?.trim();
    expect(firstTitle).toBeTruthy();
    if (!firstTitle) {
      throw new Error('Expected the seeded staff queue to expose a claim title.');
    }

    await page.getByTestId('staff-claims-search-input').fill(firstTitle);
    await page.getByTestId('staff-claims-search-submit').click();

    await expect(page).toHaveURL(/\/staff\/claims\?search=/);
    expect(new URL(page.url()).searchParams.get('search')).toBe(firstTitle);
    await expect(page.getByTestId('staff-claims-search-input')).toHaveValue(firstTitle);
    await expect(page.getByTestId('staff-claims-row')).toHaveCount(1);
    await expect(page.getByTestId('staff-claim-title')).toHaveText([firstTitle]);

    const cookieBanner = page.getByTestId('cookie-consent-banner');
    if (await cookieBanner.isVisible().catch(() => false)) {
      await page.getByTestId('cookie-consent-decline').click();
      await expect(cookieBanner).toHaveCount(0);
    }

    await page.getByTestId('staff-claims-view').first().click();
    await expect(page).toHaveURL(/\/staff\/claims\/[^/]+$/);
    await expect(page.getByTestId('staff-claim-detail-ready')).toBeVisible();
  });
});
