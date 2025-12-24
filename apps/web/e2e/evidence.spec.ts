/**
 * Evidence Upload E2E Tests
 *
 * Focused on wizard evidence step validation and upload stubbing.
 * Uses auth fixture; skips gracefully if auth is not configured in the environment.
 */

import { Buffer } from 'buffer';
import { expect, isLoggedIn, test } from './fixtures/auth.fixture';

async function requireAuthOrSkip(page: import('@playwright/test').Page) {
  if (page.url().includes('/login')) {
    test.skip(true, 'Auth not configured for E2E environment');
  }
  const loggedIn = await isLoggedIn(page);
  if (!loggedIn) {
    test.skip(true, 'Auth not configured for E2E environment');
  }
}

test.describe('Evidence uploads', () => {
  test('blocks disallowed mime types before upload', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/member/claims/new');
    // await requireAuthOrSkip(authenticatedPage);

    const fileInput = authenticatedPage.locator('input[type="file"]');
    await fileInput.waitFor({ state: 'attached' });

    await fileInput.setInputFiles({
      name: 'malware.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('bad-binary'),
    });

    await expect(
      authenticatedPage.locator('text=Only PDF, JPG, or PNG files are allowed.')
    ).toBeVisible();
  });

  test('accepts allowed files when upload endpoints are stubbed', async ({ authenticatedPage }) => {
    // Stub API for signed upload
    await authenticatedPage.route('**/api/uploads', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          upload: {
            path: 'pii/claims/user-123/unassigned/file-1',
            token: 'signed-token',
            bucket: 'claim-evidence',
            signedUrl: 'https://storage.local/fake',
          },
          classification: 'pii',
        }),
      })
    );

    // Stub Supabase storage upload calls (any host with storage/v1)
    await authenticatedPage.route('**/storage/v1/**', route =>
      route.fulfill({ status: 200, body: '' })
    );

    await authenticatedPage.goto('/en/member/claims/new');
    // await requireAuthOrSkip(authenticatedPage);

    const fileInput = authenticatedPage.locator('input[type="file"]');
    await fileInput.waitFor({ state: 'attached' });

    await fileInput.setInputFiles({
      name: 'receipt.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4'),
    });

    await expect(authenticatedPage.getByText('receipt.pdf')).toBeVisible();
  });
});
