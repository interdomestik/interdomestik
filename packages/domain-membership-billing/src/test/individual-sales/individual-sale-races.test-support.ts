import { restricted, runtimeRole, signal } from '../../../../database/test/exchange-rates.fixture';
import { sql } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';

import {
  canonicalHash,
  directSaleRow,
  insertDirectSale,
} from './individual-sale-direct.test-support';
import {
  holdingChange,
  holdingSale,
  race,
  registerOfferRaceCases,
  saleScope,
} from './individual-sale-offer-races.test-support';
import {
  accepted,
  absent,
  completed,
  refused,
  success,
  type SaleFixture,
} from './individual-sales.test-support';

export function registerRaceCases(fixture: () => Promise<SaleFixture>) {
  registerOfferRaceCases(fixture);

  for (const composed of [false, true]) {
    it(`rolls back the ${composed ? 'composed' : 'standalone'} claim when the locked buyer leaves scope`, async () => {
      const f = await fixture();
      const leadId = await f.lead();
      const input = accepted(await f.sellable(), { leadId });
      const { recordSaleInTx } = await import('../../payment-port-compose');
      const claims = await import('../../port/sale-claim');
      const claimSale = claims.claimSale;
      let provisionalHash: string | undefined;
      const spy = vi.spyOn(claims, 'claimSale').mockImplementation(async (...args) => {
        const claim = await claimSale(...args);
        if (args[2] === input.operationKey) provisionalHash = claim?.requestHash;
        return claim;
      });
      const contender = (): Promise<unknown> =>
        composed
          ? saleScope(f, f.agent, async tx => {
              expect(await recordSaleInTx(tx, f.agent.authority, input, f.agent)).toEqual(
                refused('not_found')
              );
              await tx.execute(sql`update membership_plans set description = 'unrelated caller work'
              where tenant_id = ${f.tenantId} and id = ${f.planId}`);
            })
          : f.sale(input, f.agent);
      try {
        const reassign = holdingChange(
          f,
          tx => tx`update member_leads set agent_id = ${f.otherAgent.id} where id = ${leadId}`
        );
        const result = await race(f, reassign, contender, {
          beforeRelease: () => expect(provisionalHash).toEqual(canonicalHash(input)),
        });
        if (composed) {
          const [{ description }] =
            await f.admin`select description from membership_plans where id = ${f.planId}`;
          expect(description).toBe('unrelated caller work');
        } else {
          expect(result.second).toEqual(refused('not_found'));
        }
      } finally {
        spy.mockRestore();
      }
      expect(await f.counts(input.operationKey)).toEqual(absent);
      success(await f.sale(input, f.otherAgent));
      expect(await f.counts(input.operationKey)).toEqual(completed);
    });
  }

  it('refuses an overlapping composed sale and preserves the successful sale at commit', async () => {
    const f = await fixture();
    const offer = await f.sellable();
    const first = accepted(offer, { leadId: await f.lead() });
    const second = accepted(offer, { leadId: await f.lead() });
    const { recordSaleInTx } = await import('../../payment-port-compose');
    const claims = await import('../../port/sale-claim');
    const claimSale = claims.claimSale;
    const claimed = signal();
    const release = signal();
    const spy = vi.spyOn(claims, 'claimSale').mockImplementation(async (...args) => {
      const claim = await claimSale(...args);
      if (args[2] === first.operationKey) {
        expect(claim?.requestHash).toEqual(canonicalHash(first));
        claimed.resolve();
        await release.promise;
      }
      return claim;
    });
    try {
      const saleId = await saleScope(f, f.owner, async tx => {
        const pending = recordSaleInTx(tx, f.owner.authority, first, f.owner);
        try {
          await Promise.race([
            claimed.promise,
            pending.then(() => {
              throw new Error('First sale finished before pausing at its claim');
            }),
          ]);
          expect(await recordSaleInTx(tx, f.owner.authority, second, f.owner)).toEqual(
            refused('invalid')
          );
        } finally {
          release.resolve();
          await Promise.allSettled([pending]);
        }
        return success(await pending).sale.id;
      });
      expect(await f.counts(first.operationKey)).toEqual(completed);
      expect(await f.counts(second.operationKey)).toEqual(absent);
      const [sale] = await f.admin`select id from membership_sales
        where tenant_id = ${f.tenantId} and operation_key = ${first.operationKey}`;
      expect(sale?.id).toBe(saleId);
    } finally {
      spy.mockRestore();
    }
  });

  it('releases the savepoint after sequential composed successes and refusals', async () => {
    const f = await fixture();
    const offer = await f.sellable();
    const first = accepted(offer, { leadId: await f.lead() });
    const second = accepted(offer, { leadId: await f.lead() });
    const { recordSaleInTx } = await import('../../payment-port-compose');
    await expect(
      saleScope(f, f.owner, async tx => {
        const nested = vi.spyOn(tx, 'transaction');
        try {
          success(await recordSaleInTx(tx, f.owner.authority, first, f.owner));
          const invalid = { ...second, amountMkdMinor: second.amountMkdMinor + 100n };
          expect(await recordSaleInTx(tx, f.owner.authority, invalid, f.owner)).toEqual(
            refused('invalid')
          );
          success(await recordSaleInTx(tx, f.owner.authority, second, f.owner));
          expect(nested).not.toHaveBeenCalled();
        } finally {
          nested.mockRestore();
        }
        await tx.execute(sql`rollback to savepoint wp07_sale`);
      })
    ).rejects.toMatchObject({ cause: { code: '3B001' } });
  });

  it('commits the sale with its locked attribution before reassignment', async () => {
    const f = await fixture();
    const leadId = await f.lead();
    const input = accepted(await f.sellable(), { leadId });
    await race(f, holdingSale(f, input, f.agent), () =>
      restricted(
        f.peer,
        f.tenantId,
        tx => tx`
      update member_leads set agent_id = ${f.otherAgent.id} where id = ${leadId}
    `
      )
    );
    expect(success(await f.sale(input, f.otherAgent)).sale.agentId).toBe(f.agent.id);
    expect(await f.counts(input.operationKey)).toEqual(completed);
  });

  it('refuses a direct repeatable-read insert holding a snapshot from before a rate correction', async () => {
    const f = await fixture();
    const input = accepted(await f.sellable(), { memberUserId: f.member.id });
    const row = await directSaleRow(f, input);
    await expect(
      restricted(
        f.peer,
        f.tenantId,
        async tx => {
          const first = await tx`select id from exchange_rates`;
          expect(first.map(rate => rate.id)).toEqual([input.rateId]);
          const correction = await f.port.recordExchangeRate(
            f.owner.authority,
            {
              base: 'EUR',
              quote: 'MKD',
              rate: '62.00',
              effectiveOn: row.rate_effective_on,
              correctsRateId: input.rateId,
              correctionReason: 'Synthetic correction',
            },
            f.owner
          );
          expect(success(correction).rate.revision).toBe(2);
          expect((await tx`select id from exchange_rates`).map(rate => rate.id)).toEqual([
            input.rateId,
          ]);
          await insertDirectSale(tx, row);
        },
        runtimeRole,
        'repeatable read'
      )
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'membership_sales_read_committed_guard',
    });
    expect(await f.counts(input.operationKey)).toEqual(absent);
  });

  it('waits for the winner’s claim and returns its sale after a new rate commits before replay', async () => {
    const f = await fixture();
    const input = accepted(await f.sellable(), { memberUserId: f.member.id });
    const { recordSaleInTx } = await import('../../payment-port-compose');
    const claims = await import('../../port/sale-claim');
    const readReplay = claims.replaySale;
    const reachedReplay = signal();
    const rateCommitted = signal();
    const spy = vi.spyOn(claims, 'replaySale').mockImplementation(async (...args) => {
      reachedReplay.resolve();
      await rateCommitted.promise;
      return readReplay(...args);
    });
    let winnerId: string | undefined;
    let replayId: string | undefined;
    let publisher: Promise<unknown> | undefined;
    try {
      publisher = (async () => {
        await reachedReplay.promise;
        await f.addRate('62.17', '2000-01-10');
        expect((await f.offer()).rateId).not.toBe(input.rateId);
      })().finally(() => rateCommitted.resolve());
      // Release the publisher when an assertion or an unexpected branch prevents replay.
      await race(
        f,
        hold =>
          saleScope(f, f.owner, async tx => {
            const [{ pid }] = await tx.execute<{ pid: number }>(
              sql`select pg_backend_pid() as pid`
            );
            winnerId = success(await recordSaleInTx(tx, f.owner.authority, input, f.owner)).sale.id;
            await hold(pid);
          }),
        () =>
          saleScope(f, f.owner, async tx => {
            const result = await recordSaleInTx(tx, f.owner.authority, input, f.owner);
            replayId = success(result).sale.id;
          })
      );
      expect(spy).toHaveBeenCalledOnce();
      await publisher;
      expect(replayId).toBe(winnerId);
      expect(await f.counts(input.operationKey)).toEqual(completed);
    } finally {
      reachedReplay.resolve();
      rateCommitted.resolve();
      await Promise.allSettled([publisher]);
      spy.mockRestore();
    }
  });
}
