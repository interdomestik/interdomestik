import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import postgres from 'postgres';
import { eq, inArray } from 'drizzle-orm';
import type { Session } from '../types';

const enabled = process.env.MESSAGE_RLS_INTEGRATION === '1';
const suite = enabled ? describe : describe.skip;
const suffix = randomUUID();
const ids = {
  member: `message_member_${suffix}`,
  otherMember: `message_other_${suffix}`,
  staff: `message_staff_${suffix}`,
  agent: `message_agent_${suffix}`,
  claim: `message_claim_${suffix}`,
  link: `message_link_${suffix}`,
  public: `message_public_${suffix}`,
  internal: `message_internal_${suffix}`,
};
let database: typeof import('@interdomestik/database');
let get: (typeof import('./get'))['getMessagesForClaimCore'];
let markRead: (typeof import('./mark-read'))['markMessagesAsReadCore'];
let send: (typeof import('./send'))['sendMessageDbCore'];
let rlsClient: ReturnType<typeof postgres>;
let adminClient: ReturnType<typeof postgres>;
const session = (id: string, role: string, tenantId = 'tenant_ks') =>
  ({ user: { id, role, tenantId, branchId: null } }) as NonNullable<Session>;

suite('message operations on a real NOBYPASSRLS connection', () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('MESSAGE_RLS_INTEGRATION requires DATABASE_URL');
    const endpoint = new URL(process.env.DATABASE_URL);
    if (
      !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) ||
      endpoint.port !== '55435' ||
      endpoint.pathname !== '/interdomestik_test'
    ) {
      throw new Error('Message integration fixtures require the approved loopback synthetic DB');
    }
    // Use the preconfigured role, without changing its password, grants or policies.
    const role = process.env.DB_RLS_ROLE;
    if (!role || !/^[a-z_][a-z0-9_]*$/u.test(role))
      throw new Error('A safe existing DB_RLS_ROLE is required');
    rlsClient = postgres(process.env.DATABASE_URL, {
      max: 1,
      connection: { options: `-c role=${role}` },
    });
    adminClient = postgres(process.env.DATABASE_URL, { max: 1 });
    Object.assign(globalThis, { queryClientRls: rlsClient, queryClientAdmin: adminClient });
    database = await import('@interdomestik/database');
    ({ getMessagesForClaimCore: get } = await import('./get'));
    ({ markMessagesAsReadCore: markRead } = await import('./mark-read'));
    ({ sendMessageDbCore: send } = await import('./send'));
    const { assertRlsConnectionRoleReady } = await import('@interdomestik/database/db');
    await assertRlsConnectionRoleReady();
    const [posture] =
      await rlsClient`select rolsuper, rolbypassrls from pg_roles where rolname=current_user`;
    expect(posture).toEqual({ rolsuper: false, rolbypassrls: false });
    const now = new Date();
    await database.dbAdmin.insert(database.user).values(
      [
        [ids.member, 'member'],
        [ids.otherMember, 'member'],
        [ids.staff, 'staff'],
        [ids.agent, 'agent'],
      ].map(([id, role]) => ({
        id,
        role,
        tenantId: 'tenant_ks',
        email: `${id}@example.test`,
        emailVerified: true,
        name: role === 'staff' ? 'Synthetic Staff Sender' : 'Synthetic Member',
        createdAt: now,
        updatedAt: now,
      }))
    );
    await database.dbAdmin.insert(database.claims).values({
      id: ids.claim,
      userId: ids.member,
      tenantId: 'tenant_ks',
      staffId: ids.staff,
      category: 'retail',
      companyName: 'Synthetic Co',
      description: 'Isolated message tenant-context regression',
      origin: 'portal',
      title: 'Synthetic message case',
    });
    await database.dbAdmin.insert(database.agentClients).values({
      id: ids.link,
      tenantId: 'tenant_ks',
      agentId: ids.agent,
      memberId: ids.member,
      status: 'active',
    });
    await database.dbAdmin.insert(database.claimMessages).values([
      {
        id: ids.public,
        tenantId: 'tenant_ks',
        claimId: ids.claim,
        senderId: ids.staff,
        content: 'Public test update',
        isInternal: false,
      },
      {
        id: ids.internal,
        tenantId: 'tenant_ks',
        claimId: ids.claim,
        senderId: ids.staff,
        content: 'Private test note',
        isInternal: true,
      },
    ]);
  });

  afterAll(async () => {
    if (database) {
      await database.dbAdmin
        .delete(database.claimMessages)
        .where(eq(database.claimMessages.claimId, ids.claim));
      await database.dbAdmin
        .delete(database.agentClients)
        .where(eq(database.agentClients.id, ids.link));
      await database.dbAdmin.delete(database.claims).where(eq(database.claims.id, ids.claim));
      await database.dbAdmin
        .delete(database.user)
        .where(inArray(database.user.id, [ids.member, ids.otherMember, ids.staff, ids.agent]));
    }
    await Promise.all([rlsClient?.end({ timeout: 2 }), adminClient?.end({ timeout: 2 })]);
    delete (globalThis as { queryClientRls?: unknown }).queryClientRls;
    delete (globalThis as { queryClientAdmin?: unknown }).queryClientAdmin;
  });

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
      await get({ session: session(ids.member, 'member', 'tenant_mk'), claimId: ids.claim })
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
            { tenantId: 'tenant_ks', role: 'member' },
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
