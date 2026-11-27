import type { TenantTransaction } from '@interdomestik/database';
import {
  restricted,
  signal,
  waitForLockWaiters,
  type PaymentPortTestTransaction,
} from '../../../../database/test/exchange-rates.fixture';
import { sql } from 'drizzle-orm';
import { expect, it } from 'vitest';

import type { SaleInput } from '../../port/sale-input';
import {
  accepted,
  absent,
  completed,
  refused,
  success,
  type SaleFixture,
} from './individual-sales.test-support';

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

export async function saleScope<T>(
  f: SaleFixture,
  who: typeof f.owner,
  work: (tx: TenantTransaction) => Promise<T>
) {
  const { withTenantAuthority } = await import('@interdomestik/database/tenant-authority-context');
  return withTenantAuthority(who.authority, work);
}

export function holdingSale(f: SaleFixture, input: SaleInput, who = f.owner): RunHolding<unknown> {
  return async hold => {
    const { recordSaleInTx } = await import('../../payment-port-compose');
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
        revision, source, caller_kind, stored_by, corrects_rate_id, correction_reason)
      select ${f.bookId + '-next'}, tenant_id, book_id, base, quote, 62.00, effective_on,
        revision + 1, 'nbrm', 'staff', ${f.owner.id}, id, 'Corrected official value'
      from exchange_rates where tenant_id = ${f.tenantId} and book_id = ${f.bookId}
        and effective_on = ${f.today}::date and revision = 1
    `,
    command: (f: SaleFixture, input: SaleInput) =>
      f.correctRate({ id: input.rateId, effective_on: f.today }, '62.00'),
  },
};

export function registerOfferRaceCases(fixture: () => Promise<SaleFixture>) {
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
      await race(f, holdingSale(f, input), (): PromiseLike<unknown> =>
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
}
