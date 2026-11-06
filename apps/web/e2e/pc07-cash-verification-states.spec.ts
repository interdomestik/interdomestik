import { E2E_CASH_STATE_FIXTURES, E2E_USERS, type E2ECashStateKey } from '@interdomestik/database';
import en from '../src/messages/en/admin-leads.json';
import mk from '../src/messages/mk/admin-leads.json';
import sq from '../src/messages/sq/admin-leads.json';
import sr from '../src/messages/sr/admin-leads.json';
import { expect, test } from './fixtures/auth.fixture';
import { getTenantFromTestInfo } from './fixtures/auth.project';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

// PC07: cash verification truth over the seeded read-only states in KS-D. Open attempts (info
// requested, resubmitted) stay in the operations queue with their decision actions; decided ones
// (rejected, approved with or without the member conversion) leave it for history with their
// verifier. Each row shows its own status label. A tenant admin elsewhere sees none of them.
// Expectations are written here, not read from the seed catalogue.
type View = 'queue' | 'history';
type Label = 'needs_info' | 'resubmitted' | 'rejected' | 'succeeded';
const EXPECTED: Record<E2ECashStateKey, { view: View; label: Label }> = {
  NEEDS_INFO: { view: 'queue', label: 'needs_info' },
  RESUBMITTED: { view: 'queue', label: 'resubmitted' },
  REJECTED: { view: 'history', label: 'rejected' },
  APPROVED_CONVERSION_PENDING: { view: 'history', label: 'succeeded' },
  CONVERTED: { view: 'history', label: 'succeeded' },
};
const CASES = Object.entries(EXPECTED) as [E2ECashStateKey, { view: View; label: Label }][];
const STATUS = {
  de: sq.admin.leads.status,
  en: en.admin.leads.status,
  hr: sq.admin.leads.status,
  mk: mk.admin.leads.status,
  sq: sq.admin.leads.status,
  sr: sr.admin.leads.status,
};
const ACTIONS = ['cash-approve', 'cash-needs-info', 'cash-reject'];

test.describe('PC07 cash verification state truth', () => {
  for (const view of ['queue', 'history'] as const) {
    test(`the ${view} view shows exactly the KS cash states that belong to it`, async ({
      adminPage: page,
    }, testInfo) => {
      const seededTenant = getTenantFromTestInfo(testInfo) === 'ks';
      const labels = STATUS[routes.getLocale(testInfo)];
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
        const listed = seededTenant && expected.view === view;
        await expect(rows, `${key} in ${view}`).toHaveCount(listed ? 1 : 0);
        if (!listed) continue;

        await expect(rows, `${key} label`).toContainText(labels[expected.label]);
        for (const action of ACTIONS) {
          await expect(rows.getByTestId(action), `${key} ${action}`).toHaveCount(
            view === 'queue' ? 1 : 0
          );
        }
        if (view === 'history') {
          await expect(rows, `${key} verifier`).toContainText(E2E_USERS.KS_ADMIN.name);
        }
      }
    });
  }
});
