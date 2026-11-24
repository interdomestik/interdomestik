import { subscriptions } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  cleanupPilotSalesTenants,
  flipPilotSales,
  openPilotSalesContract,
  pilotSalesContractEnabled,
  seedPilotSalesTenant,
} from './pilot-sales.contract-test-support';

const request = vi.hoisted(() => ({ authenticate: vi.fn() }));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: request.authenticate }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));

describe.runIf(pilotSalesContractEnabled)(
  'billing-test activation under the restricted role',
  () => {
    it('refuses the direct upsert while sales are closed and permits it after reopening', async () => {
      const { dbAdmin, close } = await openPilotSalesContract();
      const tenantId = `pilot-test-billing-${randomUUID()}`;
      try {
        const fixture = await seedPilotSalesTenant(dbAdmin, tenantId, false);
        vi.stubEnv('BILLING_TEST_MODE', '1');
        vi.stubEnv('NEXT_PUBLIC_BILLING_TEST_MODE', '1');
        const { mockActivateSubscription } = await import('./billing-test');
        request.authenticate.mockResolvedValue({
          authority: fixture.agentAuthority,
          session: { user: { id: fixture.agentId } },
        });
        const coverage = () =>
          dbAdmin
            .select({ userId: subscriptions.userId, status: subscriptions.status })
            .from(subscriptions)
            .where(eq(subscriptions.tenantId, tenantId));

        expect(await mockActivateSubscription('standard', fixture.planKey)).toMatchObject({
          success: false,
          code: 'CLOSED',
        });
        expect(await coverage()).toEqual([]);
        await flipPilotSales(fixture.operatorAuthority, true, 1);
        expect(await mockActivateSubscription('standard', fixture.planKey)).toEqual({
          success: true,
        });
        expect(await coverage()).toEqual([{ userId: fixture.agentId, status: 'active' }]);
      } finally {
        try {
          await cleanupPilotSalesTenants(dbAdmin, [tenantId]);
        } finally {
          await close();
        }
      }
    }, 30_000);
  }
);
