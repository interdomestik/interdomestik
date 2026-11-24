import {
  restricted,
  signal,
  waitForLockWaiters,
} from '../../../../database/test/exchange-rates.fixture';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { setTimeout as poll } from 'node:timers/promises';
import { expect, it } from 'vitest';

import { directSaleRow, insertDirectSale } from './individual-sale-direct.test-support';
import { race, saleScope } from './individual-sale-offer-races.test-support';
import { absent, completed, refused, success } from './individual-sales.test-support';
import {
  ageCandidate,
  ageViolation,
  insertEvidence,
  type AgeFixture,
} from './rate-age.test-support';

export function registerRateAgeRaceCases(fixture: AgeFixture) {
  for (const direct of [false, true]) {
    const path = direct ? 'direct INSERT' : 'port sale';
    for (const commits of [true, false]) {
      it(`resolves a ${path} waiting for a verifier that ${commits ? 'commits' : 'rolls back'}`, async () => {
        const f = await fixture();
        const { input, evidence } = await ageCandidate(f);
        const row = await directSaleRow(f, input, { deriveDueOn: true });
        const rollback = new Error('Roll back the held verification');
        let marker = '';
        const result = await race(
          f,
          hold =>
            restricted(f.peer, f.tenantId, async tx => {
              const [{ verified_at }] = await insertEvidence(f, tx, evidence);
              const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
              await hold(pid);
              const [clock] = await tx<{ stamp: string; after_verification: boolean }[]>`
                with marker as materialized (select clock_timestamp() as instant)
                select instant::text as stamp, instant > ${verified_at}::text::timestamptz as after_verification
                from marker`;
              marker = clock.stamp;
              expect(clock.after_verification).toBe(true);
              if (!commits) throw rollback;
            }).catch((error: unknown) => {
              if (error !== rollback) throw error;
            }),
          async () => {
            if (!direct) return f.sale(input);
            return restricted(f.peer, f.tenantId, tx => insertDirectSale(tx, row)).then(
              () => ({ ok: true as const }),
              (error: unknown) => ({ error })
            );
          }
        );
        if (commits) {
          expect(result.second).toMatchObject({ ok: true });
          const [sale] =
            await f.admin`select rate_id, sold_at >= ${marker}::text::timestamptz as after_marker
            from membership_sales where operation_key = ${input.operationKey}`;
          expect(sale).toEqual({ rate_id: evidence.rateId, after_marker: true });
          expect(await f.counts(input.operationKey)).toEqual(completed);
        } else {
          expect(result.second).toMatchObject(
            direct ? { error: ageViolation } : refused('stale_rate')
          );
          expect(await f.counts(input.operationKey)).toEqual(absent);
        }
      }, 15000);
    }

    it(`stamps a waiting verification after a successful ${path} releases the book`, async () => {
      const f = await fixture();
      const { input, evidence } = await ageCandidate(f);
      success(await f.verify(evidence));
      const lateEvidence = { ...evidence, operationKey: randomUUID() };
      const row = await directSaleRow(f, input, { deriveDueOn: true });
      const { recordSaleInTx } = await import('../../payment-port-compose');
      const result = await race(
        f,
        hold =>
          direct
            ? restricted(f.peer, f.tenantId, async tx => {
                await insertDirectSale(tx, row);
                const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
                await hold(pid);
                const [{ stamp }] = await tx<
                  { stamp: string }[]
                >`select clock_timestamp()::text as stamp`;
                return stamp;
              })
            : saleScope(f, f.owner, async tx => {
                success(await recordSaleInTx(tx, f.owner.authority, input, f.owner));
                const [{ pid }] = await tx.execute<{ pid: number }>(
                  sql`select pg_backend_pid() as pid`
                );
                await hold(pid);
                const [{ stamp }] = await tx.execute<{ stamp: string }>(
                  sql`select clock_timestamp()::text as stamp`
                );
                return stamp;
              }),
        () => f.verify(lateEvidence)
      );
      success(result.second);
      const [verification] =
        await f.admin`select verified_at >= ${result.first}::text::timestamptz as after_marker
        from exchange_rate_verifications where operation_key = ${lateEvidence.operationKey}`;
      expect(verification).toEqual({ after_marker: true });
      expect(await f.counts(input.operationKey)).toEqual(completed);
    }, 15000);
  }

  it('releases a refused composed sale’s book lock before the outer transaction finishes', async () => {
    const f = await fixture();
    const { input, evidence } = await ageCandidate(f);
    const buyerLocked = signal();
    const releaseBuyer = signal();
    const saleStarted = signal();
    const saleRefused = signal();
    const finishSale = signal();
    let buyerPid = 0;
    let salePid = 0;
    const buyer = restricted(f.peer, f.tenantId, async tx => {
      const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
      buyerPid = pid;
      await tx`select id from "user" where id = ${f.member.id} for update`;
      buyerLocked.resolve();
      await releaseBuyer.promise;
    });
    const { recordSaleInTx } = await import('../../payment-port-compose');
    let sale: Promise<void> | undefined;
    let verifier: ReturnType<typeof f.verify> | undefined;
    try {
      await Promise.race([buyerLocked.promise, buyer]);
      sale = saleScope(f, f.owner, async tx => {
        const [{ pid }] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        salePid = pid;
        saleStarted.resolve();
        expect(await recordSaleInTx(tx, f.owner.authority, input, f.owner)).toEqual(
          refused('stale_rate')
        );
        saleRefused.resolve();
        await finishSale.promise;
      });
      await Promise.race([saleStarted.promise, sale]);
      await Promise.race([waitForLockWaiters(f.admin, buyerPid, 1), sale]);
      verifier = f.verify(evidence);
      await Promise.race([
        waitForLockWaiters(f.admin, salePid, 1),
        verifier.then(() => {
          throw new Error('The verifier bypassed the sale’s shared book lock');
        }),
      ]);
      releaseBuyer.resolve();
      await Promise.race([saleRefused.promise, sale]);
      success(
        await Promise.race([
          verifier,
          poll(5000, undefined, { ref: false }).then(() => {
            throw new Error('The refused sale retained the book lock past its savepoint');
          }),
        ])
      );
      expect(await f.counts(input.operationKey)).toEqual(absent);
      finishSale.resolve();
      await sale;
      success(await f.sale(input));
      expect(await f.counts(input.operationKey)).toEqual(completed);
    } finally {
      releaseBuyer.resolve();
      finishSale.resolve();
      await Promise.allSettled([buyer, sale, verifier]);
    }
  }, 15000);
}
