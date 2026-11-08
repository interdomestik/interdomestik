import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { withGroupAccessPrivacyFixture } from './group-access-privacy-consent.fixture';
import { loginAsOfficeSeededAgent } from './group-access-privacy-login';

test.describe('Group access privacy', () => {
  test('office group access stays aggregate-only without explicit member consent', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);

    await withGroupAccessPrivacyFixture(testInfo, async context => {
      await loginAsOfficeSeededAgent(page, testInfo, context.officeAgent);
      // OD-18 Option B: even an office agent finds the import closed until the tenant opts in.
      await page.goto(routes.agentImport(testInfo));
      await expect(page.getByTestId('not-found-page')).toBeVisible();
      await expect(page.getByTestId('group-dashboard-summary')).toHaveCount(0);

      await context.enableSponsoredImport();
      await gotoApp(page, routes.agentImport(testInfo), testInfo, {
        marker: 'group-dashboard-summary',
      });

      const summary = page.locator('[data-testid="group-dashboard-summary"]:visible').first();
      await expect(summary).toBeVisible();
      await expect(summary.getByText('Aggregate group access dashboard')).toBeVisible();
      await expect(
        summary.getByText(
          'This view stays aggregate-only. No claim facts, notes, or documents are visible here without explicit member consent.'
        )
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Open cases' })).toBeVisible();

      await expect(page.getByText(context.seededMemberName)).toHaveCount(0);
      await expect(page.getByText(context.claimTitle)).toHaveCount(0);
      await expect(page.getByText(context.claimCompanyName)).toHaveCount(0);
      await expect(page.getByText(context.internalHistoryNote)).toHaveCount(0);
      await expect(page.getByText(context.claimDocumentName)).toHaveCount(0);
    });
  });
});
