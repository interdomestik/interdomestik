import { E2E_CASH_STATE_FIXTURES, type E2ECashStateKey } from '@interdomestik/database';
import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

// PC07: cash verification truth over the seeded read-only states in KS-D. Open attempts (info
// requested, resubmitted) stay in the operations queue; decided ones (rejected, approved with or
// without the member conversion) leave it for history. A tenant admin elsewhere sees none of them.
// Expectations are written here, not read from the seed catalogue.
const EXPECTED_VIEW: Record<E2ECashStateKey, 'queue' | 'history'> = {
  NEEDS_INFO: 'queue',
  RESUBMITTED: 'queue',
  REJECTED: 'history',
  APPROVED_CONVERSION_PENDING: 'history',
  CONVERTED: 'history',
};
const CASES = Object.entries(EXPECTED_VIEW) as [E2ECashStateKey, 'queue' | 'history'][];

test.describe('PC07 cash verification state truth', () => {
  for (const view of ['queue', 'history'] as const) {
    test(`the ${view} view lists exactly the KS cash states that belong to it`, async ({
      adminPage: page,
    }, testInfo) => {
      const seededTenant = testInfo.project.name.includes('ks');
      for (const [key, expected] of CASES) {
        const { email } = E2E_CASH_STATE_FIXTURES[key];
        const params = new URLSearchParams({ view, query: email });
        await gotoApp(page, `${routes.adminLeads(testInfo)}?${params}`, testInfo, {
          marker: 'verification-ops-page',
        });
        await expect(page.getByTestId('verification-search-pending')).toHaveCount(0);
        const rows = page
          .getByTestId('cash-verification-row')
          .filter({ visible: true })
          .filter({ has: page.getByText(email, { exact: true }) });
        const count = seededTenant && expected === view ? 1 : 0;
        await expect(rows, `${key} in ${view}`).toHaveCount(count);
      }
    });
  }
});
