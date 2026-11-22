import { assertNewSalesOpen, readPilotSwitch } from '@interdomestik/database/pilot-switch';
import {
  leadPaymentAttempts,
  memberLeads,
  membershipCards,
  subscriptions,
  user,
} from '@interdomestik/database/schema';
import type { TenantTransaction } from '@interdomestik/database/tenant';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanupPilotSalesTenants,
  finishSaleDuringPilotFlip,
  flipPilotSales,
  openPilotSalesContract,
  pilotSalesContractEnabled,
  seedPilotSalesTenant,
} from '../pilot-sales.contract-test-support';

const request = vi.hoisted(() => ({
  authenticate: vi.fn(),
  hold: undefined as ((tx: TenantTransaction) => Promise<void>) | undefined,
}));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: request.authenticate }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@interdomestik/database/pilot-switch', async original => {
  const actual = await original<typeof import('@interdomestik/database/pilot-switch')>();
  const check: typeof assertNewSalesOpen = async (tx, tenant) => {
    await actual.assertNewSalesOpen(tx, tenant);
    await request.hold?.(tx);
  };
  return { ...actual, assertNewSalesOpen: check };
});

type Fixture = Awaited<ReturnType<typeof seedPilotSalesTenant>>;
type SessionRole = 'agent' | 'staff';
function useSession(fixture: Fixture, role: SessionRole = 'agent') {
  const id = role === 'agent' ? fixture.agentId : fixture.staffId;
  request.authenticate.mockResolvedValue({
    authority: role === 'agent' ? fixture.agentAuthority : fixture.staffAuthority,
    session: { user: { id, role, branchId: fixture.branchId, tenantId: fixture.tenantId } },
  });
}

