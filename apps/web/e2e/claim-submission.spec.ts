import { expect, test } from './fixtures/auth.fixture';

test.describe('Claim Creation Wizard', () => {
  test('should allow user to complete the claim wizard', async ({ authenticatedPage }) => {
    // 1. Navigate to New Claim
    await authenticatedPage.goto('/en/dashboard/claims/new');
    await expect(authenticatedPage.locator('h1')).toContainText('New Claim');

    // 2. Step 1: Category
    // Select a category (e.g., Service Issue)
    await authenticatedPage.getByTestId('category-service_issue').click();
    // Wait for animation (500ms in CSS)
    await authenticatedPage.waitForTimeout(600);
    await authenticatedPage.getByTestId('wizard-next').click();

    // 3. Step 2: Details
    // Fill required fields
    await authenticatedPage.getByLabel('Claim Title').fill('Flight Delay Test');
    await authenticatedPage.getByLabel('Company Name').fill('Air Albania');
    await authenticatedPage.getByLabel('Description').fill('Flight was delayed by 5 hours.');
    await authenticatedPage.getByLabel('Amount (Optional)').fill('600');
    // Incident Date (type=date input)
    // The label is "Date of Incident"
    // Using fill is more robust for date inputs. YYYY-MM-DD
    await authenticatedPage.getByLabel('Date of Incident').fill('2023-10-01'); // Pick 1st of month

    await authenticatedPage.getByTestId('wizard-next').click();

    // 4. Step 3: Evidence
    // Validate we are on Evidence step
    await expect(authenticatedPage.getByText('Add Evidence')).toBeVisible();
    // Skip upload for now (optional)
    await authenticatedPage.getByTestId('wizard-next').click();

    // 5. Step 4: Review
    // Validate summary
    await expect(authenticatedPage.getByText('Flight Delay Test')).toBeVisible();
    await expect(authenticatedPage.getByText('Air Albania')).toBeVisible();
    await expect(authenticatedPage.getByText('600 EUR')).toBeVisible();

    // Submit
    await authenticatedPage.waitForTimeout(1000); // Allow for enter animations

    // Explicitly verify we are on Review step
    await expect(authenticatedPage.getByRole('heading', { name: 'Review & Submit' })).toBeVisible({
      timeout: 10000,
    });
    await expect(authenticatedPage.getByTestId('wizard-next')).not.toBeVisible();

    const submitButton = authenticatedPage.getByTestId('wizard-submit');

    await expect(submitButton).toBeVisible();
    await expect(submitButton).toBeEnabled();
    await expect(submitButton).toHaveText(/Submit Claim/);
    await submitButton.click();

    // 6. Verify Redirection

    await expect(authenticatedPage).toHaveURL(/\/dashboard\/claims/);

    // 7. Verify Data in List
    await expect(authenticatedPage.getByText('Flight Delay Test')).toBeVisible();
  });
});
