/**
 * SQ Claim Wizard Regression Tests (STRICT)
 *
 * Specifically verifies that Albanian (SQ) translations are correctly loaded
 * and not showing translation keys (e.g. "common.next").
 */

import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('SQ Claim Wizard (Regression)', () => {
  test('should show correct translations in Albanian', async ({ authenticatedPage }, testInfo) => {
    // Navigate to SQ version explicitly
    await gotoApp(authenticatedPage, routes.memberNewClaim('sq'), testInfo, {
      marker: 'new-claim-page-ready',
    });

    // Check title (translated)
    await expect(authenticatedPage.getByTestId('wizard-step-title')).toBeVisible();

    // Check "Next" button text (Should be "Vazhdo", NOT "common.next")
    const nextBtn = authenticatedPage.getByTestId('wizard-next');
    await expect(nextBtn).toContainText('Vazhdo', { timeout: 10000 });

    // Check previous button text
    const backBtn = authenticatedPage.getByTestId('wizard-back');
    await expect(backBtn).toHaveText('Kthehu');
  });
});
