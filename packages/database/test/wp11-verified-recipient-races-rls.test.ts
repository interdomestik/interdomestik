import assert from 'node:assert/strict';
import test from 'node:test';

import { sql } from 'drizzle-orm';
import type { TransactionSql } from 'postgres';

import type { TenantTransaction } from '../src/index';
import { mintTenantAuthority } from '../src/tenant-authority';
import { signal, waitForLockWaiters } from './exchange-rates-lock.fixture';
import {
  recipientScratchMissing,
  seedRecipient,
  tenantA,
  withVerifiedRecipientDatabase,
} from './wp11-verified-recipient-rls.fixture';

const member = 'wp11-member';
const lease = 'wp11-lease';
const principal = { userId: member, role: 'member', branchId: null, agentId: null };
const scheduled = mintTenantAuthority({ tenantId: tenantA, purpose: 'scheduled-work' });
const session = mintTenantAuthority({ tenantId: tenantA, purpose: 'session', principal });

test('verified recipient locking and snapshot invalidation under the restricted runtime login', async t => {
  const skip = recipientScratchMissing();
  if (skip) return t.skip(skip);

  await withVerifiedRecipientDatabase(2, async ({ admin }) => {
    const [
      {
        captureVerifiedRecipientInTx: capture,
        authorizeVerifiedRecipientInTx: authorize,
        savePreferredLocale,
      },
      { withTenantAuthority },
    ] = await Promise.all([
      import('../../domain-communications/src/recipient-locale'),
      import('../src/tenant-authority-context'),
    ]);
    const email = await seedRecipient(admin, tenantA, member);

    const scoped = <T>(action: (tx: TenantTransaction) => Promise<T>) =>
      withTenantAuthority(scheduled, action);
    async function snapshot() {
      const result = await scoped(tx => capture(tx, scheduled, member, lease));
      assert.ok(result.ok, JSON.stringify(result));
      return result.handle;
    }
    const prepare = (handle: Awaited<ReturnType<typeof snapshot>>) =>
      scoped(tx => authorize(tx, scheduled, member, lease, handle));

    const changed = { ok: false, code: 'recipient_changed' };
    for (const field of ['address', 'locale'] as const) {
      const edit = (tx: TransactionSql, changedValue: boolean) =>
        field === 'address'
          ? tx`update "user" set email = ${changedValue ? 'changed@example.test' : email}
              where id = ${member}`
          : tx`update user_locale_preferences set locale = ${changedValue ? 'mk' : 'sq'}
              where tenant_id = ${tenantA} and user_id = ${member}`;

      await t.test(
        `a ${field} change that commits first invalidates the waiting authorization`,
        async () => {
          const handle = await snapshot();
          const locked = signal();
          const release = signal();
          let blocker = 0;
          const writer = admin.begin(async tx => {
            const [{ pid }] = await tx<{ pid: number }[]>`select pg_backend_pid() as pid`;
            blocker = pid;
            await edit(tx, true);
            locked.resolve();
            await release.promise;
          });
          let pending: ReturnType<typeof prepare> | undefined;
          try {
            await Promise.race([locked.promise, writer]);
            pending = prepare(handle);
            await Promise.race([
              waitForLockWaiters(admin, blocker, 1),
              pending.then(() => assert.fail('authorization did not wait for the writer')),
            ]);
            release.resolve();
            await writer;
            assert.deepEqual(await pending, changed);
          } finally {
            release.resolve();
            await Promise.allSettled([writer, pending]);
            await admin.begin(tx => edit(tx, false));
          }
        }
      );

      await t.test(`authorization holds the ${field} lock through its commit`, async () => {
        const handle = await snapshot();
        const locked = signal();
        const release = signal();
        let blocker = 0;
        const reader = scoped(async tx => {
          const [{ pid }] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
          blocker = pid;
          assert.deepEqual(await authorize(tx, scheduled, member, lease, handle), {
            ok: true,
            recipient: { email, locale: 'sq' },
          });
          locked.resolve();
          await release.promise;
        });
        let pending: PromiseLike<unknown> | undefined;
        try {
          await Promise.race([locked.promise, reader]);
          pending =
            field === 'address'
              ? admin.begin(tx => edit(tx, true))
              : savePreferredLocale(
                  session,
                  {
                    user: {
                      id: member,
                      role: 'member',
                      tenantId: tenantA,
                      accessTenantId: tenantA,
                    },
                  },
                  'mk'
                );
          await Promise.race([
            waitForLockWaiters(admin, blocker, 1),
            pending.then(() => assert.fail('the writer did not wait for authorization commit')),
          ]);
          release.resolve();
          await reader;
          const written = await pending;
          if (field === 'locale') assert.equal(written, 'saved');
          assert.deepEqual(await prepare(handle), changed);
        } finally {
          release.resolve();
          await Promise.allSettled([reader, pending]);
          await admin.begin(tx => edit(tx, false));
        }
      });

      await t.test(
        `editing and restoring ${field} still invalidates the claimed snapshot`,
        async () => {
          const handle = await snapshot();
          await admin.begin(tx => edit(tx, true));
          await admin.begin(tx => edit(tx, false));
          assert.deepEqual(await prepare(handle), changed);
          assert.deepEqual(await prepare(await snapshot()), {
            ok: true,
            recipient: { email, locale: 'sq' },
          });
        }
      );
    }
  });
});
