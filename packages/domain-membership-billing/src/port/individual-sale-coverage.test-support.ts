import { withPaymentPortTestTransaction } from '@interdomestik/database/testing/payment-port-rls';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { admitPersonEntries } from '../sponsor-coverage/admission';
import { holdingChange, holdingSale, race } from './individual-sale-races.test-support';
import {
  absent,
  accepted,
  completed,
  refused,
  success,
  type SaleFixture,
} from './individual-sales.test-support';
import type { SaleInput } from './sale-input';

async function seedCompanySeat(f: SaleFixture, startsInDays = -1) {
  const { tenantId, homeBranch, owner, member, legalEntityId, planId } = f;
  const companyLeadId = await f.lead(f.agent.id, homeBranch, 'company');
  const sponsorId = randomUUID();
  const termId = randomUUID();
  const revisionId = randomUUID();
  const entryId = randomUUID();
  await f.admin.begin(async tx => {
    await tx`insert into sponsors (id, tenant_id, branch_id, source_lead_id, legal_name,
        billing_contact_name, billing_contact_email, created_by)
      values (${sponsorId}, ${tenantId}, ${homeBranch}, ${companyLeadId}, 'Synthetic sponsor',
        'Synthetic contact', 'billing@example.test', ${owner.id})`;
    await tx`insert into sponsor_terms (id, tenant_id, sponsor_id, term_start, term_end,
        legal_entity_id, plan_key, plan_id, created_by)
      values (${termId}, ${tenantId}, ${sponsorId}, now() + ${startsInDays}::integer * interval '1 day',
        now() + interval '1 year', ${legalEntityId}, ${planId}, 'basic', ${owner.id})`;
    await tx`insert into sponsor_term_revisions (id, tenant_id, term_id, revision, seat_count,
        price_per_seat_minor, currency, contract_reference, terms_version, created_by)
      values (${revisionId}, ${tenantId}, ${termId}, 1, 1, 1000, 'EUR', 'Synthetic contract', 'v1',
        ${owner.id})`;
    await tx`insert into sponsor_revision_decisions (id, tenant_id, revision_id, decision, decided_by)
      values (${randomUUID()}, ${tenantId}, ${revisionId}, 'approved', ${owner.id})`;
    await tx`insert into sponsor_roster_entries (id, tenant_id, term_id, user_id, added_by, starts_at)
      select ${entryId}, tenant_id, id, ${member.id}, ${owner.id}, term_start
      from sponsor_terms where tenant_id = ${tenantId} and id = ${termId}`;
  });
  return entryId;
}

function seatAdmission(f: SaleFixture, entryId: string, hold?: (pid: number) => Promise<void>) {
  return withPaymentPortTestTransaction(
    f.peer,
    f.tenantId,
    f.owner.role,
    async tx => {
      const [{ pid }] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      const decisions = await admitPersonEntries(tx, f.tenantId, f.member.id);
      expect(decisions).toEqual([{ entryId, decision: 'accepted' }]);
      await hold?.(pid);
    },
    'read committed'
  );
}

async function seedIndividualSubscription(f: SaleFixture, status: 'active' | 'canceled') {
  await f.admin`insert into subscriptions (id, tenant_id, user_id, status, plan_id)
    values (${randomUUID()}, ${f.tenantId}, ${f.member.id}, ${status}, 'basic')`;
}

async function composedSale(f: SaleFixture, input: SaleInput, who: typeof f.owner) {
  const { recordSaleInTx } = await import('../payment-port-compose');
  return withPaymentPortTestTransaction(
    f.peer,
    f.tenantId,
    who.role,
    tx => recordSaleInTx(tx, who.authority, input, who),
    'read committed'
  );
}

function linkLead(f: SaleFixture, leadId: string, userId: string) {
  return f.admin`update member_leads set converted_user_id = ${userId}
    where tenant_id = ${f.tenantId} and id = ${leadId}`;
}

