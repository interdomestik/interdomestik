import { describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  assertSyntheticMessageDatabaseUrl,
  database,
  get,
  markRead,
  send,
  rlsClient,
  ids,
  homeTenantId,
  otherTenantId,
  session,
  registerMessageRlsFixture,
} from './tenant-context.integration-fixture';
const suite = process.env.MESSAGE_RLS_INTEGRATION === '1' ? describe : describe.skip;

describe('message fixture database safety', () => {
  it('accepts the synthetic CI and task ports without a machine-specific port constraint', () => {
    expect(() =>
      assertSyntheticMessageDatabaseUrl('postgresql://test:test@127.0.0.1:5432/interdomestik_test')
    ).not.toThrow();
    expect(() =>
      assertSyntheticMessageDatabaseUrl('postgresql://test:test@localhost:55435/interdomestik_test')
    ).not.toThrow();
  });
  it('rejects remote and non-synthetic databases before creating clients or fixtures', () => {
    expect(() =>
      assertSyntheticMessageDatabaseUrl(
        'postgresql://test:test@db.example.test:5432/interdomestik_test'
      )
    ).toThrow();
    expect(() =>
      assertSyntheticMessageDatabaseUrl('postgresql://test:test@127.0.0.1:5432/production')
    ).toThrow();
  });
  it('rejects connection-string options that could redirect the approved target', () => {
    expect(() =>
      assertSyntheticMessageDatabaseUrl(
        'postgresql://test:test@127.0.0.1:5432/interdomestik_test?host=db.example.test'
      )
    ).toThrow();
    expect(() =>
      assertSyntheticMessageDatabaseUrl(
        'postgresql://test:test@127.0.0.1:5432/interdomestik_test?options=unsafe'
      )
    ).toThrow();
  });
});

suite('message operations on a real NOBYPASSRLS connection', () => {
  registerMessageRlsFixture();
  it('loads the owned public thread and sender projection across repeated reads', async () => {
    const [unscoped] =
      await rlsClient`select count(*)::int as count from claim where id=${ids.claim}`;
    expect(unscoped.count).toBe(0);
    for (let read = 0; read < 2; read++) {
      const result = await get({ session: session(ids.member, 'member'), claimId: ids.claim });
      expect(result.success).toBe(true);
      expect(result.messages?.map(message => message.id)).toEqual([ids.public]);
      expect(result.messages?.[0].sender).toMatchObject({
        id: ids.staff,
        name: 'Synthetic Staff Sender',
        role: 'staff',
      });
    }
    const [context] =
      await rlsClient`select current_setting('app.current_tenant_id',true) as tenant`;
    expect(context.tenant || null).toBeNull();
  });

  it('preserves member/tenant denial, staff assignment and linked-agent visibility', async () => {
    expect(
      await get({ session: session(ids.otherMember, 'member'), claimId: ids.claim })
    ).toMatchObject({ success: false });
    expect(
      await get({ session: session(ids.member, 'member', otherTenantId), claimId: ids.claim })
    ).toMatchObject({ success: false });
    expect(
      await get({ session: session(ids.otherMember, 'staff'), claimId: ids.claim })
    ).toMatchObject({ success: false });
    const staff = await get({ session: session(ids.staff, 'staff'), claimId: ids.claim });
    expect(staff.messages?.map(message => message.id)).toEqual(
      expect.arrayContaining([ids.public, ids.internal])
    );
    const agent = await get({ session: session(ids.agent, 'agent'), claimId: ids.claim });
    expect(agent.messages?.map(message => message.id)).toEqual([ids.public]);
  });

  it('persists visible recipient receipts while rejecting internal/own/out-of-scope mutations', async () => {
    await markRead({ session: session(ids.otherMember, 'member'), messageIds: [ids.public] });
    expect(
      (
        await database.dbAdmin.query.claimMessages.findFirst({
          where: eq(database.claimMessages.id, ids.public),
        })
      )?.readAt
    ).toBeNull();
    expect(
      await markRead({
        session: session(ids.member, 'member'),
        messageIds: [ids.public, ids.internal],
      })
    ).toEqual({ success: true });
    expect(
      (
        await database.dbAdmin.query.claimMessages.findFirst({
          where: eq(database.claimMessages.id, ids.public),
        })
      )?.readAt
    ).toBeInstanceOf(Date);
    expect(
      (
        await database.dbAdmin.query.claimMessages.findFirst({
          where: eq(database.claimMessages.id, ids.internal),
        })
      )?.readAt
    ).toBeNull();
  });

  it('sends a persisted public message with the same transaction and denies member internal send', async () => {
    const result = await send({
      session: session(ids.member, 'member'),
      requestHeaders: new Headers(),
      claimId: ids.claim,
      content: 'Synthetic member reply',
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(result.error);
    expect(result.message).toMatchObject({
      content: 'Synthetic member reply',
      senderId: ids.member,
      isInternal: false,
    });
    const reread = await get({ session: session(ids.staff, 'staff'), claimId: ids.claim });
    expect(reread.messages?.map(message => message.id)).toContain(result.message.id);
    await markRead({ session: session(ids.member, 'member'), messageIds: [result.message.id] });
    expect(
      (
        await database.dbAdmin.query.claimMessages.findFirst({
          where: eq(database.claimMessages.id, result.message.id),
        })
      )?.readAt
    ).toBeNull();
    expect(
      await send({
        session: session(ids.member, 'member'),
        requestHeaders: new Headers(),
        claimId: ids.claim,
        content: 'Forbidden private note',
        isInternal: true,
      })
    ).toMatchObject({ success: false });
  });
  it('rolls back the insert when the created-message projection is unavailable', async () => {
    const normalize = await import('./normalize');
    const projection = vi.spyOn(normalize, 'normalizeSelectedMessages').mockReturnValueOnce([]);
    try {
      expect(
        await send({
          session: session(ids.member, 'member'),
          requestHeaders: new Headers(),
          claimId: ids.claim,
          content: 'Projection failure rollback',
        })
      ).toMatchObject({ success: false });
      const persisted = await database.dbAdmin.query.claimMessages.findMany({
        where: eq(database.claimMessages.claimId, ids.claim),
      });
      expect(persisted.some(message => message.content === 'Projection failure rollback')).toBe(
        false
      );
    } finally {
      projection.mockRestore();
    }
  });

  it('keeps the existing error response after a post-commit audit failure without holding the transaction', async () => {
    const result = await send({
      session: session(ids.member, 'member'),
      requestHeaders: new Headers(),
      claimId: ids.claim,
      content: 'Committed before audit failure',
      deps: {
        logAuditEvent: async () => {
          const rows = await database.withTenantContext(
            { tenantId: homeTenantId, role: 'member' },
            tx =>
              tx.query.claimMessages.findMany({
                where: eq(database.claimMessages.claimId, ids.claim),
              })
          );
          expect(rows.some(message => message.content === 'Committed before audit failure')).toBe(
            true
          );
          throw new Error('Synthetic audit failure');
        },
      },
    });
    expect(result).toMatchObject({ success: false, error: 'Failed to send message' });
    const persisted = await database.dbAdmin.query.claimMessages.findMany({
      where: eq(database.claimMessages.claimId, ids.claim),
    });
    expect(
      persisted.filter(message => message.content === 'Committed before audit failure')
    ).toHaveLength(1);
  });
});
