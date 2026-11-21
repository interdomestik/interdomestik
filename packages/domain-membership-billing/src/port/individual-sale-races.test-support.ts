import type { TenantTransaction } from '@interdomestik/database';
import {
  restricted,
  runtimeRole,
  signal,
  waitForLockWaiters,
  type PaymentPortTestTransaction,
} from '@interdomestik/database/testing/payment-port-rls';
import { sql } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';

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
import type { SaleInput } from './sale-input';

type RunHolding<T> = (hold: (pid: number) => Promise<void>) => Promise<T>;

export async function race<T, U>(
  f: SaleFixture,
  first: RunHolding<T>,
  second: (blocker: number) => PromiseLike<U>,
  { waiters = 1, beforeRelease }: { waiters?: number; beforeRelease?: () => void } = {}
) {
  const ready = signal();
  const release = signal();
  let pid = 0;
  const holder = first(async blocker => {
    pid = blocker;
    ready.resolve();
    await release.promise;
  });
  let contender: Promise<U> | undefined;
  try {
    await Promise.race([
      ready.promise,
      holder.then(() => {
        throw new Error('Holder exited early');
      }),
    ]);
    contender = Promise.resolve(second(pid));
    await Promise.race([
      waitForLockWaiters(f.admin, pid, waiters),
      contender.then(() => {
        throw new Error('Contender finished without taking the lock');
      }),
    ]);
    beforeRelease?.();
    release.resolve();
    return { first: await holder, second: await contender };
  } finally {
    release.resolve();
    await Promise.allSettled([holder, contender]);
  }
}

export function holdingChange(
  f: SaleFixture,
  change: (tx: PaymentPortTestTransaction) => Promise<unknown>
): RunHolding<unknown> {
  return hold =>
    restricted(f.peer, f.tenantId, async tx => {
      const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
      const changed = await change(tx);
      await hold(pid);
      return changed;
    });
}

async function saleScope<T>(
  f: SaleFixture,
  who: typeof f.owner,
  work: (tx: TenantTransaction) => Promise<T>
) {
  const { withTenantAuthority } = await import('@interdomestik/database/tenant-authority-context');
  return withTenantAuthority(who.authority, work);
}

export function holdingSale(f: SaleFixture, input: SaleInput, who = f.owner): RunHolding<unknown> {
  return async hold => {
    const { recordSaleInTx } = await import('../payment-port-compose');
    return saleScope(f, who, async tx => {
      const [{ pid }] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
      success(await recordSaleInTx(tx, who.authority, input, who));
      await hold(pid);
    });
  };
}

const transitions = {
  publish: {
    stale: 'stale_offer',
    change: (f: SaleFixture, tx: PaymentPortTestTransaction) => tx`
      insert into membership_plan_versions (id, tenant_id, plan_id, version, legal_entity_id,
        tier, interval, members_included, list_price_minor, price_currency, published_by)
      select id || '-next', tenant_id, plan_id, version + 1, legal_entity_id, tier, interval,
        members_included, list_price_minor, price_currency, published_by
      from membership_plan_versions where plan_id = ${f.planId} and version = 1
    `,
    command: (f: SaleFixture) => f.publish().then(success),
  },
  withdraw: {
    stale: 'stale_offer',
    change: (f: SaleFixture, tx: PaymentPortTestTransaction) => tx`
      update membership_plan_versions set withdrawn_at = clock_timestamp(), withdrawn_by = ${f.owner.id}
      where plan_id = ${f.planId}
    `,
    command: (f: SaleFixture, input: SaleInput) => f.withdraw(input.planVersionId).then(success),
  },
  terms: {
    stale: 'stale_offer',
    change: (f: SaleFixture, tx: PaymentPortTestTransaction) => tx`
      update legal_entities set terms_version = 'v2' where id = ${f.legalEntityId}
    `,
    command: (f: SaleFixture) =>
      restricted(f.peer, f.tenantId, tx => transitions.terms.change(f, tx)),
  },
  rate: {
    stale: 'stale_rate',
    change: (f: SaleFixture, tx: PaymentPortTestTransaction) => tx`
      insert into exchange_rates (id, tenant_id, book_id, base, quote, rate, effective_on,
        revision, source, caller_kind) values (${f.bookId + '-next'}, ${f.tenantId}, ${f.bookId},
        'EUR', 'MKD', 62.00, '2000-01-10', 1, 'nbrm', 'inngest')
    `,
    command: (f: SaleFixture) =>
      f.port
        .recordExchangeRate(
          f.owner.authority,
          { base: 'EUR', quote: 'MKD', rate: '62.00', effectiveOn: '2000-01-10' },
          f.owner
        )
        .then(success),
  },
};

