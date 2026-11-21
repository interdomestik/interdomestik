import { randomUUID } from 'node:crypto';
import {
  paymentPortTestSession,
  restricted,
  withPaymentPortTestTransaction,
} from '@interdomestik/database/testing/payment-port-rls';
import { sql } from 'drizzle-orm';
import { expect, it } from 'vitest';

import {
  accepted,
  absent,
  completed,
  directSaleRow,
  insertDirectSale,
  refused,
  success,
  type SaleFixture,
} from './individual-sales.test-support';

export function registerScopeCases(fixture: () => Promise<SaleFixture>) {
  it('enforces every entry basis and the session actor home and ID binding', async () => {
    const f = await fixture();
    const offer = await f.sellable();
    const publish = { planId: f.planId, legalEntityId: f.legalEntityId };
    const withdraw = { planVersionId: offer.planVersionId };
    const input = accepted(offer, { memberUserId: f.member.id });
    const quote = { planId: f.planId };
    const { recordSaleInTx } = await import('../payment-port-compose');
    const { withTenantAuthority } =
      await import('@interdomestik/database/tenant-authority-context');
    for (const [authority, actor] of [
      [f.member.authority, f.member],
      [f.owner.authority, { ...f.owner, id: randomUUID() }],
      [f.owner.authority, { ...f.owner, tenantId: f.otherTenantId }],
      [
        paymentPortTestSession(f.tenantId, f.owner.id, 'tenant_admin', null, f.otherTenantId),
        f.owner,
      ],
    ] as const) {
      expect(await f.port.getSaleOffer(authority, quote, actor)).toEqual(refused('forbidden'));
      expect(await f.port.publishPlanVersion(authority, publish, actor)).toEqual(
        refused('forbidden')
      );
      expect(await f.port.withdrawPlanVersion(authority, withdraw, actor)).toEqual(
        refused('forbidden')
      );
      expect(await f.port.recordSale(authority, input, actor)).toEqual(refused('forbidden'));
      expect(
        await withTenantAuthority(f.owner.authority, tx =>
          recordSaleInTx(tx, authority, input, actor)
        )
      ).toEqual(refused('forbidden'));
    }
    expect(
      await withTenantAuthority(f.foreignOwner.authority, tx =>
        recordSaleInTx(tx, f.owner.authority, input, f.owner)
      )
    ).toEqual(refused('forbidden'));
    const missingActor = paymentPortTestSession(f.tenantId, randomUUID(), 'tenant_admin');
    expect(await f.port.getSaleOffer(missingActor, quote)).toEqual(refused('forbidden'));
    expect(await f.port.getSaleOffer(f.agent.authority, quote)).toMatchObject({
      ok: true,
    });
    expect(await f.port.getSaleOffer(f.staff.authority, quote, f.staff)).toMatchObject({
      ok: true,
    });
    for (const actor of [f.agent, f.staff]) {
      expect(await f.port.publishPlanVersion(actor.authority, publish, actor)).toEqual(
        refused('forbidden')
      );
      expect(await f.port.withdrawPlanVersion(actor.authority, withdraw, actor)).toEqual(
        refused('forbidden')
      );
    }
    expect(
      await f.port.publishPlanVersion(f.foreignOwner.authority, publish, f.foreignOwner)
    ).toEqual(refused('invalid'));
    expect(
      await f.port.withdrawPlanVersion(f.foreignOwner.authority, withdraw, f.foreignOwner)
    ).toEqual(refused('not_found'));
    expect(await f.port.getSaleOffer(f.foreignOwner.authority, quote, f.foreignOwner)).toEqual(
      refused('not_found')
    );
    expect(await f.sale(input, f.foreignOwner)).toEqual(refused('not_found'));
    expect(await f.counts(input.operationKey)).toEqual(absent);
  });

  it('rejects identity injection before touching a claim or offer', async () => {
    const f = await fixture();
    const offer = await f.sellable();
    const input = accepted(offer, { memberUserId: f.member.id });
    const { recordSaleInTx } = await import('../payment-port-compose');
    const { withTenantAuthority } =
      await import('@interdomestik/database/tenant-authority-context');
    await withTenantAuthority(f.owner.authority, async tx => {
      for (const field of [
        'sold_by',
        'soldBy',
        'tenantId',
        'agentId',
        'branchId',
        'governingLaw',
      ]) {
        expect(await f.sale({ ...input, [field]: f.owner.id })).toEqual(refused('invalid'));
        expect(
          await recordSaleInTx(tx, f.owner.authority, { ...input, [field]: f.owner.id }, f.owner)
        ).toEqual(refused('invalid'));
      }
    });
    for (const field of ['published_by', 'publishedBy', 'tenantId']) {
      expect(
        await f.publish({
          planId: f.planId,
          legalEntityId: f.legalEntityId,
          [field]: f.owner.id,
        })
      ).toEqual(refused('invalid'));
    }
    expect(await f.counts(input.operationKey)).toEqual(absent);
  });

  it('enforces individual buyer kind, branch and assignment and denies fresh out-of-scope keys', async () => {
    const f = await fixture();
    const offer = await f.sellable();
    const leadId = await f.lead();
    const wrongAgentLead = await f.lead(f.otherAgent.id);
    const wrongBranchLead = await f.lead(f.agent.id, f.otherBranch);
    const company = await f.lead(f.agent.id, f.homeBranch, 'company');
    for (const buyer of [
      { leadId: company },
      { memberUserId: f.staff.id },
      { memberUserId: f.foreignMember.id },
    ]) {
      const input = accepted(offer, buyer);
      expect(await f.sale(input)).toEqual(refused('not_found'));
      const row = await directSaleRow(f, input);
      await expect(
        restricted(f.admin, f.tenantId, tx => insertDirectSale(tx, row))
      ).rejects.toMatchObject({
        code: '23514',
        constraint_name: 'membership_sales_individual_buyer_guard',
      });
      expect(await f.counts(input.operationKey)).toEqual(absent);
    }

    const { recordSaleInTx } = await import('../payment-port-compose');
    const { withTenantAuthority } =
      await import('@interdomestik/database/tenant-authority-context');
    for (const buyer of [
      { leadId: wrongAgentLead },
      { leadId: wrongBranchLead },
      { memberUserId: f.member.id },
    ]) {
      const input = accepted(offer, buyer);
      expect(await f.sale(input, f.agent)).toEqual(refused('not_found'));
      expect(
        await withTenantAuthority(f.agent.authority, tx =>
          recordSaleInTx(tx, f.agent.authority, input, f.agent)
        )
      ).toEqual(refused('not_found'));
      expect(await f.counts(input.operationKey)).toEqual(absent);
      success(await f.sale(input));
      expect(await f.counts(input.operationKey)).toEqual(completed);
    }

    const staffCrossBranch = accepted(offer, { leadId: await f.lead(f.agent.id, f.otherBranch) });
    expect(await f.sale(staffCrossBranch, f.staff)).toEqual(refused('not_found'));
    const noBranchStaff = await f.addUser('staff', null);
    expect(await f.sale(accepted(offer, { leadId }), noBranchStaff)).toEqual(refused('not_found'));

    const { sale } = success(await f.sale(accepted(offer, { leadId }), f.agent));
    expect(sale).toMatchObject({ soldBy: f.agent.id, agentId: f.agent.id, branchId: f.homeBranch });
    const staffLead = success(
      await f.sale(accepted(offer, { leadId: await f.lead(f.otherAgent.id) }), f.staff)
    );
    expect(staffLead.sale.agentId).toBe(f.otherAgent.id);
    const staffMember = success(
      await f.sale(accepted(offer, { memberUserId: f.member.id }), f.staff)
    );
    expect(staffMember.sale).toMatchObject({
      agentId: null,
      branchId: f.homeBranch,
      soldBy: f.staff.id,
    });
  });

  it('hides a replay from the original buyer’s new out-of-scope seller before checking its hash', async () => {
    const f = await fixture();
    const offer = await f.sellable();
    const leadId = await f.lead();
    const input = accepted(offer, { leadId });
    const first = success(await f.sale(input, f.agent)).sale;
    expect(success(await f.sale(input, f.agent)).sale).toEqual(first);
    expect(await f.sale({ ...input, channel: 'bank_transfer' }, f.agent)).toEqual(
      refused('conflict')
    );
    await f.admin`update member_leads set agent_id = ${f.otherAgent.id} where id = ${leadId}`;

    expect(await f.sale(input, f.agent)).toEqual(refused('not_found'));
    const visibleDecoy = { ...input, buyer: { leadId: await f.lead() } };
    expect(await f.sale(visibleDecoy, f.agent)).toEqual(refused('not_found'));
    expect(await f.sale({ ...visibleDecoy, channel: 'bank_transfer' }, f.agent)).toEqual(
      refused('not_found')
    );
    await f.addRate('60.00', '2000-01-10');
    expect(success(await f.sale(input, f.otherAgent)).sale).toEqual(first);
    expect(await f.counts(input.operationKey)).toEqual(completed);
  });

  it('rejects stronger isolation and accepts a composed caller with an immediate claim constraint', async () => {
    const f = await fixture();
    const input = accepted(await f.sellable(), { memberUserId: f.member.id });
    const { recordSaleInTx } = await import('../payment-port-compose');
    const { withTenantAuthority } =
      await import('@interdomestik/database/tenant-authority-context');
    expect(
      await withPaymentPortTestTransaction(
        f.peer,
        f.tenantId,
        'tenant_admin',
        tx => recordSaleInTx(tx, f.owner.authority, input, f.owner),
        'repeatable read'
      )
    ).toEqual(refused('invalid'));
    expect(await f.counts(input.operationKey)).toEqual(absent);

    const { sale } = success(
      await withTenantAuthority(f.owner.authority, async tx => {
        await tx.execute(sql`set constraints public.membership_claims_require_sale immediate`);
        return recordSaleInTx(tx, f.owner.authority, input, f.owner);
      })
    );
    expect(sale.operationKey).toBe(input.operationKey);
    expect(await f.counts(input.operationKey)).toEqual(completed);
  });

  it('rolls a PostgreSQL unique violation back and commits independent caller work', async () => {
    const f = await fixture();
    const input = accepted(await f.sellable(), { leadId: await f.lead() });
    success(await f.sale(input));
    const duplicate = { ...input, operationKey: randomUUID() };
    const { recordSaleInTx } = await import('../payment-port-compose');
    const { withTenantAuthority } =
      await import('@interdomestik/database/tenant-authority-context');
    await withTenantAuthority(f.owner.authority, async tx => {
      expect(await recordSaleInTx(tx, f.owner.authority, duplicate, f.owner)).toEqual(
        refused('conflict')
      );
      await tx.execute(sql`update membership_plans set description = 'committed after SQL error'
        where tenant_id = ${f.tenantId} and id = ${f.planId}`);
    });
    expect(await f.counts(duplicate.operationKey)).toEqual(absent);
    expect(await f.counts(input.operationKey)).toEqual(completed);
    const [{ description }] =
      await f.admin`select description from membership_plans where id = ${f.planId}`;
    expect(description).toBe('committed after SQL error');
  });
}
