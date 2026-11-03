import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
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

suite('keyed message send on a real NOBYPASSRLS connection', () => {
  registerMessageRlsFixture();

  it('stores concurrent sends of one key once and replays the stored message', async () => {
    const clientMessageId = randomUUID();

    const results = await Promise.all([
      memberSend('Synthetic retried reply', clientMessageId),
      memberSend('Synthetic retried reply', clientMessageId),
    ]);

    const sent = results.map(result => {
      if (!result.success) throw new Error(result.error);
      return result;
    });
    expect(sent.map(result => result.replayed).sort()).toEqual([false, true]);
    expect(sent[0]?.message.id).toBe(sent[1]?.message.id);
    expect(await storedWithKey(clientMessageId)).toEqual([
      { id: sent[0]?.message.id, content: 'Synthetic retried reply' },
    ]);
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
