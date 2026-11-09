import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { withGroupAccessPrivacyFixture } from './group-access-privacy-consent.fixture';
import { loginAsOfficeSeededAgent } from './group-access-privacy-login';

test.describe('Group access privacy', () => {
  test('the retired import lands on the sponsor list without member case facts', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);

    await withGroupAccessPrivacyFixture(testInfo, async context => {
      await loginAsOfficeSeededAgent(page, testInfo, context.officeAgent);
      // ACQ-3b retires the roster import: /agent/import redirects to the sponsor list whether the
      // legacy OD-18 import setting is explicitly off or on.
      for (const enabled of [false, true]) {
        await context.setSponsoredImport(enabled);
        await gotoApp(page, routes.agentImport(testInfo), testInfo, {
          marker: 'agent-sponsors-page-ready',
        });
        await expect(page).toHaveURL(/\/agent\/sponsors$/);
        await expect(page.getByTestId('group-dashboard-summary')).toHaveCount(0);
      }

      await expect(page.getByText(context.seededMemberName)).toHaveCount(0);
      await expect(page.getByText(context.claimTitle)).toHaveCount(0);
      await expect(page.getByText(context.claimCompanyName)).toHaveCount(0);
      await expect(page.getByText(context.internalHistoryNote)).toHaveCount(0);
      await expect(page.getByText(context.claimDocumentName)).toHaveCount(0);
    });
  });
});
