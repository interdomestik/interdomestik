import { randomUUID } from 'node:crypto';
import {
  paymentPortTestGuardRole,
  restricted,
  runtimeRole,
} from '@interdomestik/database/testing/payment-port-rls';
import { expect, it } from 'vitest';

import {
  accepted,
  absent,
  canonicalHash,
  completed,
  directSaleRow,
  insertDirectSale,
  refused,
  success,
  type SaleFixture,
} from './individual-sales.test-support';

export function registerInvariantCases(fixture: () => Promise<SaleFixture>) {
  it('forces tenant RLS and exposes only initialized, read-only lookup keys', async () => {
    const f = await fixture();
    const names = [
      'membership_plan_versions',
      'membership_sale_kinds',
      'membership_sale_channels',
      'membership_sale_claims',
      'membership_sales',
      'membership_ledger_entries',
    ];
    const rows = await f.admin`select relname, relrowsecurity, relforcerowsecurity from pg_class
      where relname = any(${names}::name[])`;
    expect(rows).toHaveLength(names.length);
    expect(rows.every(row => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
    const read = (tenantId: string | undefined) =>
      restricted(f.peer, tenantId, async tx => ({
        kinds: [...(await tx`select kind from membership_sale_kinds order by kind`)],
        channels: [
          ...(await tx`select kind, channel from membership_sale_channels order by kind, channel`),
        ],
      }));
    expect(await read(undefined)).toEqual({ kinds: [], channels: [] });
    expect(await read('')).toEqual({ kinds: [], channels: [] });
    const registered = {
      kinds: [{ kind: 'individual' }],
      channels: [
        { kind: 'individual', channel: 'bank_transfer' },
        { kind: 'individual', channel: 'cash' },
      ],
    };
    expect(await read(f.tenantId)).toEqual(registered);
    expect(await read(f.otherTenantId)).toEqual(registered);

    const writeLookup = [
      "insert into membership_sale_kinds (kind) values ('new')",
      "insert into membership_sale_channels (kind, channel) values ('individual', 'card')",
      'update membership_sale_kinds set kind = kind',
      'delete from membership_sale_channels',
    ];
    for (const statement of writeLookup) {
      await expect(
        restricted(f.admin, f.tenantId, tx => tx.unsafe(statement))
      ).rejects.toMatchObject({ code: '42501' });
    }

    const request = accepted(await f.sellable(), { memberUserId: f.member.id });
    const { sale } = success(await f.sale(request));
    expect(sale.soldBy).toBe(f.owner.id);
    expect(await f.counts(request.operationKey)).toEqual(completed);
    for (const table of names.filter(
      name => !name.endsWith('kinds') && !name.endsWith('channels')
    )) {
      const counts = (tenant: string) =>
        restricted(
          f.admin,
          tenant,
          tx => tx`
        select count(*)::int as count from ${tx(table)}
      `
        );
      const [[own], [foreign]] = await Promise.all([counts(f.tenantId), counts(f.otherTenantId)]);
      expect(own.count).toBe(1);
      expect(foreign.count).toBe(0);
    }
    await expect(
      restricted(
        f.admin,
        f.otherTenantId,
        tx => tx`
      insert into membership_sale_claims (tenant_id, operation_key, request_hash, claimed_at)
      values (${f.tenantId}, ${randomUUID()}, ${Buffer.alloc(32)}, now())
    `
      )
    ).rejects.toMatchObject({
      code: '42501',
      message: expect.stringContaining('row-level security'),
    });
    for (const statement of [
      'update membership_sales set voided_at = now()',
      'delete from membership_sales',
      'update membership_ledger_entries set amount_mkd_minor = 100',
      'delete from membership_ledger_entries',
      'update membership_sale_claims set claimed_at = now()',
      'delete from membership_sale_claims',
      'truncate membership_sale_claims, membership_sales, membership_ledger_entries',
    ]) {
      await expect(
        restricted(f.admin, f.tenantId, tx => tx.unsafe(statement))
      ).rejects.toMatchObject({ code: '42501' });
    }
  });

  it('posts one immutable matching charge, including on an identical sale retry', async () => {
    const f = await fixture();
    const input = accepted(await f.sellable(), { memberUserId: f.member.id });
    const { sale } = success(await f.sale(input));
    expect(success(await f.sale(input)).sale).toEqual(sale);
    const entries = await restricted(
      f.admin,
      f.tenantId,
      tx => tx`
      select kind, sale_id, amount_mkd_minor from membership_ledger_entries
    `
    );
    expect([...entries]).toEqual([
      {
        kind: 'charge',
        sale_id: sale.id,
        amount_mkd_minor: sale.amountMkdMinor.toString(),
      },
    ]);
    await expect(
      restricted(
        f.admin,
        f.tenantId,
        tx => tx`
      insert into membership_ledger_entries (id, tenant_id, sale_id, kind, amount_mkd_minor)
      values (${randomUUID()}, ${f.tenantId}, ${sale.id}, 'charge', ${sale.amountMkdMinor.toString()})
    `
      )
    ).rejects.toMatchObject({
      code: '23505',
      constraint_name: 'membership_ledger_entries_charge_uq',
    });
    await expect(
      restricted(
        f.admin,
        f.tenantId,
        tx => tx`
        delete from membership_ledger_entries where sale_id = ${sale.id}
      `,
        paymentPortTestGuardRole
      )
    ).rejects.toMatchObject({ code: '23514' });
    await f.admin`alter table membership_sales disable trigger membership_sales_post_charge`;
    try {
      const withoutCharge = { ...input, operationKey: randomUUID() };
      const row = await directSaleRow(f, withoutCharge);
      await expect(
        restricted(f.admin, f.tenantId, async tx => {
          await insertDirectSale(tx, row);
          await tx`insert into membership_ledger_entries (id, tenant_id, sale_id, kind, amount_mkd_minor)
          values (${randomUUID()}, ${f.tenantId}, ${row.id}, 'charge', ${(sale.amountMkdMinor + 100n).toString()})`;
        })
      ).rejects.toMatchObject({
        code: '23503',
        constraint_name: 'membership_ledger_entries_amount_fk',
      });
      await expect(f.sale(withoutCharge)).rejects.toMatchObject({
        constraint_name: 'membership_sales_require_charge',
      });
      expect(await f.counts(withoutCharge.operationKey)).toEqual(absent);
    } finally {
      await f.admin`alter table membership_sales enable trigger membership_sales_post_charge`;
    }
  });

  it('enforces exact whole-denar conversion, including the large near-half and exact half cases', async () => {
    const f = await fixture();
    const planId = await f.plan({ price: '999999.99' });
    success(await f.publish({ planId, legalEntityId: f.legalEntityId }));
    await f.addRate('151.00000001');
    const offer = success(await f.quote(planId)).offer;
    expect(offer.amountMkdMinor).toBe(15_099_999_800n);

    const wrong = {
      ...accepted(offer, { memberUserId: f.member.id }),
      amountMkdMinor: 15_099_999_900n,
    };
    const tooHigh = await directSaleRow(f, wrong);
    await expect(
      restricted(f.admin, f.tenantId, tx => insertDirectSale(tx, tooHigh))
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'membership_sales_conversion_check',
    });
    expect(await f.sale(wrong)).toEqual(refused('invalid'));
    expect(await f.counts(wrong.operationKey)).toEqual(absent);

    const right = accepted(offer, { memberUserId: f.member.id });
    const row = await directSaleRow(f, right);
    await restricted(f.admin, f.tenantId, tx => insertDirectSale(tx, row));
    expect(await f.counts(right.operationKey)).toEqual(completed);

    const halfPlan = await f.plan({ price: '0.01' });
    success(await f.publish({ planId: halfPlan, legalEntityId: f.legalEntityId }));
    await f.addRate('50.00000000', '2000-01-10');
    const half = success(await f.quote(halfPlan)).offer;
    expect(half.amountMkdMinor).toBe(100n);
    const halfRequest = accepted(half, { memberUserId: f.member.id });
    expect(success(await f.sale(halfRequest)).sale.amountMkdMinor).toBe(100n);
    const zero = { ...halfRequest, operationKey: randomUUID(), amountMkdMinor: 0n };
    const broken = await directSaleRow(f, zero);
    // Zero price and amount satisfy conversion. The positivity CHECK must refuse them.
    Object.assign(broken, { price_minor: '0', list_price_minor: '0' });
    await expect(
      restricted(f.admin, f.tenantId, tx => insertDirectSale(tx, broken))
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'membership_sales_positive_check' });
  });

  it('checks each direct snapshot, lookup, reserved void and hash invariant independently', async () => {
    const f = await fixture();
    const input = accepted(await f.sellable(), { leadId: await f.lead() });
    const good = await directSaleRow(f, input);
    for (const [patch, code, name] of [
      [{ governing_law: 'DE' }, '23514', 'membership_sales_stale_offer'],
      [{ agent_id: f.otherAgent.id }, '23514', 'membership_sales_attribution_guard'],
      [{ branch_id: f.otherBranch }, '23514', 'membership_sales_attribution_guard'],
      [
        { voided_at: good.sold_at, voided_by: f.owner.id, void_reason: 'control' },
        '23514',
        'membership_sales_void_state_guard',
      ],
      [
        { channel: 'card', request_hash: canonicalHash(input, 'card') },
        '23503',
        'membership_sales_channel_fk',
      ],
      [{ channel: 'bank_transfer' }, '23514', 'membership_sales_request_hash_guard'],
      [{ kind: 'unregistered' }, '23503', undefined],
    ] as const) {
      const row = { ...good, ...patch };
      await expect(
        restricted(f.admin, f.tenantId, tx => insertDirectSale(tx, row))
      ).rejects.toMatchObject({ code, ...(name ? { constraint_name: name } : {}) });
      expect(await f.counts(input.operationKey)).toEqual(absent);
    }
    await expect(
      restricted(f.admin, f.tenantId, tx => insertDirectSale(tx, { ...good, kind: null }))
    ).rejects.toMatchObject({ code: '23502', column_name: 'kind' });
    expect(await f.counts(input.operationKey)).toEqual(absent);

    await restricted(f.admin, f.tenantId, tx => insertDirectSale(tx, good));
    expect(await f.counts(input.operationKey)).toEqual(completed);
    const hash = canonicalHash({ ...input, channel: 'bank_transfer' });
    await expect(
      restricted(
        f.admin,
        f.tenantId,
        tx => tx`
      insert into membership_sale_claims (tenant_id, operation_key, request_hash, claimed_at)
      values (${f.tenantId}, ${input.operationKey}, ${hash}, now())
    `
      )
    ).rejects.toMatchObject({ code: '23505', constraint_name: 'membership_sale_claims_pk' });
    await expect(
      restricted(
        f.admin,
        f.tenantId,
        tx => tx`
        update membership_sales set terms_version = 'changed' where id = ${good.id}
      `,
        paymentPortTestGuardRole
      )
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'membership_sales_void_state_guard',
    });
    await expect(
      restricted(
        f.admin,
        f.tenantId,
        tx => tx`
        delete from membership_sales where id = ${good.id}
      `,
        paymentPortTestGuardRole
      )
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('allows one complete reserved void-state write when testing the state guard directly', async () => {
    const f = await fixture();
    const input = accepted(await f.sellable(), { memberUserId: f.member.id });
    const { sale } = success(await f.sale(input));
    const transition = () =>
      restricted(
        f.admin,
        f.tenantId,
        tx => tx`
      update membership_sales set voided_at = clock_timestamp(), voided_by = ${f.owner.id},
        void_reason = 'synthetic state-guard control' where id = ${sale.id}
      returning id
    `,
        paymentPortTestGuardRole
      );
    expect([...(await transition())]).toEqual([{ id: sale.id }]);
    await expect(transition()).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'membership_sales_void_state_guard',
    });
  });

  it('uses the exact UTF-8 lengths and text for the canonical request digest', async () => {
    const f = await fixture();
    const terms = ' v9 — révisé 📄 ';
    await f.admin`update legal_entities set terms_version = ${terms} where id = ${f.legalEntityId}`;
    const offer = await f.sellable();
    expect(offer.termsVersion).toBe(terms);
    const input = accepted(offer, { memberUserId: f.member.id });
    const direct = await directSaleRow(f, input);
    await restricted(f.admin, f.tenantId, tx => insertDirectSale(tx, direct));
    expect(success(await f.sale(input)).sale.id).toBe(direct.id);
    expect(await f.sale({ ...input, termsVersion: terms.trim() })).toEqual(refused('conflict'));
    const [claim] = await restricted(
      f.admin,
      f.tenantId,
      tx => tx`
      select request_hash from membership_sale_claims where operation_key = ${input.operationKey}
    `
    );
    expect(claim.request_hash).toEqual(canonicalHash(input));
  });

  it('refuses a provisional claim without a sale at commit', async () => {
    const f = await fixture();
    const key = randomUUID();
    await expect(
      restricted(
        f.admin,
        f.tenantId,
        tx => tx`
      insert into membership_sale_claims (tenant_id, operation_key, request_hash, claimed_at)
      values (${f.tenantId}, ${key}, ${Buffer.alloc(32)}, clock_timestamp())
    `,
        runtimeRole
      )
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'membership_claims_require_sale' });
    expect(await f.counts(key)).toEqual(absent);
  });
}
