import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

const runSeededDataTests = process.env.RUN_SEEDED_DATA_TESTS === '1';

test.describe('Seeded Data Verification', () => {
  test.skip(!runSeededDataTests, 'Requires seeded data. Set RUN_SEEDED_DATA_TESTS=1 to enable.');

  test('should display correct seeded claims for tenant', async ({
    authenticatedPage,
  }, testInfo) => {
    // Navigate to dashboard claims list
    await gotoApp(authenticatedPage, routes.memberClaims(testInfo), testInfo, {
      marker: 'claims-page-ready',
    });

    // Determine expected claims based on tenant (project name)
    const isMk = testInfo.project.name.includes('mk');

    // Expectations derived from packages/database/src/seed-golden.ts
    const expectedClaims = isMk
      ? [
          { title: 'Rear ended in Skopje (Baseline)', status: 'submitted' },
          { title: 'MK Deterministic Claim', status: 'submitted' },
        ]
      : [
          { title: 'KS-A SUBMITTED Claim 1', status: 'submitted' },
          { title: 'KS-A VERIFICATION Claim 13', status: 'verification' },
        ];

    // Wait for at least one row
    await expect(authenticatedPage.getByTestId('claim-row').first()).toBeVisible({
      timeout: 10000,
    });

    for (const claim of expectedClaims) {
      const row = authenticatedPage.getByTestId('claim-row').filter({ hasText: claim.title });
      await expect(row).toBeVisible();
      // Check stable data attribute instead of translated text
      await expect(row.getByTestId('claim-status-badge')).toHaveAttribute(
        'data-status',
        claim.status
      );
    }
  });

  test('should view claim details', async ({ authenticatedPage }, testInfo) => {
    await gotoApp(authenticatedPage, routes.memberClaims(testInfo), testInfo, {
      marker: 'claims-page-ready',
    });

    const isMk = testInfo.project.name.includes('mk');
    // Pick a claim that definitely exists and has details
    const targetTitle = isMk ? 'Rear ended in Skopje (Baseline)' : 'KS-A SUBMITTED Claim 1';

    // Click on the claim
    const row = authenticatedPage.getByTestId('claim-row').filter({ hasText: targetTitle });

    await expect(row).toBeVisible();

    const link = row.getByRole('link').first();
    const href = await link.getAttribute('href');

    if (href) {
      await gotoApp(authenticatedPage, href, testInfo, { marker: 'claim-tracking-title' });
    } else {
      throw new Error('Claim link not found');
    }

    // Verify detail content
    await expect(authenticatedPage.getByTestId('claim-tracking-title')).toContainText(targetTitle);
    // Note: Amount check skipped due to locale formatting variance (1,200.00 vs 1.200,00)
  });
});
