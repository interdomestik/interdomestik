import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Claim Creation Wizard', () => {
  test('should allow user to complete the claim wizard', async ({
    authenticatedPage,
  }, testInfo) => {
    test.setTimeout(60000); // Wizard can be slow

    // 1. Navigate to New Claim
    await gotoApp(authenticatedPage, routes.memberNewClaim(testInfo), testInfo, {
      marker: 'new-claim-page-ready',
    });

    // 2. Step 1: Category
    // Select a category (e.g., Service Issue)
    await authenticatedPage.getByTestId('category-vehicle').click();
    await authenticatedPage.getByTestId('wizard-next').click();

    // 3. Step 2: Details
    // Fill required fields
    await authenticatedPage.getByTestId('input-title').fill('Flight Delay Test');
    await authenticatedPage.getByTestId('input-company').fill('Air Albania');
    await authenticatedPage.getByTestId('input-description').fill('Flight was delayed by 5 hours.');
    await authenticatedPage.getByTestId('input-amount').fill('600');
    await authenticatedPage.getByTestId('input-date').fill('2023-10-01');

    await authenticatedPage.getByTestId('wizard-next').click();

    // 4. Step 3: Evidence
    // Validate we are on Evidence step
    await expect(authenticatedPage.getByTestId('wizard-next')).toBeVisible();
    await authenticatedPage.getByTestId('wizard-next').click();

    // 5. Review / Submit
    // Wait for review step to load (animation stability)
    await expect(authenticatedPage.getByTestId('wizard-review-step')).toBeVisible();
    // Ensure previous button is gone to prevent overlap/confusion
    await expect(authenticatedPage.getByTestId('wizard-next')).not.toBeVisible();

    const submitButton = authenticatedPage.getByTestId('wizard-submit');
    // Ensure button is ready
    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // 6. Verify Redirection + data in list    // Wait for the claims list page marker
    await expect(authenticatedPage.getByTestId('claims-page-ready')).toBeVisible({
      timeout: 20000,
    });
  });
});
