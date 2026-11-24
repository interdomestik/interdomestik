import { randomUUID } from 'node:crypto';
import {
  paymentPortTestGuardRole,
  restricted,
  runSequentially,
  runtimeRole,
} from '../../../../database/test/exchange-rates.fixture';
import { expect, it } from 'vitest';

import type { SaleInput } from '../../port/sale-input';
import {
  canonicalHash,
  directSaleRow,
  insertDirectSale,
  tryInsertDirectSale,
} from './individual-sale-direct.test-support';
import {
  accepted,
  absent,
  completed,
  refused,
  success,
  type SaleFixture,
} from './individual-sales.test-support';

export function registerSaleIntegrityCases(fixture: () => Promise<SaleFixture>) {
  it.each([
    {
      code: 'stale_offer',
      makeStale: async (f: SaleFixture, input: SaleInput) => {
        success(await f.withdraw(input.planVersionId));
      },
    },
    {
      code: 'stale_rate',
      makeStale: async (f: SaleFixture) => {
        const [replacement] = await f.addRate('62.00', '2000-01-10');
        expect((await f.offer()).rateId).toBe(replacement.id);
      },
    },
  ])(
    'maps $code from a direct SQL insert and leaves the transaction usable',
    async ({ code, makeStale }) => {
      const f = await fixture();
      const input = accepted(await f.sellable(), { memberUserId: f.member.id });
      const row = await directSaleRow(f, input);
      await makeStale(f, input);

      await restricted(f.admin, f.tenantId, async tx => {
        await tx`savepoint sale_candidate`;
        expect(await tryInsertDirectSale(tx, row)).toBe(code);
        const [persisted] = await tx`select current_user as role,
        exists(select 1 from membership_sales where id = ${row.id}) as sale,
        exists(select 1 from membership_ledger_entries
          where sale_id = ${row.id} and kind = 'charge') as charge`;
        expect(persisted).toEqual({ role: runtimeRole, sale: false, charge: false });
        // The deferred claim constraint requires a sale at commit.
        await tx`rollback to savepoint sale_candidate`;
        await tx`release savepoint sale_candidate`;
      });
    }
  );

  it('checks each direct snapshot, lookup, reserved void and hash invariant independently', async () => {
    const f = await fixture();
    const input = accepted(await f.sellable(), { leadId: await f.lead() });
    const good = await directSaleRow(f, input);
    await runSequentially(
      [
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
      ] as const,
      async ([patch, code, name]) => {
        const row = { ...good, ...patch };
        await expect(
          restricted(f.admin, f.tenantId, tx => insertDirectSale(tx, row))
        ).rejects.toMatchObject({ code, ...(name ? { constraint_name: name } : {}) });
        expect(await f.counts(input.operationKey)).toEqual(absent);
      }
    );
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
    ).rejects.toMatchObject({
      code: '23505',
      constraint_name: 'membership_sale_claims_operation_uq',
    });
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

  it.each(['A'.repeat(64), 'g'.repeat(64), 'a'.repeat(63), 'a'.repeat(65)])(
    'refuses a malformed claim hash %s',
    async hash => {
      const f = await fixture();
      const key = randomUUID();
      await expect(
        restricted(
          f.admin,
          f.tenantId,
          tx => tx`
        insert into membership_sale_claims (tenant_id, operation_key, request_hash, claimed_at)
        values (${f.tenantId}, ${key}, ${hash}, clock_timestamp())
      `
        )
      ).rejects.toMatchObject({
        code: '23514',
        constraint_name: 'membership_sale_claims_hash_check',
      });
      expect(await f.counts(key)).toEqual(absent);
    }
  );

  it('enforces the operation-key limit in the restricted command and in both tables', async () => {
    const f = await fixture();
    const input = {
      ...accepted(await f.sellable(), { memberUserId: f.member.id }),
      operationKey: '📄'.repeat(255),
    };
    const operationKey = `${input.operationKey}📄`;
    const row = await directSaleRow(f, { ...input, operationKey });
    success(await f.sale(input));
    expect(await f.counts(input.operationKey)).toStrictEqual(completed);
    expect(await f.sale({ ...input, operationKey })).toStrictEqual(refused('invalid'));

    await expect(
      restricted(
        f.admin,
        f.tenantId,
        tx => tx`
        insert into membership_sale_claims (tenant_id, operation_key, request_hash, claimed_at)
        values (${row.tenant_id}, ${row.operation_key}, ${row.request_hash}, clock_timestamp())
      `
      )
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'membership_sale_claims_operation_key_check',
    });
    await expect(
      restricted(f.admin, f.tenantId, tx => tx`insert into membership_sales ${tx(row)}`)
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'membership_sales_operation_key_check',
    });
    expect(await f.counts(operationKey)).toStrictEqual(absent);
  });

  it('enforces the sale hash and plan tier domains for other sale kinds', async () => {
    const f = await fixture();
    const input = accepted(await f.sellable(), { memberUserId: f.member.id });
    const row = await directSaleRow(f, input);
    // Non-individual kinds exercise the row checks without the individual insert trigger.
    const kind = 'unregistered';
    await runSequentially(
      [
        [{ request_hash: 'A'.repeat(64) }, 'membership_sales_request_hash_check'],
        [{ plan_tier: 'premium' }, 'membership_sales_plan_tier_check'],
      ] as const,
      async ([patch, constraint_name]) => {
        await expect(
          restricted(f.admin, f.tenantId, async tx => {
            await tx`insert into membership_sale_claims
              (tenant_id, operation_key, request_hash, claimed_at)
              values (${row.tenant_id}, ${row.operation_key}, ${row.request_hash}, clock_timestamp())`;
            const candidate = { ...row, kind, ...patch };
            return tx`insert into membership_sales ${tx(candidate)}`;
          })
        ).rejects.toMatchObject({ code: '23514', constraint_name });
        expect(await f.counts(input.operationKey)).toEqual(absent);
      }
    );
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
      values (${f.tenantId}, ${key}, ${'0'.repeat(64)}, clock_timestamp())
    `,
        runtimeRole
      )
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'membership_claims_require_sale' });
    expect(await f.counts(key)).toEqual(absent);
  });
}
