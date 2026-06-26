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
      await gotoApp(page, routes.agentImport(testInfo), testInfo, {
        marker: 'group-dashboard-summary',
      });

      const summary = page.locator('[data-testid="group-dashboard-summary"]:visible').first();
      await expect(summary).toBeVisible();
      await expect(page.getByText('Aggregate group access dashboard')).toBeVisible();
      await expect(
        page.getByText(
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
