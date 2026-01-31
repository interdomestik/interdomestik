import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('SQ Claim Wizard', () => {
  test('should show correct translations in Albanian', async ({ authenticatedPage }, testInfo) => {
    // Navigate to SQ version
    await gotoApp(authenticatedPage, routes.memberNewClaim('sq'), testInfo);

    // Check title (translated)
    await expect(authenticatedPage.getByRole('heading', { level: 1 })).toBeVisible(); // "Kërkesë e Re..."

    // Check "Next" button text (Should be "Vazhdo", NOT "common.next")
    // The button has testid 'wizard-next'
    const nextBtn = authenticatedPage.getByTestId('wizard-next');
    // We expect it to contain "Vazhdo"
    await expect(nextBtn).toContainText('Vazhdo', { timeout: 10000 });

    // Also check previous button is "Kthehu" (initially invisible but text should be loaded)
    const backBtn = authenticatedPage.getByTestId('wizard-back');
    await expect(backBtn).toHaveText('Kthehu');
  });
});