export function registerRaceCases(fixture: () => Promise<SaleFixture>) {
  for (const [name, transition] of Object.entries(transitions)) {
    it(`detects a committed ${name} change after waiting for its lock`, async () => {
      const f = await fixture();
      const input = accepted(await f.sellable(), { memberUserId: f.member.id });
      const result = await race(
        f,
        holdingChange(f, tx => transition.change(f, tx)),
        () => f.sale(input)
      );
      expect(result.second).toEqual(refused(transition.stale));
      expect(await f.counts(input.operationKey)).toEqual(absent);
    });

    it(`commits a sale holding its locks before a waiting ${name} writer`, async () => {
      const f = await fixture();
      const input = accepted(await f.sellable(), { memberUserId: f.member.id });
      await race(f, holdingSale(f, input), async (): Promise<unknown> =>
        transition.command(f, input)
      );
      expect(await f.counts(input.operationKey)).toEqual(completed);
    });
  }

  for (const name of ['publish', 'withdraw'] as const) {
    it(`rejects an offer after the waiting ${name} command takes the plan lock first`, async () => {
      const f = await fixture();
      const input = accepted(await f.sellable(), { memberUserId: f.member.id });
      const result = await race(
        f,
        holdingChange(
          f,
          tx => tx`select id from membership_plans where id = ${f.planId} for update`
        ),
        async blocker => {
          const writer = transitions[name].command(f, input);
          try {
            await Promise.race([
              waitForLockWaiters(f.admin, blocker, 1),
              writer.then(() => {
                throw new Error('Version writer did not wait for the plan lock');
              }),
            ]);
            const outcome = await f.sale(input);
            await writer;
            return outcome;
          } finally {
            await Promise.allSettled([writer]);
          }
        },
        { waiters: 2 }
      );
      expect(result.second).toEqual(refused('stale_offer'));
      expect(await f.counts(input.operationKey)).toEqual(absent);
    });
  }

  it('serializes a direct withdrawal waiting on a sale', async () => {
    const f = await fixture();
    const input = accepted(await f.sellable(), { memberUserId: f.member.id });
    await race(f, holdingSale(f, input), () =>
      restricted(f.peer, f.tenantId, tx => transitions.withdraw.change(f, tx))
    );
    expect(await f.counts(input.operationKey)).toEqual(completed);
    expect(await f.quote()).toEqual(refused('stale_offer'));
  });

  for (const composed of [false, true]) {
    it(`rolls back the ${composed ? 'composed' : 'standalone'} claim when the locked buyer leaves scope`, async () => {
      const f = await fixture();
      const leadId = await f.lead();
      const input = accepted(await f.sellable(), { leadId });
      const { recordSaleInTx } = await import('../payment-port-compose');
      const claims = await import('./sale-claim');
      const claimSale = claims.claimSale;
      let provisionalHash: Buffer | undefined;
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
    const { recordSaleInTx } = await import('../payment-port-compose');
    const claims = await import('./sale-claim');
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
    const { recordSaleInTx } = await import('../payment-port-compose');
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
    const { recordSaleInTx } = await import('../payment-port-compose');
    const claims = await import('./sale-claim');
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