export function registerCoverageCases(fixture: () => Promise<SaleFixture>) {
  describe.each(['recordSale', 'recordSaleInTx'] as const)('%s buyer coverage', entry => {
    const sale = (f: SaleFixture, input: SaleInput, who: typeof f.owner) =>
      entry === 'recordSale' ? f.sale(input, who) : composedSale(f, input, who);

    it.each([
      ['current', -1],
      ['future-start', 1],
    ] as const)(
      'refuses a member with a %s accepted company seat',
      async (_label, startsInDays) => {
        const f = await fixture();
        const input = accepted(await f.sellable(), { memberUserId: f.member.id });
        const entryId = await seedCompanySeat(f, startsInDays);
        await seatAdmission(f, entryId);

        expect(await sale(f, input, f.staff)).toEqual(refused('already_covered'));
        expect(await f.counts(input.operationKey)).toEqual(absent);
      }
    );

    it('refuses a member with an active individual subscription', async () => {
      const f = await fixture();
      const input = accepted(await f.sellable(), { memberUserId: f.member.id });
      await seedIndividualSubscription(f, 'active');

      expect(await sale(f, input, f.owner)).toEqual(refused('already_covered'));
      expect(await f.counts(input.operationKey)).toEqual(absent);
    });

    it('refuses an agent’s lead when the linked user is covered', async () => {
      const f = await fixture();
      const leadId = await f.lead();
      const input = accepted(await f.sellable(), { leadId });
      await linkLead(f, leadId, f.member.id);
      await seatAdmission(f, await seedCompanySeat(f));

      expect(await sale(f, input, f.agent)).toEqual(refused('already_covered'));
      expect(await f.counts(input.operationKey)).toEqual(absent);
    });

    it('refuses a lead linked to a user outside the tenant', async () => {
      const f = await fixture();
      const leadId = await f.lead();
      const input = accepted(await f.sellable(), { leadId });
      await linkLead(f, leadId, f.foreignMember.id);

      expect(await sale(f, input, f.agent)).toEqual(refused('not_found'));
      expect(await f.counts(input.operationKey)).toEqual(absent);
    });

    it('records an uncovered sale and replays it after the buyer becomes covered', async () => {
      const f = await fixture();
      const offer = await f.sellable();
      const buyer = { memberUserId: f.member.id };
      const input = accepted(offer, buyer);
      await seedIndividualSubscription(f, 'canceled');
      const original = success(await sale(f, input, f.owner)).sale;
      expect(await f.counts(input.operationKey)).toEqual(completed);

      await seatAdmission(f, await seedCompanySeat(f));
      expect(success(await sale(f, input, f.owner)).sale.id).toBe(original.id);
      expect(await f.counts(input.operationKey)).toEqual(completed);

      const newInput = accepted(offer, buyer);
      expect(await sale(f, newInput, f.owner)).toEqual(refused('already_covered'));
      expect(await f.counts(newInput.operationKey)).toEqual(absent);
    });
  });

  it('refuses a new sale after waiting for seat admission to commit', async () => {
    const f = await fixture();
    const input = accepted(await f.sellable(), { memberUserId: f.member.id });
    const entryId = await seedCompanySeat(f);
    const { second } = await race(
      f,
      hold => seatAdmission(f, entryId, hold),
      () => f.sale(input)
    );

    expect(second).toEqual(refused('already_covered'));
    expect(await f.counts(input.operationKey)).toEqual(absent);
  });

  it('admits a waiting seat after a sale commits while the buyer is uncovered', async () => {
    const f = await fixture();
    const offer = await f.sellable();
    const buyer = { memberUserId: f.member.id };
    const input = accepted(offer, buyer);
    const entryId = await seedCompanySeat(f);
    await race(f, holdingSale(f, input), () => seatAdmission(f, entryId));

    expect(await f.counts(input.operationKey)).toEqual(completed);
    const newInput = accepted(offer, buyer);
    expect(await f.sale(newInput)).toEqual(refused('already_covered'));
    expect(await f.counts(newInput.operationKey)).toEqual(absent);
  });

  it('rolls back the claim if a lead gains a linked user while the sale waits for the buyer', async () => {
    const f = await fixture();
    const leadId = await f.lead();
    const input = accepted(await f.sellable(), { leadId });
    await seedIndividualSubscription(f, 'active');

    const { second } = await race(
      f,
      holdingChange(
        f,
        tx => tx`update member_leads set converted_user_id = ${f.member.id}
        where tenant_id = ${f.tenantId} and id = ${leadId}`
      ),
      () => f.sale(input, f.agent)
    );
    expect(second).toEqual(refused('conflict'));
    expect(await f.counts(input.operationKey)).toEqual(absent);
    expect(await f.sale(input, f.agent)).toEqual(refused('already_covered'));
    expect(await f.counts(input.operationKey)).toEqual(absent);
  });
}
