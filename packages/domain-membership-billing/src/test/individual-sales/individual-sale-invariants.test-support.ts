import { randomUUID } from 'node:crypto';
import {
  paymentPortTestGuardRole,
  restricted,
  runSequentially,
  runtimeRole,
} from '../../../../database/test/exchange-rates.fixture';
import { expect, it } from 'vitest';

import { directSaleRow, insertDirectSale } from './individual-sale-direct.test-support';
import { registerClaimIdCases } from './individual-sale-claim-id.test-support';
import { registerSaleIntegrityCases } from './individual-sale-integrity.test-support';
import {
  accepted,
  absent,
  completed,
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

    const privileges = await restricted(
      f.admin,
      f.tenantId,
      tx => tx`
      select current_user as role,
        has_table_privilege(current_user, 'membership_sale_channels', 'SELECT') as can_select,
        has_table_privilege(current_user, 'membership_sale_channels',
          'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER') as can_write_table,
        has_any_column_privilege(current_user, 'membership_sale_channels',
          'INSERT, UPDATE, REFERENCES') as can_write_columns
    `
    );
    expect([...privileges]).toStrictEqual([
      { role: runtimeRole, can_select: true, can_write_table: false, can_write_columns: false },
    ]);

    const writeLookup = [
      "insert into membership_sale_kinds (kind) values ('new')",
      "insert into membership_sale_channels (kind, channel) values ('individual', 'card')",
      'update membership_sale_kinds set kind = kind',
      'delete from membership_sale_channels',
    ];
    await runSequentially(writeLookup, async statement => {
      await expect(
        restricted(f.admin, f.tenantId, tx => tx.unsafe(statement))
      ).rejects.toMatchObject({ code: '42501' });
    });

    const request = accepted(await f.sellable(), { memberUserId: f.member.id });
    const { sale } = success(await f.sale(request));
    expect(sale.soldBy).toBe(f.owner.id);
    expect(await f.counts(request.operationKey)).toEqual(completed);
    await runSequentially(
      names.filter(name => !name.endsWith('kinds') && !name.endsWith('channels')),
      async table => {
        const counts = (tenant: string) =>
          restricted(
            f.admin,
            tenant,
            tx => tx`
        select count(tenant_id)::int as count from ${tx(table)}
      `
          );
        const [[own], [foreign]] = await Promise.all([counts(f.tenantId), counts(f.otherTenantId)]);
        expect(own.count).toBe(1);
        expect(foreign.count).toBe(0);
      }
    );
    await expect(
      restricted(
        f.admin,
        f.otherTenantId,
        tx => tx`
      insert into membership_sale_claims (tenant_id, operation_key, request_hash, claimed_at)
      values (${f.tenantId}, ${randomUUID()}, ${'0'.repeat(64)}, now())
    `
      )
    ).rejects.toMatchObject({
      code: '42501',
      message: expect.stringContaining('row-level security'),
    });
    await runSequentially(
      [
        'update membership_sales set voided_at = now()',
        'delete from membership_sales',
        'update membership_ledger_entries set amount_mkd_minor = 100',
        'delete from membership_ledger_entries',
        'update membership_sale_claims set claimed_at = now()',
        'delete from membership_sale_claims',
        'truncate membership_sale_claims, membership_sales, membership_ledger_entries',
      ],
      async statement => {
        await expect(
          restricted(f.admin, f.tenantId, tx => tx.unsafe(statement))
        ).rejects.toMatchObject({ code: '42501' });
      }
    );
  });

  registerClaimIdCases(fixture);

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
    await f.checkedCorrection({ id: offer.rateId, effective_on: f.today }, '50.00000000');
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

  registerSaleIntegrityCases(fixture);
}
