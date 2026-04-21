import type { Page, TestInfo } from '@playwright/test';
import { and, db, eq, subscriptions } from '@interdomestik/database';
import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

const KS_TENANT_ID = 'tenant_ks';
const KS_MEMBER_ID = 'golden_ks_a_member_1';
const KS_SUBSCRIPTION_ID = 'golden_sub_ks_a_1';
const FIXED_NOW = new Date('2026-04-21T12:00:00.000Z');
const FUTURE_GRACE_END = new Date('2026-04-23T12:00:00.000Z');
const EXPIRED_GRACE_END = new Date('2026-04-20T12:00:00.000Z');
const PERIOD_END = new Date('2026-05-21T12:00:00.000Z');
const WATCH_DELAY_MS = Number(process.env.PC05_WATCH_DELAY_MS ?? 0);

type SubscriptionStatus = 'active' | 'past_due' | 'paused' | 'canceled' | 'trialing' | 'expired';

async function setWatchedSubscriptionState({
  status,
  cancelAtPeriodEnd = false,
  gracePeriodEndsAt = null,
}: {
  status: SubscriptionStatus;
  cancelAtPeriodEnd?: boolean;
  gracePeriodEndsAt?: Date | null;
}) {
  const updated = await db
    .update(subscriptions)
    .set({
      status,
      cancelAtPeriodEnd,
      gracePeriodEndsAt,
      pastDueAt: status === 'past_due' ? FIXED_NOW : null,
      currentPeriodEnd: PERIOD_END,
      updatedAt: FIXED_NOW,
    })
    .where(and(eq(subscriptions.id, KS_SUBSCRIPTION_ID), eq(subscriptions.tenantId, KS_TENANT_ID)))
    .returning({ id: subscriptions.id });

  expect(updated, 'Golden KS subscription must exist for PC05 lifecycle scenario').toHaveLength(1);
}

async function resetWatchedSubscription() {
  await setWatchedSubscriptionState({
    status: 'active',
    cancelAtPeriodEnd: false,
    gracePeriodEndsAt: null,
  });
}

async function watchStep(page: Page, label: string) {
  if (WATCH_DELAY_MS <= 0) return;

  console.log(`[PC05 Watch] ${label}`);
  await page.evaluate(message => {
    const id = 'pc05-watch-step';
    const marker = document.getElementById(id) ?? document.createElement('output');

    marker.id = id;
    marker.setAttribute('aria-live', 'polite');
    marker.textContent = `PC05 lifecycle: ${message}`;
    marker.style.cssText = [
      'position:fixed',
      'left:16px',
      'top:16px',
      'z-index:2147483647',
      'max-width:min(520px,calc(100vw - 32px))',
      'padding:10px 12px',
      'border:1px solid #1d4ed8',
      'border-radius:6px',
      'background:#eff6ff',
      'color:#1e3a8a',
      'font:600 14px/1.35 system-ui,sans-serif',
      'box-shadow:0 8px 24px rgba(30,58,138,0.18)',
    ].join(';');

    if (!marker.isConnected) document.body.appendChild(marker);
  }, label);
  await page.waitForTimeout(WATCH_DELAY_MS);
}

async function openMemberDetail(page: Page, testInfo: TestInfo, label: string) {
  await watchStep(page, label);
  await gotoApp(page, `${routes.adminUsers(testInfo)}/${KS_MEMBER_ID}`, testInfo, {
    marker: 'body',
  });
  await expect(page.getByTestId('membership-lifecycle-status')).toBeVisible({ timeout: 30_000 });
}

async function expectLifecycleStatus(page: Page, status: string) {
  await expect(page.getByTestId('membership-lifecycle-status')).toHaveAttribute(
    'data-lifecycle-status',
    status
  );
}

test.describe('PC05 membership lifecycle reporting truth', () => {
  test.afterEach(async () => {
    await resetWatchedSubscription();
  });

  test('admin member detail derives lifecycle badges from the shared subscription read model', async ({
    adminPage: page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.includes('ks'), 'KS golden seed scenario');

    await setWatchedSubscriptionState({
      status: 'past_due',
      gracePeriodEndsAt: FUTURE_GRACE_END,
    });
    await openMemberDetail(page, testInfo, 'Open member detail with subscription inside grace');

    await watchStep(page, 'Admin badge reports active_in_grace and shows grace end context');
    await expectLifecycleStatus(page, 'active_in_grace');
    await expect(page.getByTestId('membership-lifecycle-status-detail')).toBeVisible();

    await setWatchedSubscriptionState({
      status: 'past_due',
      gracePeriodEndsAt: EXPIRED_GRACE_END,
    });
    await openMemberDetail(page, testInfo, 'Reload member detail after grace expiry');

    await watchStep(page, 'Admin badge reports grace_expired from the same subscription row');
    await expectLifecycleStatus(page, 'grace_expired');
    await expect(page.getByTestId('membership-lifecycle-status-detail')).toHaveCount(0);

    await setWatchedSubscriptionState({
      status: 'active',
      cancelAtPeriodEnd: true,
      gracePeriodEndsAt: null,
    });
    await openMemberDetail(page, testInfo, 'Reload member detail with scheduled cancellation');

    await watchStep(page, 'Admin badge reports scheduled_cancel and shows access end context');
    await expectLifecycleStatus(page, 'scheduled_cancel');
    await expect(page.getByTestId('membership-lifecycle-status-detail')).toBeVisible();
  });
});
