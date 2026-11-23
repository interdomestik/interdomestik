import { readPilotSwitch } from '@interdomestik/database/pilot-switch';
import { leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  cleanupPilotSalesTenants,
  finishSaleDuringPilotFlip,
  openPilotSalesContract,
  pilotSalesContractEnabled,
  seedPilotSalesTenant,
} from '../pilot-sales.contract-test-support';
import { request, seedLead, useSession } from './pilot-lead-sales.test-support';

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
      const aLead = await seedLead(dbAdmin, a, 'closed');
      const bLead = await seedLead(dbAdmin, b, 'inflight');
      const laterLead = await seedLead(dbAdmin, b, 'after-close');
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
});
