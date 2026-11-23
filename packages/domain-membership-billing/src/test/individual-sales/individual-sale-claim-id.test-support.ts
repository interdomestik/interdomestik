import {
  paymentPortTestGuardRole,
  restricted,
  runtimeRole,
} from '../../../../database/test/exchange-rates.fixture';
import { expect, it } from 'vitest';

import { directSaleRow } from './individual-sale-direct.test-support';
import {
  accepted,
  absent,
  completed,
  success,
  type SaleFixture,
} from './individual-sales.test-support';

// Claim IDs are database-assigned and unreadable by the runtime role (Astra PR-1b code r1/r2, B1).
export function registerClaimIdCases(fixture: () => Promise<SaleFixture>) {
  it('denies runtime claim ID reads even for an existing own-tenant claim', async () => {
    const f = await fixture();
    const input = accepted(await f.sellable(), { memberUserId: f.member.id });
    success(await f.sale(input));
    expect(await f.counts(input.operationKey)).toStrictEqual(completed);

    await expect(
      restricted(
        f.admin,
        f.tenantId,
        tx => tx`select id from membership_sale_claims where operation_key = ${input.operationKey}`
      )
    ).rejects.toMatchObject({ code: '42501' });

    const readableColumns = await restricted(
      f.admin,
      f.tenantId,
      tx => tx`
        select attname as name from pg_attribute
        where attrelid = 'public.membership_sale_claims'::regclass and attnum > 0 and not attisdropped
          and has_column_privilege(current_user, attrelid, attnum, 'SELECT')
        order by attname
      `
    );
    expect([...readableColumns]).toStrictEqual([
      { name: 'operation_key' },
      { name: 'request_hash' },
      { name: 'tenant_id' },
    ]);
  });

  it('denies returning the claim ID from a runtime insert', async () => {
    const f = await fixture();
    const input = accepted(await f.sellable(), { memberUserId: f.member.id });
    const row = await directSaleRow(f, input);

    await expect(
      restricted(f.admin, f.tenantId, async tx => {
        await tx`
          insert into membership_sale_claims (tenant_id, operation_key, request_hash, claimed_at)
          values (${row.tenant_id}, ${row.operation_key}, ${row.request_hash}, clock_timestamp())
          returning id
        `;
        await tx`insert into membership_sales ${tx(row)}`;
      })
    ).rejects.toMatchObject({ code: '42501' });
    expect(await f.counts(input.operationKey)).toStrictEqual(absent);
  });

  it('assigns a new claim ID when the runtime supplies an ID held by another tenant', async () => {
    const readClaimIds = ({ admin, tenantId }: SaleFixture, operationKey: string) =>
      restricted(
        admin,
        tenantId,
        tx => tx<{ id: string }[]>`
          select id from membership_sale_claims
          where tenant_id = ${tenantId} and operation_key = ${operationKey}
        `,
        paymentPortTestGuardRole
      );
    const foreign = await fixture();
    const foreignInput = accepted(await foreign.sellable(), { memberUserId: foreign.member.id });
    success(await foreign.sale(foreignInput));
    const foreignClaims = await readClaimIds(foreign, foreignInput.operationKey);
    expect([...foreignClaims]).toStrictEqual([{ id: expect.any(String) }]);
    const [foreignClaim] = foreignClaims;

    const f = await fixture();
    const input = accepted(await f.sellable(), { memberUserId: f.member.id });
    const row = await directSaleRow(f, input);
    await restricted(f.admin, f.tenantId, async tx => {
      const visible = await tx`
        select operation_key from membership_sale_claims where operation_key = ${foreignInput.operationKey}
      `;
      expect([...visible]).toStrictEqual([]);
      const [connection] = await tx`select current_user as role`;
      expect(connection).toStrictEqual({ role: runtimeRole });
      await tx`
        insert into membership_sale_claims (id, tenant_id, operation_key, request_hash, claimed_at)
        values (${foreignClaim.id}, ${row.tenant_id}, ${row.operation_key}, ${row.request_hash}, clock_timestamp())
      `;
      await tx`insert into membership_sales ${tx(row)}`;
    });

    const stored = await readClaimIds(f, input.operationKey);
    expect([...stored]).toStrictEqual([{ id: expect.any(String) }]);
    expect(stored[0].id).not.toBe(foreignClaim.id);
    expect(await f.counts(input.operationKey)).toStrictEqual(completed);
  });
}
