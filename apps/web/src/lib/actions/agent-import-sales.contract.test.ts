import {
  cleanupPilotSalesTenants,
  finishSaleDuringPilotFlip,
  openPilotSalesContract,
  pilotSalesContractEnabled,
  seedPilotSalesTenant,
} from '@/actions/pilot-sales.contract-test-support';
import type { TenantTransaction } from '@interdomestik/database';
import { readPilotSwitch } from '@interdomestik/database/pilot-switch';
import { agentSettings, subscriptions, tenantSettings, user } from '@interdomestik/database/schema';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => ({
  authority: null as TenantAuthority | null,
  session: null as { user: { id: string; tenantId: string; branchId: string } } | null,
  afterAdmission: undefined as ((tx: TenantTransaction) => Promise<void>) | undefined,
}));

vi.mock('./agent/context', () => ({
  getAgentAuthority: async () => request.authority,
  getAgentSession: async () => request.session,
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@interdomestik/database/pilot-switch', async importOriginal => {
  const actual = await importOriginal<typeof import('@interdomestik/database/pilot-switch')>();
  return {
    ...actual,
    async assertNewSalesOpen(tx: TenantTransaction, tenantId: string) {
      await actual.assertNewSalesOpen(tx, tenantId);
      await request.afterAdmission?.(tx);
    },
  };
});

type PilotTenant = Awaited<ReturnType<typeof seedPilotSalesTenant>>;

function importForm(emails: string[], injectedTenant: string) {
  const form = new FormData();
  form.set(
    'rowsJson',
    JSON.stringify(
      emails.map(email => ({
        email,
        fullName: 'Sponsored Member',
        planId: 'standard',
        phone: '+38344111000',
        tenantId: injectedTenant,
      }))
    )
  );
  return form;
}

function asAgent(tenant: PilotTenant) {
  request.authority = tenant.agentAuthority;
  request.session = {
    user: { id: tenant.agentId, tenantId: tenant.tenantId, branchId: tenant.branchId },
  };
}

describe.runIf(pilotSalesContractEnabled)(
  'sponsored imports under the restricted database role',
  () => {
    it('checks the authority tenant in each row transaction and stops after a concurrent close', async () => {
      const db = await openPilotSalesContract();
      const run = randomUUID();
      const tenantIds = [`pilot_import_closed_${run}`, `pilot_import_open_${run}`];
      const refused = `refused-${run}@example.test`;
      const first = `first-${run}@example.test`;
      const stopped = `stopped-${run}@example.test`;
      const unattempted = `unattempted-${run}@example.test`;
      const later = `later-${run}@example.test`;
      try {
        const closed = await seedPilotSalesTenant(db.dbAdmin, tenantIds[0], false);
        const open = await seedPilotSalesTenant(db.dbAdmin, tenantIds[1], true);
        await db.dbAdmin.insert(agentSettings).values(
          [closed, open].map(tenant => ({
            id: randomUUID(),
            tenantId: tenant.tenantId,
            agentId: tenant.agentId,
            tier: 'office',
          }))
        );
        await db.dbAdmin.insert(tenantSettings).values(
          tenantIds.map(tenantId => ({
            id: randomUUID(),
            tenantId,
            category: 'acquisition',
            key: 'sponsored_import',
            value: { enabled: true },
          }))
        );
        const [{ importMembers }, { withTenantAuthority }] = await Promise.all([
          import('./agent'),
          import('@interdomestik/database/tenant-authority-context'),
        ]);

        asAgent(closed);
        await expect(
          importMembers(null, importForm([refused], open.tenantId))
        ).resolves.toMatchObject({
          code: 'CLOSED',
          summary: { total: 1, imported: 0, failed: 1 },
        });
        const foreignSwitch = await withTenantAuthority(closed.agentAuthority, tx =>
          readPilotSwitch(tx, open.tenantId, 'new_sales', { lock: 'share' })
        );
        expect(foreignSwitch).toEqual({ state: 'closed', revision: 0, wellFormed: false });

        asAgent(open);
        const imported = await finishSaleDuringPilotFlip({
          dbAdmin: db.dbAdmin,
          operatorAuthority: open.operatorAuthority,
          expectedRevision: 1,
          intercept: hold => {
            request.afterAdmission = hold;
          },
          sell: () =>
            importMembers(null, importForm([first, stopped, unattempted], closed.tenantId)),
        });
        expect(imported).toMatchObject({
          code: 'CLOSED',
          summary: { total: 3, imported: 1, failed: 1 },
          results: [
            { email: first, ok: true },
            { email: stopped, ok: false, code: 'CLOSED' },
          ],
        });
        await expect(
          importMembers(null, importForm([later], open.tenantId))
        ).resolves.toMatchObject({
          code: 'CLOSED',
          summary: { total: 1, imported: 0, failed: 1 },
        });

        const [members, coverage] = await Promise.all([
          db.dbAdmin
            .select({ id: user.id, email: user.email, tenantId: user.tenantId })
            .from(user)
            .where(inArray(user.email, [refused, first, stopped, unattempted, later])),
          db.dbAdmin
            .select({
              userId: subscriptions.userId,
              status: subscriptions.status,
              tenantId: subscriptions.tenantId,
            })
            .from(subscriptions)
            .where(inArray(subscriptions.tenantId, tenantIds)),
        ]);
        expect(members).toEqual([
          { id: expect.any(String), email: first, tenantId: open.tenantId },
        ]);
        expect(coverage).toEqual([
          { userId: members[0].id, status: 'paused', tenantId: open.tenantId },
        ]);
      } finally {
        request.afterAdmission = undefined;
        request.session = null;
        request.authority = null;
        try {
          await cleanupPilotSalesTenants(db.dbAdmin, tenantIds);
        } finally {
          await db.close();
        }
      }
    }, 30_000);
  }
);
