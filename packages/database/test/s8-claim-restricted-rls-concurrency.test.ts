import assert from 'node:assert/strict';
import test from 'node:test';

import { eq, inArray, sql } from 'drizzle-orm';

import { claimMessages } from '../src/schema';
import {
  KS_TENANT_ID,
  MK_TENANT_ID,
  openS8RestrictedSession,
} from './s8-claim-restricted-rls.fixture';

const POOL_SIZE = 4;
const CONTEXTS = 12;

class DeliberateAbort extends Error {}

// Plan070 U2-b: the restricted RLS client keeps tenant contexts apart when transactions overlap
// on a small pool, and no committed or rolled-back context survives on a reused connection.
test('S8 restricted tenant contexts stay isolated under concurrency and rollback', async t => {
  const session = await openS8RestrictedSession(t, { DB_MAX_CONNECTIONS: String(POOL_SIZE) });
  if (!session) return;
  const { adminDb, fixture, dbRls, withTenantContext } = session;
  const { ks, mk } = fixture;
  const adminMessage = async (id: string) =>
    (await adminDb.select().from(claimMessages).where(eq(claimMessages.id, id)))[0];
  const accessGucByPid = () =>
    dbRls.execute<{ pid: number; tenant: string | null }>(sql`
      select pg_backend_pid() as pid,
        nullif(current_setting('app.current_access_tenant_id', true), '') as tenant`);
  try {
    await t.test('overlapping contexts never observe each other and reset on release', async () => {
      const tenants = Array.from({ length: CONTEXTS }, (_, i) =>
        i % 2 ? MK_TENANT_ID : KS_TENANT_ID
      );
      const observed: {
        index: number;
        pid?: number;
        expected: string;
        guc?: string;
        seen: string[];
      }[] = [];
      const outcomes = await Promise.all(
        tenants.map((tenantId, index) =>
          withTenantContext({ tenantId }, async tx => {
            const [guc] = await tx.execute<{ pid: number; tenant: string }>(sql`
              select pg_backend_pid() as pid,
                current_setting('app.current_access_tenant_id', true) as tenant`);
            await tx.execute(sql`select pg_sleep(0.05)`);
            const rows = await tx
              .select({ tenantId: claimMessages.tenantId })
              .from(claimMessages)
              .where(inArray(claimMessages.id, [ks.messageId, mk.messageId]));
            observed.push({
              index,
              pid: guc?.pid,
              expected: tenantId,
              guc: guc?.tenant,
              seen: rows.map(r => r.tenantId),
            });
            // Every third context aborts after reading, so rollback paths share the pool too.
            if (index % 3 === 2) throw new DeliberateAbort();
            return 'committed' as const;
          }).catch((error: unknown) => {
            if (error instanceof DeliberateAbort) return 'aborted' as const;
            throw error;
          })
        )
      );
      assert.equal(outcomes.filter(outcome => outcome === 'aborted').length, CONTEXTS / 3);
      assert.equal(observed.length, CONTEXTS, 'every context, committed or aborted, reported');
      for (const row of observed) {
        assert.deepEqual(row, { ...row, guc: row.expected, seen: [row.expected] });
      }
      const pids = new Set(observed.map(row => row.pid));
      assert.ok(pids.size > 1, 'transactions overlapped on more than one connection');
      assert.ok(pids.size <= POOL_SIZE, 'the pinned pool forced connection reuse');

      const after = await Promise.all(Array.from({ length: CONTEXTS }, accessGucByPid));
      const released = after.map(rows => rows[0]);
      assert.ok(
        released.some(row => row && pids.has(row.pid)),
        'a reused connection was probed'
      );
      assert.deepEqual(
        released.map(row => row?.tenant ?? null),
        released.map(() => null)
      );
    });

    await t.test('a failed transaction rolls back its writes', async () => {
      const messageId = fixture.newId('s8rls_message_rolled_back');
      fixture.extraMessageIds.push(messageId);
      await assert.rejects(
        withTenantContext({ tenantId: KS_TENANT_ID }, async tx => {
          await tx.insert(claimMessages).values({
            id: messageId,
            tenantId: KS_TENANT_ID,
            claimId: ks.claimId,
            senderId: ks.userId,
            content: 'rolled back',
          });
          const updated = await tx
            .update(claimMessages)
            .set({ content: 'rolled back' })
            .where(eq(claimMessages.id, ks.messageId))
            .returning({ content: claimMessages.content });
          assert.deepEqual(
            updated,
            [{ content: 'rolled back' }],
            'the update applied in-transaction'
          );
          throw new Error('abort after writes');
        }),
        /abort after writes/u
      );
      assert.equal(await adminMessage(messageId), undefined);
      assert.equal((await adminMessage(ks.messageId))?.content, `original ${KS_TENANT_ID}`);
    });
  } finally {
    await session.close();
  }
});
