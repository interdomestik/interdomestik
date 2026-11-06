import {
  E2E_LIFECYCLE_INSTANTS,
  E2E_MEMBERSHIP_LIFECYCLE_FIXTURES,
  E2E_USER_IDS,
  type E2EMembershipLifecycleKey,
} from '@interdomestik/database';
import type { TestInfo } from '@playwright/test';
import { expect, test } from './fixtures/auth.fixture';
import { signInAs } from './gate/nine-role-actor';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

// PC05: lifecycle truth over the seeded read-only states. Each state is its own KS member, so no
// shared subscription row is mutated and the cases need no serial order or reset. The admin profile
// reports a numbered member without a subscription as `registered`; the portal bucket is `none`.
type Expected = { bucket: string; admin?: string; access: 'allowed' | 'denied'; detail: boolean };

const EXPECTED: Record<E2EMembershipLifecycleKey, Expected> = {
  TRIALING: { bucket: 'trialing', access: 'allowed', detail: false },
  PAST_DUE_IN_GRACE: { bucket: 'active_in_grace', access: 'allowed', detail: true },
  PAST_DUE_GRACE_EXPIRED: { bucket: 'grace_expired', access: 'denied', detail: false },
  SCHEDULED_CANCEL: { bucket: 'scheduled_cancel', access: 'allowed', detail: true },
  CANCELED: { bucket: 'canceled', access: 'denied', detail: false },
  EXPIRED: { bucket: 'canceled', access: 'denied', detail: false },
  NO_SUBSCRIPTION: { bucket: 'none', admin: 'registered', access: 'denied', detail: false },
};
const CASES = Object.entries(EXPECTED) as [E2EMembershipLifecycleKey, Expected][];

function requireKsHost(testInfo: TestInfo) {
  test.skip(!testInfo.project.name.includes('ks'), 'Lifecycle members are seeded on KS'); // NOSONAR -- KS-only golden-seed states.
}

test.describe('PC05 membership lifecycle reporting truth', () => {
  test('admin member detail derives each lifecycle badge from the shared read model', async ({
    adminPage: page,
  }, testInfo) => {
    requireKsHost(testInfo);
    for (const [key, expected] of CASES) {
      const memberId = E2E_USER_IDS[E2E_MEMBERSHIP_LIFECYCLE_FIXTURES[key].member];
      await gotoApp(page, `${routes.adminUsers(testInfo)}/${memberId}`, testInfo, {
        marker: 'body',
      });
      const ready = page.getByTestId('dashboard-page-ready');
      await expect(ready.getByTestId('membership-lifecycle-status'), key).toHaveAttribute(
        'data-lifecycle-status',
        expected.admin ?? expected.bucket,
        { timeout: 30_000 }
      );
      await expect(ready.getByTestId('membership-lifecycle-status-detail'), key).toHaveCount(
        expected.detail ? 1 : 0
      );
    }
  });

  CASES.forEach(([key, expected], index) => {
    test(`member portal shows the ${key} consequence without inventing access`, async ({
      page,
    }, testInfo) => {
      requireKsHost(testInfo);
      const { member } = E2E_MEMBERSHIP_LIFECYCLE_FIXTURES[key];
      await signInAs(page, testInfo, member, `10.205.0.${index + 1}`);
      await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'member-dashboard-ready' });

      const membership = page.getByTestId('member-membership-access').first();
      await expect(membership.locator('[data-lifecycle-status]')).toHaveAttribute(
        'data-lifecycle-status',
        expected.bucket
      );
      await expect(membership.locator('[data-access]')).toHaveAttribute(
        'data-access',
        expected.access
      );
      if (key === 'PAST_DUE_IN_GRACE') {
        const periodEnd = new Date(E2E_LIFECYCLE_INSTANTS.PAST);
        await expect(membership).toContainText(
          periodEnd.toLocaleDateString(routes.getLocale(testInfo), { timeZone: 'UTC' })
        );
      }
    });
  });
});
