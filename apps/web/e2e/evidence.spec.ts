/**
 * Evidence Upload E2E Tests (STRICT)
 *
 * Focused on wizard evidence step validation and upload stubbing.
 */

import { Buffer } from 'buffer';
import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Evidence uploads', () => {
  test('blocks disallowed mime types before upload', async ({ authenticatedPage }, testInfo) => {
    await gotoApp(authenticatedPage, routes.memberNewClaim(testInfo), testInfo, {
      marker: 'new-claim-page-ready',
    });

    // Step 1: Category
    await authenticatedPage.getByTestId('category-travel').click();
    await authenticatedPage.getByTestId('wizard-next').click();

    // Step 2: Details
    await authenticatedPage.getByTestId('input-title').fill('Test Claim Title');
    await authenticatedPage.getByTestId('input-company').fill('Test Company');
    await authenticatedPage
      .getByTestId('input-description')
      .fill('This is a test description that should be long enough.');
    await authenticatedPage.getByTestId('input-date').fill('2023-10-10');
    await authenticatedPage.getByTestId('wizard-next').click();

    // Step 3: Evidence
    const fileInput = authenticatedPage.locator('input[type="file"]');

    await fileInput.setInputFiles({
      name: 'malware.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('bad-binary'),
    });

    await expect(authenticatedPage.getByTestId('evidence-error')).toBeVisible();
  });

  test.skip('accepts allowed files when upload endpoints are stubbed', async ({
    authenticatedPage,
  }, testInfo) => {
    await gotoApp(authenticatedPage, routes.memberNewClaim(testInfo), testInfo, {
      marker: 'new-claim-page-ready',
    });

    // Step 1: Category
    await authenticatedPage.getByTestId('category-travel').click();
    await authenticatedPage.getByTestId('wizard-next').click();

    // Step 2: Details
    await authenticatedPage.getByTestId('input-title').fill('Test Claim Title');
    await authenticatedPage.getByTestId('input-company').fill('Test Company');
    await authenticatedPage
      .getByTestId('input-description')
      .fill('This is a test description that should be long enough.');
    await authenticatedPage.getByTestId('input-date').fill('2023-10-10');
    await authenticatedPage.getByTestId('wizard-next').click();

    const fileInput = authenticatedPage.locator('input[type="file"]');

    await fileInput.setInputFiles({
      name: 'receipt.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    });

    // Verify item appeared in list via data-file-name attribute
    const evidenceItem = authenticatedPage.locator(
      '[data-testid="evidence-item"][data-file-name="receipt.pdf"]'
    );
    await expect(evidenceItem).toBeVisible({ timeout: 10000 });
  });
});
