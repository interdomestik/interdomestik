import { and, db, eq } from '@interdomestik/database';
import { agentCommissions, subscriptions } from '@interdomestik/database/schema';
import { expect, test } from './fixtures/auth.fixture';
import { gotoApp } from './utils/navigation';

const KS_TENANT_ID = 'tenant_ks';
const KS_MEMBER_ID = 'golden_ks_a_member_1';
const KS_SUBSCRIPTION_ID = 'golden_sub_ks_a_1';
const KS_CANONICAL_AGENT_ID = 'golden_ks_agent_a1';
const KS_DRIFT_AGENT_ID = 'golden_ks_b_agent_1';
const PC06_COMMISSION_ID = 'pc06_unresolved_ownership_commission';

async function seedUnresolvedOwnershipCommission() {
  await db
    .delete(agentCommissions)
    .where(
      and(eq(agentCommissions.id, PC06_COMMISSION_ID), eq(agentCommissions.tenantId, KS_TENANT_ID))
    );

  await db
    .update(subscriptions)
    .set({
      status: 'active',
      agentId: KS_DRIFT_AGENT_ID,
      cancelAtPeriodEnd: false,
      gracePeriodEndsAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(subscriptions.id, KS_SUBSCRIPTION_ID), eq(subscriptions.tenantId, KS_TENANT_ID)));

  await db.insert(agentCommissions).values({
    id: PC06_COMMISSION_ID,
    tenantId: KS_TENANT_ID,
    agentId: KS_DRIFT_AGENT_ID,
    memberId: KS_MEMBER_ID,
    subscriptionId: KS_SUBSCRIPTION_ID,
    type: 'upgrade',
    status: 'pending',
    amount: '19.00',
    currency: 'EUR',
    earnedAt: new Date(),
    paidAt: null,
    metadata: { source: 'pc06-enterprise-controls' },
  });
}

async function resetUnresolvedOwnershipCommission() {
  await db
    .delete(agentCommissions)
    .where(
      and(eq(agentCommissions.id, PC06_COMMISSION_ID), eq(agentCommissions.tenantId, KS_TENANT_ID))
    );

  await db
    .update(subscriptions)
    .set({
      status: 'active',
      agentId: KS_CANONICAL_AGENT_ID,
      cancelAtPeriodEnd: false,
      gracePeriodEndsAt: null,
      updatedAt: new Date(),
    })
    .where(and(eq(subscriptions.id, KS_SUBSCRIPTION_ID), eq(subscriptions.tenantId, KS_TENANT_ID)));
}

async function getCommissionStatus() {
  const [row] = await db
    .select({ status: agentCommissions.status })
    .from(agentCommissions)
    .where(
      and(eq(agentCommissions.id, PC06_COMMISSION_ID), eq(agentCommissions.tenantId, KS_TENANT_ID))
    );

  return row?.status ?? null;
}

test.describe('PC06 enterprise-safe controls', () => {
  test.afterEach(async () => {
    await resetUnresolvedOwnershipCommission();
  });

  test('admin bulk approve returns a typed control violation for unresolved ownership', async ({
    adminPage: page,
  }, testInfo) => {
    test.skip(!testInfo.project.name.includes('ks'), 'KS golden seed scenario');

    await seedUnresolvedOwnershipCommission();

    await gotoApp(page, '/admin/commissions', testInfo, { marker: 'bulk-approve-commissions' });
    await expect(page.getByRole('heading', { level: 1, name: /commission|komision/i })).toBeVisible(
      {
        timeout: 30_000,
      }
    );
    await expect(page.getByTestId(`commission-row-${PC06_COMMISSION_ID}`)).toBeVisible({
      timeout: 30_000,
    });

    await page.getByTestId(`commission-select-${PC06_COMMISSION_ID}`).click();
    await page.getByTestId('bulk-approve-commissions').click();

    const violation = page.getByTestId('commission-control-violation');
    await expect(violation).toContainText('FINANCE_BATCH_PAYABILITY_BLOCKED');
    await expect(violation).toContainText(PC06_COMMISSION_ID);

    await expect.poll(getCommissionStatus).toBe('pending');
  });
});
