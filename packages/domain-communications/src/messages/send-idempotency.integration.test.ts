import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { TenantTransaction } from '@interdomestik/database';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import {
  fixture,
  homeTenantId,
  ids,
  otherTenantId,
  registerMessageRlsFixture,
  session,
} from './tenant-context.integration-fixture';
import { asActor } from './message-rls-actors.test-support';
import { expectMessageContextCleared, messageEffects } from './message-rls-effects.test-support';

const suite = process.env.MESSAGE_RLS_INTEGRATION === '1' ? describe : describe.skip;
const OVERLAPPED = 'Synthetic overlapped reply';
// Loaded after the fixture installs the restricted client: a top-level import would bind the
// database module to the administrative URL first, and its RLS role assertion refuses that.
let storeMessage: typeof import('./store-message');
const keyedMessageId = (...args: Parameters<(typeof storeMessage)['keyedMessageId']>) =>
  storeMessage.keyedMessageId(...args);

const memberSend = (content: string, clientMessageId: string, logAuditEvent = vi.fn()) =>
  fixture.send({
    session: session(ids.member, 'member'),
    authority: mintTestTenantAuthority(homeTenantId, { userId: ids.member, role: 'member' }),
    requestHeaders: new Headers(),
    claimId: ids.claim,
    content,
    clientMessageId,
    deps: { logAuditEvent },
  });

async function storedWithKey(clientMessageId: string) {
  const { claimMessages, dbAdmin } = fixture.database;
  return dbAdmin
    .select({ id: claimMessages.id, content: claimMessages.content })
    .from(claimMessages)
    .where(eq(claimMessages.id, keyedMessageId(homeTenantId, ids.member, clientMessageId)));
}

/** Observe actual lock waiters; reaching the deadline is a failure, never a timing-based pass. */
async function waitForBlockedSend(
  tx: TenantTransaction,
  kind: 'key' | 'table' = 'key',
  attemptsLeft = 200
): Promise<void> {
  // Refresh pg_stat_activity so sessions connected after the first poll remain observable.
  const { sql } = fixture.database;
  await tx.execute(sql`select pg_stat_clear_snapshot()`);
  const locks =
    kind === 'key'
      ? sql`
    select count(*)::int as waiting from pg_locks
    where locktype = 'transactionid' and not granted and transactionid = pg_current_xact_id()::xid
  `
      : sql`
    select count(*)::int as waiting from pg_locks l join pg_stat_activity a on a.pid=l.pid
    where l.relation='claim_messages'::regclass and l.mode='RowExclusiveLock'
      and not l.granted and a.usename=${fixture.roleName}
  `;
  const [row] = await tx.execute(locks);
  if (Number(row?.waiting) >= (kind === 'table' ? 2 : 1)) return;
  if (attemptsLeft === 0) throw new Error('The keyed send never waited on the open insert');
  await new Promise(resolve => setTimeout(resolve, 25));
  return waitForBlockedSend(tx, kind, attemptsLeft - 1);
}

/**
 * Holds an uncommitted row under the derived id on a second (administrative) session, proves the
 * real restricted send blocks on it, then commits or rolls that row back.
 */
async function sendAgainstOpenInsert(outcome: 'commit' | 'rollback', clientMessageId: string) {
  const { claimMessages, dbAdmin } = fixture.database;
  const rolledBack = new Error('Synthetic competing send rolled back');
  let blockedSend: ReturnType<typeof memberSend> | undefined;
  const competing = dbAdmin.transaction(async tx => {
    await tx.insert(claimMessages).values({
      id: keyedMessageId(homeTenantId, ids.member, clientMessageId),
      tenantId: homeTenantId,
      claimId: ids.claim,
      senderId: ids.member,
      content: OVERLAPPED,
      isInternal: false,
    });
    blockedSend = memberSend(OVERLAPPED, clientMessageId);
    await waitForBlockedSend(tx as unknown as TenantTransaction);
    if (outcome === 'rollback') throw rolledBack;
  });
  if (outcome === 'rollback') await expect(competing).rejects.toBe(rolledBack);
  else await competing;
  if (!blockedSend) throw new Error('The keyed send never started');
  return blockedSend;
}

