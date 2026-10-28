import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import {
  fixture,
  homeTenantId,
  otherTenantId,
  ids,
  session,
  registerMessageRlsFixture,
} from './tenant-context.integration-fixture';
import type * as Replies from './public-reply-notification';

const suite = process.env.MESSAGE_RLS_INTEGRATION === '1' ? describe : describe.skip;

suite('S8 public reply under an actual restricted LOGIN', () => {
  registerMessageRlsFixture();
  let reply: typeof Replies;
  beforeAll(async () => {
    reply = await import('./public-reply-notification');
  });
  afterEach(async () => {
    const [row] = await fixture.rlsClient`
      select nullif(current_setting('app.current_tenant_id', true), '') as tenant,
        nullif(current_setting('app.current_access_tenant_id', true), '') as access,
        nullif(current_setting('app.user_role', true), '') as role
    `;
    expect(row).toEqual({ tenant: null, access: null, role: null });
  });
  async function sendStaffReply(label: string) {
    const result = await fixture.send({
      session: session(ids.staff, 'staff'),
      requestHeaders: new Headers(),
      claimId: ids.claim,
      content: `Synthetic S8 ${label}`,
    });
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('Actual staff reply did not persist');
    return {
      session: session(ids.staff, 'staff'),
      claimId: ids.claim,
      messageId: result.message.id,
      expectedRecipientId: ids.member,
    };
  }
  const notificationRows = (messageId: string) =>
    fixture.database.dbAdmin.query.notifications.findMany({
      where: eq(fixture.database.notifications.id, `ntf_new_message_${messageId}`),
    });

  it('keeps session and effective identities restricted, nonowning and without memberships', async () => {
    const [row] = await fixture.rlsClient`
      select session_user as "sessionUser", current_user as "currentUser",
        s.rolsuper as "sessionSuper", s.rolbypassrls as "sessionBypass",
        c.rolsuper as "currentSuper", c.rolbypassrls as "currentBypass",
        (select count(*)::int from pg_class where relnamespace='public'::regnamespace
          and relowner in (s.oid,c.oid)) as owned,
        (select count(*)::int from pg_auth_members where member in (s.oid,c.oid)) as memberships
      from pg_roles s, pg_roles c where s.rolname=session_user and c.rolname=current_user
    `;
    expect(row).toEqual({
      sessionUser: fixture.roleName,
      currentUser: fixture.roleName,
      sessionSuper: false,
      sessionBypass: false,
      currentSuper: false,
      currentBypass: false,
      owned: 0,
      memberships: 0,
    });
  });

  it('persists one recipient notification and an immutable data-only delivery plan', async () => {
    const params = await sendStaffReply('notification');
    const result = await reply.preparePublicReplyNotification(params);
    expect(result.status).toBe('created');
    if (result.status !== 'created') throw new Error('Missing actual notification');
    expect(result.plan).toMatchObject({
      tenantId: homeTenantId,
      recipientId: ids.member,
      notificationId: `ntf_new_message_${params.messageId}`,
    });
    expect(Object.isFrozen(result.plan)).toBe(true);
    expect(Object.isFrozen(result.plan.actor)).toBe(true);
    expect(Object.isFrozen(result.plan.claim)).toBe(true);
    expect(Object.isFrozen(result.plan.pushSubscriptions)).toBe(true);
    expect(await notificationRows(params.messageId)).toEqual([
      expect.objectContaining({
        tenantId: homeTenantId,
        userId: ids.member,
        type: 'new_message',
        actionUrl: `/member/claims/${ids.claim}`,
      }),
    ]);
    expect(await reply.preparePublicReplyNotification(params)).toEqual({
      status: 'skipped',
      reason: 'duplicate',
    });
    expect(await notificationRows(params.messageId)).toHaveLength(1);
  });

  it('deduplicates simultaneous actual preparation calls on two restricted database sessions', async () => {
    const params = await sendStaffReply('concurrent notification');
    const results = await fixture.concurrentReplies(params);
    expect(results.map(value => value.status).sort()).toEqual(['created', 'skipped']);
    expect(results.find(value => value.status === 'skipped')?.reason).toBe('duplicate');
    expect(new Set(results.map(value => value.pid)).size).toBe(2);
    for (const result of results)
      expect(result).toMatchObject({
        sessionUser: fixture.roleName,
        currentUser: fixture.roleName,
        sessionSuper: false,
        sessionBypass: false,
        currentSuper: false,
        currentBypass: false,
      });
    expect(await notificationRows(params.messageId)).toHaveLength(1);
  }, 60_000);

  it('rejects mismatched recipient, message visibility, sender and tenant without notification writes', async () => {
    const params = await sendStaffReply('denial controls');
    expect(
      await reply.preparePublicReplyNotification({
        ...params,
        expectedRecipientId: ids.otherMember,
      })
    ).toEqual({ status: 'skipped', reason: 'recipient_mismatch' });
    expect(
      await reply.preparePublicReplyNotification({ ...params, messageId: ids.internal })
    ).toEqual({ status: 'skipped', reason: 'message_mismatch' });
    const member = await fixture.send({
      session: session(ids.member, 'member'),
      requestHeaders: new Headers(),
      claimId: ids.claim,
      content: 'Synthetic member cannot impersonate staff reply',
    });
    if (!member.success) throw new Error('Missing member control message');
    expect(
      await reply.preparePublicReplyNotification({ ...params, messageId: member.message.id })
    ).toEqual({ status: 'skipped', reason: 'message_mismatch' });
    expect(
      await reply.preparePublicReplyNotification({
        ...params,
        session: session(ids.staff, 'staff', otherTenantId),
      })
    ).toEqual({ status: 'skipped', reason: 'claim_not_found' });
    for (const role of ['member', 'agent', 'branch_manager']) {
      expect(
        await reply.preparePublicReplyNotification({ ...params, session: session(ids.staff, role) })
      ).toEqual({ status: 'skipped', reason: 'not_staff' });
    }
    expect(await notificationRows(params.messageId)).toEqual([]);
    expect(await notificationRows(member.message.id)).toEqual([]);
  });

  it('rolls back a denied notification insert while preserving its already committed message', async () => {
    const params = await sendStaffReply('notification failure');
    await fixture.setNotificationInsertAllowed(false);
    try {
      const [acl] = await fixture.rlsClient`
        select has_table_privilege(current_user,'public.notifications','SELECT') as read,
          has_table_privilege(current_user,'public.notifications','INSERT') as write
      `;
      expect(acl).toEqual({ read: true, write: false });
      const denied = await reply.preparePublicReplyNotification(params).then(
        () => null,
        (error: unknown) => error as { code?: string; cause?: { code?: string } }
      );
      expect(denied?.cause?.code ?? denied?.code).toBe('42501');
      expect(await notificationRows(params.messageId)).toEqual([]);
      expect(
        await fixture.database.dbAdmin.query.claimMessages.findFirst({
          where: eq(fixture.database.claimMessages.id, params.messageId),
        })
      ).toMatchObject({ id: params.messageId, content: 'Synthetic S8 notification failure' });
    } finally {
      await fixture.setNotificationInsertAllowed(true);
    }
  });

  it('isolates subscription reads and expired endpoint cleanup by recipient, tenant and admitted endpoints', async () => {
    const params = await sendStaffReply('push isolation');
    const prepared = await reply.preparePublicReplyNotification(params);
    if (prepared.status !== 'created') throw new Error('Missing push preparation plan');
    const endpoint = (name: string) => `https://push.example.test/${ids.claim}/${name}`;
    const rows = [
      {
        id: `${ids.claim}_push_a`,
        tenantId: homeTenantId,
        userId: ids.member,
        endpoint: endpoint('a'),
      },
      {
        id: `${ids.claim}_push_b`,
        tenantId: homeTenantId,
        userId: ids.member,
        endpoint: endpoint('b'),
      },
      {
        id: `${ids.claim}_push_foreign`,
        tenantId: otherTenantId,
        userId: ids.member,
        endpoint: endpoint('foreign'),
      },
      {
        id: `${ids.claim}_push_other`,
        tenantId: homeTenantId,
        userId: ids.otherMember,
        endpoint: endpoint('other'),
      },
    ].map(row => ({
      ...row,
      p256dh: 'synthetic-key',
      auth: 'synthetic-auth',
      updatedAt: new Date(),
    }));
    await fixture.database.dbAdmin.insert(fixture.database.pushSubscriptions).values(rows);
    const subscriptions = await reply.loadPublicReplyPushSubscriptions(prepared.plan);
    expect(subscriptions.map(value => value.endpoint).sort()).toEqual([
      endpoint('a'),
      endpoint('b'),
    ]);
    const plan = Object.freeze({ ...prepared.plan, pushSubscriptions: subscriptions });
    await reply.removeExpiredPublicReplySubscriptions(plan, [
      endpoint('a'),
      endpoint('foreign'),
      endpoint('other'),
    ]);
    const persisted = await fixture.database.dbAdmin.query.pushSubscriptions.findMany({
      where: inArray(
        fixture.database.pushSubscriptions.endpoint,
        rows.map(row => row.endpoint)
      ),
    });
    expect(persisted.map(value => value.endpoint).sort()).toEqual(
      [endpoint('b'), endpoint('foreign'), endpoint('other')].sort()
    );
    await fixture.database.dbAdmin.insert(fixture.database.userNotificationPreferences).values({
      id: `${ids.claim}_prefs`,
      tenantId: homeTenantId,
      userId: ids.member,
      pushMessages: false,
      updatedAt: new Date(),
    });
    expect(await reply.loadPublicReplyPushSubscriptions(prepared.plan)).toEqual([]);
  });
});
