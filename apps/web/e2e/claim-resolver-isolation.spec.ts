import { expect, test } from './fixtures/auth.fixture';
import { getTenantFromTestInfo } from './fixtures/auth.project';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

// The admin claim-number resolver opens a claim of the admin's own tenant and answers 404 for a
// claim of another tenant. Both sides are asserted, so a 404 for any other reason (a wrong route,
// a missing seed claim) fails the positive control instead of passing as isolation.
const SEEDED_CLAIM_NUMBERS = { ks: 'CLM-XK-2026-800001', mk: 'CLM-MK-2026-000001' } as const;

test.describe('Claim Resolver Isolation', () => {
  test('a tenant admin resolves its own claim number and not the other tenant one', async ({
    adminPage: page,
  }, testInfo) => {
    const own = getTenantFromTestInfo(testInfo) === 'mk' ? 'mk' : 'ks';
    const other = own === 'mk' ? 'ks' : 'mk';
    const resolver = (tenant: 'ks' | 'mk') =>
      `${routes.adminClaims(testInfo)}/number/${SEEDED_CLAIM_NUMBERS[tenant]}`;

    await gotoApp(page, resolver(own), testInfo, { marker: 'page-ready' });
    await expect(page).toHaveURL(
      new RegExp(`/admin/claims/(?!number/)[^/?]+\\?ref=${SEEDED_CLAIM_NUMBERS[own]}`)
    );

    await gotoApp(page, resolver(other), testInfo, { marker: 'not-found-page' });
    await expect(page).toHaveURL(new RegExp(`/admin/claims/number/${SEEDED_CLAIM_NUMBERS[other]}`));
  });
});