describe.runIf(pilotSalesContractEnabled)('lead sales under a restricted PostgreSQL role', () => {
  let contract: Awaited<ReturnType<typeof openPilotSalesContract>> | undefined;
  beforeAll(async () => {
    contract = await openPilotSalesContract();
  });
  afterAll(async () => {
    await contract?.close();
  });

  it('isolates S1/S1b across tenants and finishes an in-flight sale before closing the switch', async () => {
    const { dbAdmin } = contract!;
    const tenantIds = [`pilot-lead-closed-${randomUUID()}`, `pilot-lead-open-${randomUUID()}`];
    try {
      const a = await seedPilotSalesTenant(dbAdmin, tenantIds[0], false);
      const b = await seedPilotSalesTenant(dbAdmin, tenantIds[1], true);
      const { startPaymentAction } = await import('./payment');
      const { updateLeadStatusAction } = await import('./update');
      const { updateLeadStatus } = await import('@/features/agent/leads/actions');
      const { withTenantAuthority } =
        await import('@interdomestik/database/tenant-authority-context');
      const seedLead = async (fixture: Fixture, suffix: string) => {
        const id = `${fixture.tenantId}-${suffix}`;
        await dbAdmin.insert(memberLeads).values({
          id,
          tenantId: fixture.tenantId,
          branchId: fixture.branchId,
          agentId: fixture.agentId,
          firstName: 'Fixture',
          lastName: 'Lead',
          email: `${id}@example.test`,
          phone: '+38349000000',
          consentNoticeVersion: 'pre-consent-legacy',
          captureChannel: 'legacy',
        });
        return id;
      };
      const aLead = await seedLead(a, 'closed');
      const bLead = await seedLead(b, 'inflight');
      const laterLead = await seedLead(b, 'after-close');
      const start = (leadId: string) =>
        startPaymentAction({ leadId, amountCents: 2000, method: 'cash', priceId: 'standard' });
      const leadWrites = async (id: string, status: string, attempts: number) => {
        expect(
          await dbAdmin
            .select({ status: memberLeads.status })
            .from(memberLeads)
            .where(eq(memberLeads.id, id))
        ).toEqual([{ status }]);
        expect(
          await dbAdmin.select().from(leadPaymentAttempts).where(eq(leadPaymentAttempts.leadId, id))
        ).toHaveLength(attempts);
      };
      expect(
        await withTenantAuthority(a.agentAuthority, tx =>
          readPilotSwitch(tx, b.tenantId, 'new_sales')
        )
      ).toMatchObject({ state: 'closed', wellFormed: false });
      useSession(a);
      expect(await start(aLead)).toMatchObject({ success: false, code: 'CLOSED' });
      expect(await updateLeadStatus(aLead, 'payment_pending')).toMatchObject({
        success: false,
        code: 'CLOSED',
      });
      expect(await updateLeadStatusAction({ leadId: aLead, status: 'converted' })).toMatchObject({
        success: false,
        code: 'CLOSED',
      });
      expect(await start(bLead)).toMatchObject({ success: false });
      await leadWrites(aLead, 'new', 0);
      await leadWrites(bLead, 'new', 0);

      useSession(b, 'staff');
      expect(await start(bLead)).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
      await leadWrites(bLead, 'new', 0);
      useSession(b);
      expect(
        await startPaymentAction({
          leadId: bLead,
          amountCents: 2000,
          method: 'cash',
          priceId: 'standard',
          tenantId: a.tenantId,
        })
      ).toMatchObject({ success: false });
      await leadWrites(bLead, 'new', 0);

      expect(
        await finishSaleDuringPilotFlip({
          dbAdmin,
          operatorAuthority: b.operatorAuthority,
          expectedRevision: 1,
          intercept: hold => {
            request.hold = hold;
          },
          sell: () => start(bLead),
        })
      ).toMatchObject({ success: true });
      await leadWrites(bLead, 'payment_pending', 1);
      expect(await start(laterLead)).toMatchObject({ success: false, code: 'CLOSED' });
      await leadWrites(laterLead, 'new', 0);
    } finally {
      await cleanupPilotSalesTenants(dbAdmin, tenantIds);
    }
  }, 30_000);

  it('fulfills durable verified cash after the flip and rejects unverified admission without effects', async () => {
    const { dbAdmin } = contract!;
    const tenantId = `pilot-cash-${randomUUID()}`;
    try {
      const fixture = await seedPilotSalesTenant(dbAdmin, tenantId, true);
      const { convertLeadToMember } = await import('@interdomestik/domain-leads');
      const paidId = `${tenantId}-paid`;
      const otherId = `${tenantId}-other`;
      const leadEmail = (id: string) => `${id}@example.test`;
      await dbAdmin.insert(memberLeads).values(
        [paidId, otherId].map(id => ({
          id,
          tenantId,
          branchId: fixture.branchId,
          agentId: fixture.agentId,
          firstName: 'Fixture',
          lastName: 'Cash',
          email: leadEmail(id),
          phone: '+38349000000',
          status: 'paid' as const,
          consentNoticeVersion: 'pre-consent-legacy',
          captureChannel: 'legacy' as const,
        }))
      );
      const admittedId = `${tenantId}-admitted`;
      const pendingId = `${tenantId}-pending`;
      // Seed the durable records the held cash approval action is intended to commit.
      await dbAdmin.insert(leadPaymentAttempts).values([
        {
          id: admittedId,
          tenantId,
          leadId: paidId,
          method: 'cash',
          status: 'succeeded',
          amount: 2000,
          verifiedBy: fixture.staffId,
          verifiedAt: new Date(),
        },
        {
          id: pendingId,
          tenantId,
          leadId: paidId,
          method: 'cash',
          status: 'pending',
          amount: 2000,
        },
      ]);
      await flipPilotSales(fixture.operatorAuthority, false, 1);

      await expect(
        convertLeadToMember(fixture.staffAuthority, {
          leadId: paidId,
          admission: { kind: 'check' },
        })
      ).rejects.toMatchObject({ code: 'CLOSED' });
      for (const [leadId, attemptId] of [
        [paidId, pendingId],
        [otherId, admittedId],
      ]) {
        await expect(
          convertLeadToMember(fixture.staffAuthority, {
            leadId,
            admission: { kind: 'verified_cash', attemptId },
          })
        ).rejects.toThrow('Lead payment is not verified');
      }
      expect(
        await dbAdmin
          .select()
          .from(user)
          .where(and(eq(user.tenantId, tenantId), eq(user.role, 'member')))
      ).toEqual([]);
      expect(
        await dbAdmin.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId))
      ).toEqual([]);
      expect(
        await dbAdmin.select().from(membershipCards).where(eq(membershipCards.tenantId, tenantId))
      ).toEqual([]);

      const result = await convertLeadToMember(fixture.staffAuthority, {
        leadId: paidId,
        admission: { kind: 'verified_cash', attemptId: admittedId },
      });
      expect(result).toMatchObject({ email: leadEmail(paidId) });
      expect(
        await dbAdmin
          .select({ userId: subscriptions.userId })
          .from(subscriptions)
          .where(eq(subscriptions.tenantId, tenantId))
      ).toEqual([{ userId: result?.userId }]);
      expect(
        await dbAdmin
          .select({ userId: membershipCards.userId })
          .from(membershipCards)
          .where(eq(membershipCards.tenantId, tenantId))
      ).toEqual([{ userId: result?.userId }]);
      expect(
        await convertLeadToMember(fixture.staffAuthority, {
          leadId: paidId,
          admission: { kind: 'verified_cash', attemptId: admittedId },
        })
      ).toBeNull();
    } finally {
      await cleanupPilotSalesTenants(dbAdmin, [tenantId]);
    }
  }, 30_000);
});
