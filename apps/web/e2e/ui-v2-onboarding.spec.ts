import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('UI_V2 onboarding', () => {
  test.skip(process.env.NEXT_PUBLIC_UI_V2 !== 'true', 'Requires NEXT_PUBLIC_UI_V2=true');

  test('member can start a claim from hero and reach claim-created success state', async ({
    authenticatedPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.home('en'), testInfo, { marker: 'body' });

    const hasHeroV2Cta = (await page.getByTestId('hero-v2-start-claim').count()) > 0;
    test.skip(!hasHeroV2Cta, 'UI_V2 hero is not enabled on this environment');

    await page.getByTestId('hero-v2-start-claim').click();
    await page.waitForURL(/\/member\/claims\/new/);

    await page.getByTestId('category-vehicle').click();
    await page.getByTestId('wizard-next').click();

    await page.getByLabel('Claim Title').fill('UI V2 onboarding claim');
    await page.getByLabel('Company Name').fill('Interdomestik Test Carrier');
    await page.getByLabel('Description').fill('This claim validates the V2 onboarding happy path.');
    await page.getByLabel('Date of Incident').fill('2026-02-01');
    await page.getByTestId('wizard-next').click();

    await page.getByTestId('wizard-next').click();
    await page.getByTestId('wizard-submit').click();

    await expect(page.getByTestId('claim-created-success')).toBeVisible();

    const claimId = (
      await page.locator('[data-testid="claim-created-success"] .font-mono').textContent()
    )
      ?.trim()
      .replace(/^Claim ID:\s*/i, '');
    expect(claimId).toBeTruthy();

    await testInfo.attach('created-claim-id', {
      body: claimId ?? '',
      contentType: 'text/plain',
    });
  });
});
