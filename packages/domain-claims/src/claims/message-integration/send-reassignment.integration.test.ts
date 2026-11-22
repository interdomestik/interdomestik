import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';
import type { TenantTransaction } from '@interdomestik/database';
import { fixture, ids } from './tenant-context.integration-fixture';
import {
  describeKeyedMessageRls,
  memberSend,
  OVERLAPPED,
  storeMessage,
  waitForBlockedSend,
} from './send-idempotency.test-support';

async function staffDeliveryRecipient(messageId: string) {
  const { dbAdmin, notificationDeliveries } = fixture.database;
  const [delivery] = await dbAdmin
    .select({ recipient: notificationDeliveries.recipientUserId })
    .from(notificationDeliveries)
    .where(eq(notificationDeliveries.subjectMessageId, messageId));
  return delivery?.recipient;
}

describeKeyedMessageRls('claim reassignment during a real restricted message send', () => {
  it('routes the message to the assignee that commits before the message acquires the claim lock', async () => {
    const { claims, dbAdmin, user } = fixture.database;
    await dbAdmin.update(user).set({ role: 'staff' }).where(eq(user.id, ids.otherMember));
    let message: ReturnType<typeof memberSend> | undefined;
    try {
      await dbAdmin.transaction(async tx => {
        await tx.update(claims).set({ staffId: ids.otherMember }).where(eq(claims.id, ids.claim));
        message = memberSend(OVERLAPPED, randomUUID());
        await waitForBlockedSend(tx as unknown as TenantTransaction);
      });
      const result = await message;
      expect(result).toMatchObject({ success: true, replayed: false });
      if (!result?.success) throw new Error('Member request failed');
      expect(await staffDeliveryRecipient(result.message.id)).toBe(ids.otherMember);
    } finally {
      await message;
      await dbAdmin.update(claims).set({ staffId: ids.staff }).where(eq(claims.id, ids.claim));
      await dbAdmin.update(user).set({ role: 'member' }).where(eq(user.id, ids.otherMember));
    }
  }, 10_000);

  it('holds reassignment behind a member message until its original recipient is committed', async () => {
    const { claims, dbAdmin, sql, user } = fixture.database;
    await dbAdmin.update(user).set({ role: 'staff' }).where(eq(user.id, ids.otherMember));
    const store = storeMessage.storeClaimMessage;
    let saveXid!: (id: string) => void;
    let commitMessage!: () => void;
    const holding = new Promise<string>(resolve => {
      saveXid = resolve;
    });
    const release = new Promise<void>(resolve => {
      commitMessage = resolve;
    });
    const pause = vi
      .spyOn(storeMessage, 'storeClaimMessage')
      .mockImplementationOnce(async (tx, values, key) => {
        const [row] = await tx.execute<{ xid: string }>(
          sql`select pg_current_xact_id()::text as xid`
        );
        saveXid(row.xid);
        await release;
        return store(tx, values, key);
      });
    const message = memberSend(OVERLAPPED, randomUUID());
    let assign: Promise<void> | undefined;
    try {
      const xid = await Promise.race([
        holding,
        message.then(() => {
          throw new Error('Message never acquired the lock');
        }),
      ]);
      assign = dbAdmin.transaction(async tx => {
        await tx.update(claims).set({ staffId: ids.otherMember }).where(eq(claims.id, ids.claim));
      });
      for (let attempt = 0; attempt < 100; attempt++) {
        const [row] = await fixture.rlsClient`
          select count(*)::int as waiting from pg_locks
          where locktype='transactionid' and not granted and transactionid=${xid}::xid
        `;
        if (row.waiting === 1) break;
        if (attempt === 99) throw new Error('Reassignment never waited for the locked message');
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      commitMessage();
      const result = await message;
      if (!result.success) throw new Error(result.error);
      expect(await staffDeliveryRecipient(result.message.id)).toBe(ids.staff);
      await assign;
    } finally {
      commitMessage();
      await Promise.allSettled([message, assign]);
      pause.mockRestore();
      await dbAdmin.update(claims).set({ staffId: ids.staff }).where(eq(claims.id, ids.claim));
      await dbAdmin.update(user).set({ role: 'member' }).where(eq(user.id, ids.otherMember));
    }
  }, 10_000);
});
