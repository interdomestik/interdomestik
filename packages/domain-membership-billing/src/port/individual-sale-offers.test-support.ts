import { randomUUID } from 'node:crypto';
import {
  paymentPortTestGuardRole,
  restricted,
} from '@interdomestik/database/testing/payment-port-rls';
import { expect, it } from 'vitest';

import {
  accepted,
  absent,
  canonicalHash,
  directSaleRow,
  insertDirectSale,
  refused,
  success,
  type SaleFixture,
} from './individual-sales.test-support';

export function registerOfferCases(fixture: () => Promise<SaleFixture>) {
  it('publishes only eligible catalogue values and keeps the exact stored price per plan', async () => {
    const f = await fixture();
    for (const fields of [
      { tier: 'family' },
      { interval: 'month' },
      { currency: 'MKD' },
      { price: '0.00' },
      { price: '-0.01' },
      { active: false },
    ]) {
      const planId = await f.plan(fields);
      expect(await f.publish({ planId, legalEntityId: f.legalEntityId })).toEqual(
        refused('invalid')
      );
    }
    const prices = ['1.07', '999999.99'] as const;
    for (const [index, price] of prices.entries()) {
      const planId = await f.plan({ price });
      const { version } = success(await f.publish({ planId, legalEntityId: f.legalEntityId }));
      expect(version.listPriceMinor).toBe([107n, 99999999n][index]);
      expect(version.publishedBy).toBe(f.owner.id);
      expect(version.version).toBe(1);
    }

    const business = await f.plan({ tier: 'business', price: '90.00' });
    const { version } = success(
      await f.publish({ planId: business, legalEntityId: f.legalEntityId })
    );
    expect(version.tier).toBe('business');
    expect(await f.quote(business)).toEqual(refused('stale_offer'));
    const offer = await f.sellable();
    const input = { ...accepted(offer, { memberUserId: f.member.id }), planVersionId: version.id };
    expect(await f.sale(input)).toEqual(refused('stale_offer'));
    const row = await directSaleRow(f, input);
    await expect(
      restricted(f.admin, f.tenantId, tx => insertDirectSale(tx, row))
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'membership_sales_stale_offer' });
    expect(await f.counts(input.operationKey)).toEqual(absent);
  });

  it('rejects direct copies with a different positive price, tier or member count', async () => {
    const f = await fixture();
    for (const [price, tier, count] of [
      [1001, 'basic', 1],
      [1000, 'standard', 1],
      [1000, 'basic', 2],
    ]) {
      await expect(
        restricted(
          f.admin,
          f.tenantId,
          tx => tx`
        insert into membership_plan_versions (id, tenant_id, plan_id, version, legal_entity_id,
          tier, interval, members_included, list_price_minor, price_currency, published_by)
        values (${randomUUID()}, ${f.tenantId}, ${f.planId}, 1, ${f.legalEntityId},
          ${tier}, 'year', ${count}, ${price}, 'EUR', ${f.owner.id})
      `
        )
      ).rejects.toMatchObject({
        code: '23514',
        constraint_name: 'membership_plan_versions_copy_guard',
      });
    }
    const first = success(await f.publish()).version;
    expect(first.version).toBe(1);
    await expect(
      restricted(
        f.admin,
        f.tenantId,
        tx => tx`
      insert into membership_plan_versions (id, tenant_id, plan_id, version, legal_entity_id,
        tier, interval, members_included, list_price_minor, price_currency, published_by,
        withdrawn_at, withdrawn_by)
      values (${randomUUID()}, ${f.tenantId}, ${f.planId}, 2, ${f.legalEntityId},
        'basic', 'year', 1, 1000, 'EUR', ${f.owner.id}, now(), ${f.owner.id})
    `
      )
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'membership_plan_versions_withdrawal_guard',
    });
    await expect(
      restricted(
        f.admin,
        f.tenantId,
        tx => tx`
        update membership_plan_versions set list_price_minor = 2000 where id = ${first.id}
      `,
        paymentPortTestGuardRole
      )
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'membership_plan_versions_withdrawal_guard',
    });
  });

  it('withdraws a named version once, exposes its predecessor and conceals an absent target', async () => {
    const f = await fixture();
    const first = await f.sellable();
    const newest = success(await f.publish()).version;
    expect((await f.offer()).planVersionId).toBe(newest.id);
    expect(await f.sale(accepted(first, { memberUserId: f.member.id }))).toEqual(
      refused('stale_offer')
    );

    const withdrawn = success(await f.withdraw(newest.id)).version;
    expect(withdrawn.withdrawnBy).toBe(f.owner.id);
    expect(withdrawn.withdrawnAt).toBeTypeOf('string');
    expect(success(await f.withdraw(newest.id)).version).toEqual(withdrawn);
    expect((await f.offer()).planVersionId).toBe(first.planVersionId);
    await expect(
      restricted(
        f.admin,
        f.tenantId,
        tx => tx`
      update membership_plan_versions set withdrawn_at = clock_timestamp() where id = ${newest.id}
    `
      )
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'membership_plan_versions_withdrawal_guard',
    });
    expect(
      await f.sale(accepted({ ...first, planVersionId: newest.id }, { memberUserId: f.member.id }))
    ).toEqual(refused('stale_offer'));
    expect(await f.withdraw(randomUUID())).toEqual(refused('not_found'));
    expect(
      await f.port.withdrawPlanVersion(
        f.foreignOwner.authority,
        { planVersionId: newest.id },
        f.foreignOwner
      )
    ).toEqual(refused('not_found'));

    success(await f.withdraw(first.planVersionId));
    expect(await f.quote()).toEqual(refused('stale_offer'));
  });

  it('fails closed when the plan or the legal entity is inactive at publication or at sale', async () => {
    const f = await fixture();
    const offer = await f.sellable();
    const inactiveEntity = await f.entity({ governingLaw: 'MK', terms: 'v1', active: false });
    expect(await f.publish({ planId: f.planId, legalEntityId: inactiveEntity })).toEqual(
      refused('invalid')
    );

    const input = accepted(offer, { memberUserId: f.member.id });
    const row = await directSaleRow(f, input);
    // The displayed offer was valid before the entity changed.
    await f.admin`update legal_entities set is_active = false where id = ${f.legalEntityId}`;
    expect(await f.quote()).toEqual(refused('stale_offer'));
    expect(await f.sale(input)).toEqual(refused('stale_offer'));
    await expect(
      restricted(f.admin, f.tenantId, tx => insertDirectSale(tx, row))
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'membership_sales_stale_offer' });
    expect(await f.counts(input.operationKey)).toEqual(absent);

    await f.admin`update legal_entities set is_active = true where id = ${f.legalEntityId}`;
    await f.admin`update membership_plans set is_active = false where id = ${f.planId}`;
    expect(await f.publish()).toEqual(refused('invalid'));
    expect(await f.sale(input)).toEqual(refused('stale_offer'));
    await expect(
      restricted(f.admin, f.tenantId, tx => insertDirectSale(tx, row))
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'membership_sales_stale_offer' });
  });

  it('requires both nonblank legal fields independently at publication, quote and insert', async () => {
    const f = await fixture();
    const offer = await f.sellable();
    const input = accepted(offer, { memberUserId: f.member.id });
    const row = await directSaleRow(f, input);
    for (const [governingLaw, terms] of [
      [null, 'v1'],
      ['MK', null],
      ['MK', ''],
      ['MK', ' \t\r\n'],
    ]) {
      await f.admin`update legal_entities set governing_law = ${governingLaw}, terms_version = ${terms}
        where id = ${f.legalEntityId}`;
      expect(await f.publish()).toEqual(refused('invalid'));
      await expect(
        restricted(
          f.admin,
          f.tenantId,
          tx => tx`
        insert into membership_plan_versions (id, tenant_id, plan_id, version, legal_entity_id,
          tier, interval, members_included, list_price_minor, price_currency, published_by)
        values (${randomUUID()}, ${f.tenantId}, ${f.planId}, 2, ${f.legalEntityId},
          'basic', 'year', 1, 1000, 'EUR', ${f.owner.id})
      `
        )
      ).rejects.toMatchObject({
        code: '23514',
        constraint_name: 'membership_plan_versions_copy_guard',
      });
      expect(await f.quote()).toEqual(refused('stale_offer'));
      expect(await f.sale(input)).toEqual(refused('stale_offer'));
      const directInput = terms === null ? input : { ...input, termsVersion: terms };
      await expect(
        restricted(f.admin, f.tenantId, tx =>
          insertDirectSale(tx, {
            ...row,
            terms_version: directInput.termsVersion,
            request_hash: canonicalHash(directInput),
          })
        )
      ).rejects.toMatchObject({ code: '23514', constraint_name: 'membership_sales_stale_offer' });
    }
    expect(await f.counts(input.operationKey)).toEqual(absent);
  });

  it('distinguishes hidden plans, missing offers, missing rates and rounded-zero rates', async () => {
    const f = await fixture();
    expect(await f.quote(randomUUID())).toEqual(refused('not_found'));
    expect(
      await f.port.getSaleOffer(f.foreignOwner.authority, { planId: f.planId }, f.foreignOwner)
    ).toEqual(refused('not_found'));
    expect(await f.quote()).toEqual(refused('stale_offer'));
    const { version } = success(await f.publish());
    expect(await f.quote()).toEqual(refused('rate_unavailable'));
    const [rate] = await f.addRate('0.00000001');
    expect(await f.quote()).toEqual(refused('rate_unavailable'));
    const input = {
      buyer: { memberUserId: f.member.id },
      planVersionId: version.id,
      termsVersion: 'v1',
      rateId: rate.id,
      amountMkdMinor: 100n,
      channel: 'cash',
      operationKey: randomUUID(),
    };
    expect(await f.sale(input)).toEqual(refused('rate_unavailable'));
    expect(await f.counts(input.operationKey)).toEqual(absent);
  });
}