suite('keyed message send on a real NOBYPASSRLS connection', () => {
  registerMessageRlsFixture();
  beforeAll(async () => {
    storeMessage = await import('./store-message');
  });

  it('admits two actual sends to the insert together, stores once and audits only the winner', async () => {
    const clientMessageId = randomUUID();
    const audit = vi.fn();
    let sends: Promise<Awaited<ReturnType<typeof memberSend>>[]> | undefined;
    const held = fixture.database.dbAdmin.transaction(async tx => {
      await tx.execute(fixture.database.sql`lock table claim_messages in share mode`);
      // Both restricted sessions must reach their INSERT before the test releases the table.
      sends = Promise.all([
        memberSend(OVERLAPPED, clientMessageId, audit),
        memberSend(OVERLAPPED, clientMessageId, audit),
      ]);
      await waitForBlockedSend(tx as unknown as TenantTransaction, 'table');
    });
    try {
      await held;
      if (!sends) throw new Error('The two sends never started');
      const results = await sends;
      expect(results.every(result => result.success)).toBe(true);
      expect(results.filter(result => result.success && !result.replayed)).toHaveLength(1);
      expect(results.filter(result => result.success && result.replayed)).toHaveLength(1);
      expect(await storedWithKey(clientMessageId)).toEqual([
        { id: keyedMessageId(homeTenantId, ids.member, clientMessageId), content: OVERLAPPED },
      ]);
      expect(audit).toHaveBeenCalledTimes(1);
    } finally {
      await sends;
    }
  }, 15_000);

  it('rolls back a failing SQL write and permits a clean same-key retry', async () => {
    const clientMessageId = randomUUID();
    const audit = vi.fn();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    let insertObserved = false;
    let failureCode: string | undefined;
    const before = await messageEffects();
    const store = storeMessage.storeClaimMessage;
    const failedStore = vi
      .spyOn(storeMessage, 'storeClaimMessage')
      .mockImplementationOnce(async (tx, values, key) => {
        const result = await store(tx, values, key);
        expect(result).toMatchObject({ success: true, replayed: false });
        const { claimMessages } = fixture.database;
        const inserted = await tx
          .select({ id: claimMessages.id })
          .from(claimMessages)
          .where(eq(claimMessages.id, keyedMessageId(homeTenantId, ids.member, clientMessageId)));
        expect(inserted).toHaveLength(1);
        insertObserved = true;
        // A second actual INSERT with the same primary key aborts the tenant transaction.
        const failed = await tx
          .insert(claimMessages)
          .values({
            id: inserted[0].id,
            tenantId: homeTenantId,
            claimId: ids.claim,
            senderId: ids.member,
            content: 'Duplicate SQL write',
            isInternal: false,
          })
          .then(
            () => null,
            (error: unknown) => error as { code?: string; cause?: { code?: string } }
          );
        failureCode = failed?.cause?.code ?? failed?.code;
        throw failed;
      });
    try {
      expect(await memberSend(OVERLAPPED, clientMessageId, audit)).toEqual({
        success: false,
        error: 'Failed to send message',
      });
      expect(logged).toHaveBeenCalled();
      expect(failedStore).toHaveBeenCalledTimes(1);
      expect(insertObserved).toBe(true);
      expect(failureCode).toBe('23505');
      expect(await storedWithKey(clientMessageId)).toEqual([]);
      expect(audit).not.toHaveBeenCalled();
      expect(await messageEffects()).toEqual(before);
      await expectMessageContextCleared();
      expect(
        await fixture.get({
          ...asActor(ids.member, 'member', otherTenantId),
          claimId: ids.claim,
        })
      ).toEqual({ success: false, error: 'Claim not found' });
      await expectMessageContextCleared();
    } finally {
      failedStore.mockRestore();
      logged.mockRestore();
    }
    expect(await memberSend(OVERLAPPED, clientMessageId, audit)).toMatchObject({
      success: true,
      replayed: false,
    });
    expect(await storedWithKey(clientMessageId)).toHaveLength(1);
    expect(audit).toHaveBeenCalledTimes(1);
    await expectMessageContextCleared();
  });

  it('replays the committed row when a same-key send waited on it', async () => {
    const clientMessageId = randomUUID();

    const result = await sendAgainstOpenInsert('commit', clientMessageId);

    const id = keyedMessageId(homeTenantId, ids.member, clientMessageId);
    expect(result).toMatchObject({ success: true, replayed: true, message: { id } });
    expect(await storedWithKey(clientMessageId)).toEqual([{ id, content: OVERLAPPED }]);
  });

  it('stores the waiting send itself when the competing insert rolls back', async () => {
    const clientMessageId = randomUUID();

    const result = await sendAgainstOpenInsert('rollback', clientMessageId);

    const id = keyedMessageId(homeTenantId, ids.member, clientMessageId);
    expect(result).toMatchObject({ success: true, replayed: false, message: { id } });
    expect(await storedWithKey(clientMessageId)).toEqual([{ id, content: OVERLAPPED }]);
  });

  it('fails closed when a stored key is resent with different content', async () => {
    const clientMessageId = randomUUID();
    expect(await memberSend('Synthetic first draft', clientMessageId)).toMatchObject({
      success: true,
      replayed: false,
    });

    expect(await memberSend('Synthetic edited draft', clientMessageId)).toEqual({
      success: false,
      error: storeMessage.MESSAGE_KEY_CONFLICT_ERROR,
    });
    expect(await storedWithKey(clientMessageId)).toEqual([
      {
        id: keyedMessageId(homeTenantId, ids.member, clientMessageId),
        content: 'Synthetic first draft',
      },
    ]);
  });
});
