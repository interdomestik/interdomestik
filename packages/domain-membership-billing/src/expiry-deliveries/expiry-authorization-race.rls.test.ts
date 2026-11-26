import { expect, it, vi } from 'vitest';

import { signal, waitForLockWaiters } from '../../../database/test/exchange-rates-lock.fixture';
import {
  recipientScratchMissing,
  tenantA,
} from '../../../database/test/wp11-verified-recipient-rls.fixture';
import { recipientId, withExpiryFixture } from './expiry-deliveries.rls.fixture';

it.runIf(process.env.BILLING_RLS_INTEGRATION === '1')(
  'commits one authorization when two workers race the same live lease',
  async context => {
    const skip = recipientScratchMissing();
    if (skip) return context.skip(skip);

    await withExpiryFixture(
      2,
      async ({ admin, authority, enqueue, record, store, appPoolSize }) => {
        const { createExpiryDeliveryWorker } = await import('./index');
        expect(appPoolSize()).toBe(2);
        const entered = signal();
        const finish = signal();
        const provider = vi.fn(async () => {
          entered.resolve();
          await finish.promise;
          return Response.json({ id: 'synthetic-receipt' });
        });
        const render = vi.fn(() => ({
          subject: 'Expiry notice',
          text: 'Body',
          html: '<p>Body</p>',
        }));
        vi.stubGlobal('fetch', provider);
        vi.stubEnv('RESEND_API_KEY', 'synthetic-test-key');
        vi.stubEnv('INTERDOMESTIK_AUTOMATED', '0');
        vi.stubEnv('PLAYWRIGHT', '0');
        const timeoutMs = 30_000;
        let now = Date.now();
        const worker = createExpiryDeliveryWorker(store, {
          transport: 'resend',
          timeoutMs,
          finishReserveMs: 1000,
          render,
          now: () => now,
        });
        const rowLocked = signal();
        const releaseRow = signal();
        let blocker = 0;
        const dispatches: Array<ReturnType<typeof worker.dispatch>> = [];

        try {
          await enqueue('candidate-a');
          await enqueue('candidate-b');
          const claims = await Promise.all([
            worker.claim(authority, 'candidate-a'),
            worker.claim(authority, 'candidate-a'),
            worker.claim(authority, 'candidate-b'),
            worker.claim(authority, 'candidate-b'),
          ]);
          expect(
            claims
              .filter(result => result.ok)
              .map(result => result.claim.periodId)
              .sort()
          ).toEqual(['candidate-a', 'candidate-b']);
          expect(claims.filter(result => !result.ok)).toEqual([
            { ok: false, code: 'lease_unavailable' },
            { ok: false, code: 'lease_unavailable' },
          ]);
          expect((await record('candidate-a')).attempts).toBe(1);
          expect((await record('candidate-b')).attempts).toBe(1);

          await enqueue('race');
          const claimed = await worker.claim(authority, 'race');
          expect(claimed).toMatchObject({ ok: true });
          if (!claimed.ok) throw new Error(claimed.code);
          const holder = admin.begin(async tx => {
            const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
            blocker = pid;
            await tx`select period_id from expiry_fixture_delivery
            where tenant_id = ${tenantA} and period_id = 'race' for update`;
            rowLocked.resolve();
            await releaseRow.promise;
          });
          try {
            await Promise.race([rowLocked.promise, holder]);
            dispatches.push(
              worker.dispatch(authority, claimed.claim),
              worker.dispatch(authority, claimed.claim)
            );
            await Promise.race([
              waitForLockWaiters(admin, blocker, 2),
              ...dispatches.map(pending =>
                pending.then(() => {
                  throw new Error('dispatch completed while the delivery row was locked');
                })
              ),
            ]);
          } finally {
            releaseRow.resolve();
            await holder;
          }

          const loser = await Promise.race(dispatches);
          expect(loser).toEqual({ ok: false, code: 'authorization_exists' });
          await entered.promise;
          expect(provider).toHaveBeenCalledOnce();
          expect(render).toHaveBeenCalledOnce();
          const authorization = {
            leaseToken: claimed.claim.leaseToken,
            authorizedAt: now,
            transportDeadline: now + timeoutMs,
          };
          const drain = await record('race');
          expect(drain).toMatchObject({
            state: 'claimed',
            lease: { token: authorization.leaseToken },
            authorization,
          });

          await admin`update "user" set role = 'staff' where id = ${recipientId}`;
          expect(await worker.dispatch(authority, claimed.claim)).toEqual(loser);
          expect(await record('race')).toEqual(drain);
          expect(provider).toHaveBeenCalledOnce();

          await admin`update expiry_fixture_gate set enabled = false where tenant_id = ${tenantA}`;
          now += 10 * 60_000;
          expect(await worker.claim(authority, 'race')).toEqual({ ok: false, code: 'gate_closed' });
          expect(await record('race')).toEqual(drain);
          finish.resolve();
          expect(await Promise.all(dispatches)).toEqual(
            expect.arrayContaining([{ ok: true, state: 'sent' }, loser])
          );
          expect(await record('race')).toMatchObject({ state: 'sent', authorization: null });
          expect(provider).toHaveBeenCalledOnce();
        } finally {
          finish.resolve();
          await Promise.allSettled(dispatches);
          vi.unstubAllGlobals();
          vi.unstubAllEnvs();
        }
      }
    );
  },
  120_000
);
