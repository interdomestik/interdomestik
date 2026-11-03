import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { TenantTransaction } from '@interdomestik/database';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { keyedMessageId, MESSAGE_KEY_CONFLICT_ERROR } from './store-message';
import {
  fixture,
  homeTenantId,
  ids,
  registerMessageRlsFixture,
  session,
} from './tenant-context.integration-fixture';

const suite = process.env.MESSAGE_RLS_INTEGRATION === '1' ? describe : describe.skip;
const OVERLAPPED = 'Synthetic overlapped reply';

const memberSend = (content: string, clientMessageId: string) =>
  fixture.send({
    session: session(ids.member, 'member'),
    authority: mintTestTenantAuthority(homeTenantId, { userId: ids.member, role: 'member' }),
    requestHeaders: new Headers(),
    claimId: ids.claim,
    content,
    clientMessageId,
  });

async function storedWithKey(clientMessageId: string) {
  const { claimMessages, dbAdmin } = fixture.database;
  return dbAdmin
    .select({ id: claimMessages.id, content: claimMessages.content })
    .from(claimMessages)
    .where(eq(claimMessages.id, keyedMessageId(homeTenantId, ids.member, clientMessageId)));
}

/** Resolves once another session waits on this transaction's uncommitted row. */
async function waitForBlockedSend(tx: TenantTransaction, attemptsLeft = 200): Promise<void> {
  // pg_stat_activity is snapshotted per transaction; pg_locks is read fresh on every call.
  const [row] = await tx.execute(fixture.database.sql`
    select count(*)::int as waiting from pg_locks
    where locktype = 'transactionid' and not granted and transactionid = pg_current_xact_id()::xid
  `);
  if (Number(row?.waiting) > 0) return;
  if (attemptsLeft === 0) throw new Error('The keyed send never waited on the open insert');
  await new Promise(resolve => setTimeout(resolve, 25));
  return waitForBlockedSend(tx, attemptsLeft - 1);
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
      error: MESSAGE_KEY_CONFLICT_ERROR,
    });
    expect(await storedWithKey(clientMessageId)).toEqual([
      {
        id: keyedMessageId(homeTenantId, ids.member, clientMessageId),
        content: 'Synthetic first draft',
      },
    ]);
  });
});
