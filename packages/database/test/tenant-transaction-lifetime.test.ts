import assert from 'node:assert/strict';
import test from 'node:test';

import { eq, inArray, sql } from 'drizzle-orm';

import { claimMessages } from '../src/schema';
import type { TenantTransaction } from '../src/tenant';
import {
  KS_TENANT_ID,
  MK_TENANT_ID,
  openS8RestrictedSession,
} from './s8-claim-restricted-rls.fixture';

const GUCS = sql`select pg_backend_pid() as pid,
  nullif(current_setting('app.current_access_tenant_id', true), '') as access`;

// drizzle wraps driver errors; the lifetime error may sit on the error or its cause chain.
function isClosed(error: unknown): boolean {
  for (let current = error; current; current = (current as { cause?: unknown }).cause) {
    if ((current as { name?: string }).name === 'ClosedTransactionError') return true;
  }
  return false;
}
const rejectsClosed = (attempt: () => PromiseLike<unknown>, label: string) =>
  assert.rejects(async () => attempt(), isClosed, `${label} must be revoked`);

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => undefined as void;
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

// Plan070 §4 / Codex tx-escape review: every capability a tenant transaction hands its callback
// expires when the callback settles, on the restricted role and a one-connection pool, so an
// escaped capability can never run inside the next transaction that reuses the connection.
test('tenant transaction capabilities expire with their callback', async t => {
  const session = await openS8RestrictedSession(t, { DB_MAX_CONNECTIONS: '1' });
  if (!session) return;
  const { adminDb, fixture, withTenantContext } = session;
  const { ks, mk } = fixture;
  const asTenant = <T>(tenantId: string, action: (tx: TenantTransaction) => Promise<T>) =>
    withTenantContext({ tenantId }, action);
  const messages = (tx: Pick<TenantTransaction, 'select'>) =>
    tx
      .select({ id: claimMessages.id })
      .from(claimMessages)
      .where(inArray(claimMessages.id, [ks.messageId, mk.messageId]));
  const adminMessage = async (id: string) =>
    (await adminDb.select().from(claimMessages).where(eq(claimMessages.id, id)))[0];
  const marker = (label: string) => {
    const id = fixture.newId(`s8rls_lifetime_${label}`);
    fixture.extraMessageIds.push(id);
    return id;
  };
  const insertMarker = (tx: Pick<TenantTransaction, 'insert'>, id: string) =>
    tx.insert(claimMessages).values({
      id,
      tenantId: KS_TENANT_ID,
      claimId: ks.claimId,
      senderId: ks.userId,
      content: 'escaped write',
    });

  // Every SQL-capable form an escaped transaction offers, captured inside the callback.
  const captureAll = (tx: TenantTransaction) => ({
    tx,
    builder: messages(tx),
    prepared: messages(tx).prepare('lifetime_prepared'),
    relational: tx.query.claimMessages.findMany({ where: eq(claimMessages.id, ks.messageId) }),
    execute: tx.execute.bind(tx),
  });
  const assertAllRevoked = async (kept: ReturnType<typeof captureAll>, label: string) => {
    await rejectsClosed(() => messages(kept.tx), `${label}: tx.select`);
    await rejectsClosed(() => kept.builder, `${label}: builder built before the end`);
    await rejectsClosed(() => kept.prepared.execute(), `${label}: prepared query`);
    await rejectsClosed(() => kept.relational, `${label}: relational query`);
    await rejectsClosed(() => kept.execute(GUCS), `${label}: extracted execute`);
    const id = marker(label);
    await rejectsClosed(() => insertMarker(kept.tx, id), `${label}: insert`);
    assert.equal(await adminMessage(id), undefined, `${label}: no escaped write landed`);
  };

  try {
    await t.test(
      'normal use: returned builders, awaited prepared queries and nesting work',
      async () => {
        const direct = await asTenant(KS_TENANT_ID, tx => messages(tx));
        const viaAll = await asTenant(KS_TENANT_ID, tx =>
          Promise.all([messages(tx), tx.execute(GUCS)])
        );
        const nested = await asTenant(KS_TENANT_ID, tx => tx.transaction(inner => messages(inner)));
        const prepared = await asTenant(KS_TENANT_ID, tx =>
          messages(tx).prepare('lifetime_ok').execute()
        );
        const expected = [{ id: ks.messageId }];
        assert.deepEqual(
          { direct, all: viaAll[0], nested, prepared },
          {
            direct: expected,
            all: expected,
            nested: expected,
            prepared: expected,
          }
        );
      }
    );

    await t.test('after commit every captured capability is revoked', async () => {
      let kept: ReturnType<typeof captureAll> | undefined;
      await asTenant(KS_TENANT_ID, async tx => {
        kept = captureAll(tx);
      });
      assert.ok(kept);
      await assertAllRevoked(kept, 'after commit');
    });

    await t.test('after rollback every captured capability is revoked', async () => {
      let kept: ReturnType<typeof captureAll> | undefined;
      const written = marker('rolled_back');
      await assert.rejects(
        asTenant(KS_TENANT_ID, async tx => {
          kept = captureAll(tx);
          await insertMarker(tx, written);
          throw new Error('deliberate rollback');
        }),
        /deliberate rollback/u
      );
      assert.ok(kept);
      await assertAllRevoked(kept, 'after rollback');
      assert.equal(await adminMessage(written), undefined, 'the rolled-back write is absent');
    });

    await t.test(
      'an escaped capability cannot act inside the next tenant on the same connection',
      async () => {
        let kept: ReturnType<typeof captureAll> | undefined;
        const [aPid] = await asTenant(KS_TENANT_ID, async tx => {
          kept = captureAll(tx);
          return tx.execute<{ pid: number }>(GUCS);
        });
        assert.ok(kept);
        const escaped = kept;
        const bView = await asTenant(MK_TENANT_ID, async tx => {
          const [before] = await tx.execute<{ pid: number; access: string }>(GUCS);
          await assertAllRevoked(escaped, 'during MK');
          const [after] = await tx.execute<{ pid: number; access: string }>(GUCS);
          return { before, after, rows: await messages(tx) };
        });
        assert.equal(bView.before?.pid, aPid?.pid, 'the one pooled connection was reused');
        assert.deepEqual(bView, {
          before: { pid: aPid?.pid, access: MK_TENANT_ID },
          after: { pid: aPid?.pid, access: MK_TENANT_ID },
          rows: [{ id: mk.messageId }],
        });
      }
    );

    await t.test('nested capabilities expire with their own callback', async () => {
      let child: TenantTransaction | undefined;
      const parentAfter = await asTenant(KS_TENANT_ID, async tx => {
        await tx.transaction(async inner => {
          child = inner as unknown as TenantTransaction;
          await messages(inner);
        });
        assert.ok(child);
        await rejectsClosed(() => messages(child as TenantTransaction), 'child after its callback');
        await assert.rejects(
          tx.transaction(async inner => {
            await messages(inner);
            throw new Error('child rollback');
          }),
          /child rollback/u
        );
        return messages(tx);
      });
      assert.deepEqual(parentAfter, [{ id: ks.messageId }], 'the parent survives a child rollback');
      await rejectsClosed(() => messages(child as TenantTransaction), 'child after the parent');
    });

    await t.test('a detached child cannot run after its parent returns', async () => {
      const release = deferred();
      let detached: Promise<unknown> | undefined;
      const id = marker('detached');
      await asTenant(KS_TENANT_ID, async tx => {
        detached = tx.transaction(async inner => {
          await release.promise;
          await insertMarker(inner, id);
        });
        void detached.catch(() => undefined);
        setTimeout(release.resolve, 20);
      });
      await rejectsClosed(() => detached as Promise<unknown>, 'detached child');
      assert.equal(await adminMessage(id), undefined, 'the detached write never landed');
    });

    // Pool of one: after A loses its connection, B runs on the same driver connection. A resumes
    // during B; had A's scope sent its COMMIT (A returns) or ROLLBACK (A throws), B's first write
    // would be committed early or discarded. B's own rollback and commit must stay intact.
    for (const late of ['returns', 'throws'] as const) {
      await t.test(`a lost transaction that resumes during the next one and ${late}`, async () => {
        const resumeA = deferred();
        let kept: TenantTransaction | undefined;
        const a = asTenant(KS_TENANT_ID, async tx => {
          kept = tx;
          const [row] = await tx.execute<{ pid: number }>(GUCS);
          await adminDb.execute(sql`select pg_terminate_backend(${row?.pid})`);
          await resumeA.promise;
          if (late === 'throws') throw new Error('late failure');
        });
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, fail) => {
          timer = setTimeout(() => fail(new Error('did not settle on connection loss')), 5_000);
        });
        try {
          await assert.rejects(
            Promise.race([a, timeout]),
            (error: unknown) => !/did not settle/u.test(String((error as Error).message))
          );
        } finally {
          clearTimeout(timer);
        }
        await rejectsClosed(() => messages(kept as TenantTransaction), 'A after connection loss');

        // A returning would COMMIT inside B, so B rolls back; A throwing would ROLLBACK, so B commits.
        const bRollsBack = late === 'returns';
        const [first, second] = [marker(`b1_${late}`), marker(`b2_${late}`)];
        const b = asTenant(KS_TENANT_ID, async tx => {
          await insertMarker(tx, first);
          resumeA.resolve();
          await new Promise(done => setTimeout(done, 50));
          await insertMarker(tx, second);
          const [gucs] = await tx.execute<{ access: string }>(GUCS);
          assert.equal(gucs?.access, KS_TENANT_ID, 'B still runs in its own transaction');
          if (bRollsBack) throw new Error('B rolls back');
        });
        if (bRollsBack) await assert.rejects(b, /B rolls back/u);
        else await b;
        const landed = [await adminMessage(first), await adminMessage(second)].map(Boolean);
        assert.deepEqual(landed, bRollsBack ? [false, false] : [true, true]);
      });
    }
  } finally {
    await session.close();
  }
});
