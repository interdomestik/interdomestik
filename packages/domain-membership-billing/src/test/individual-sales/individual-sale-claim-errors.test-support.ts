import { sql } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';

import { recordSaleInputSchema } from '../../port/sale-input';
import { saleScope } from './individual-sale-offer-races.test-support';
import { accepted, absent, type SaleFixture } from './individual-sales.test-support';

export function registerClaimErrorCases(fixture: () => Promise<SaleFixture>) {
  it('rolls back the operation-key CHECK refusal and commits independent caller work', async () => {
    const f = await fixture();
    const input = {
      ...accepted(await f.sellable(), { memberUserId: f.member.id }),
      operationKey: '📄'.repeat(256),
    };
    const otherPlanId = await f.plan();
    const { recordSaleInTx } = await import('../../payment-port-compose');

    await saleScope(f, f.owner, async tx => {
      await tx.execute(sql`update membership_plans set description = 'independent caller work'
        where tenant_id = ${f.tenantId} and id = ${otherPlanId}`);
      const parse = vi.spyOn(recordSaleInputSchema, 'safeParse').mockReturnValueOnce({
        success: true,
        data: input,
      });
      try {
        expect(await recordSaleInTx(tx, f.owner.authority, input, f.owner)).toStrictEqual({
          ok: false,
          code: 'invalid',
          issues: { operationKey: 'too_big' },
        });
        expect(parse).toHaveBeenCalledExactlyOnceWith(input);
      } finally {
        parse.mockRestore();
      }
    });

    const [{ description }] =
      await f.admin`select description from membership_plans where id = ${otherPlanId}`;
    expect(description).toBe('independent caller work');
    expect(await f.counts(input.operationKey)).toStrictEqual(absent);
  });

  it('propagates a non-mapped claim database error and rolls back caller work', async () => {
    const f = await fixture();
    const input = {
      ...accepted(await f.sellable(), { memberUserId: f.member.id }),
      amountMkdMinor: 9_223_372_036_854_775_808n,
    };
    const otherPlanId = await f.plan();
    const { recordSaleInTx } = await import('../../payment-port-compose');

    await expect(
      saleScope(f, f.owner, async tx => {
        const updated = await tx.execute<{ id: string }>(sql`update membership_plans
          set description = 'independent caller work'
          where tenant_id = ${f.tenantId} and id = ${otherPlanId} returning id`);
        expect([...updated]).toStrictEqual([{ id: otherPlanId }]);
        // The claim hash casts the amount to a PostgreSQL bigint.
        const parse = vi.spyOn(recordSaleInputSchema, 'safeParse').mockReturnValueOnce({
          success: true,
          data: input,
        });
        try {
          return await recordSaleInTx(tx, f.owner.authority, input, f.owner);
        } finally {
          parse.mockRestore();
        }
      })
    ).rejects.toMatchObject({ cause: { code: '22003' } });

    const [{ description }] =
      await f.admin`select description from membership_plans where id = ${otherPlanId}`;
    expect(description).toBeNull();
    expect(await f.counts(input.operationKey)).toStrictEqual(absent);
  });
}
