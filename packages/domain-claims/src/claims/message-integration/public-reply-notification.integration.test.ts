import { randomUUID } from 'node:crypto';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asActor } from './message-rls-actors.test-support';
import { expectRoleSend } from './message-rls-effects.test-support';
import {
  fixture,
  homeTenantId,
  ids,
  otherTenantId,
  registerMessageRlsFixture,
} from './tenant-context.integration-fixture';

const suite = process.env.MESSAGE_RLS_INTEGRATION === '1' ? describe : describe.skip;

suite('public reply notification under a restricted PostgreSQL login', () => {
  registerMessageRlsFixture();
  afterEach(async () => {
    const [row] = await fixture.rlsClient`
      select nullif(current_setting('app.current_tenant_id', true), '') as tenant,
        nullif(current_setting('app.current_access_tenant_id', true), '') as access,
        nullif(current_setting('app.user_role', true), '') as role
    `;
    expect(row).toEqual({ tenant: null, access: null, role: null });
  });

  const sendStaffReply = (label: string, options = {}) =>
    fixture.send({
      ...asActor(ids.staff, 'staff'),
      requestHeaders: new Headers(),
      claimId: ids.claim,
      content: `Synthetic reply ${label}`,
      ...options,
    });
  const notificationRows = (messageId: string) =>
    fixture.database.dbAdmin.query.notifications.findMany({
      where: eq(fixture.database.notifications.id, `ntf_new_message_${messageId}`),
    });
  const deliveries = (messageId: string) =>
    fixture.database.dbAdmin.query.notificationDeliveries.findMany({
      where: eq(fixture.database.notificationDeliveries.subjectMessageId, messageId),
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

  it('persists exactly one inbox and delivery row when a staff reply is replayed', async () => {
    const clientMessageId = randomUUID();
    const result = await sendStaffReply('notification', { clientMessageId });
    if (!result.success) throw new Error(result.error);
    expect(result.replayed).toBe(false);
    const messageId = result.message.id;
    expect(await notificationRows(messageId)).toEqual([
      expect.objectContaining({
        tenantId: homeTenantId,
        userId: ids.member,
        type: 'new_message',
        actionUrl: `/member/claims/${ids.claim}`,
      }),
    ]);
    expect(await sendStaffReply('notification', { clientMessageId })).toMatchObject({
      success: true,
      replayed: true,
      deliveryIds: [],
      message: { id: messageId },
    });
    expect(await notificationRows(messageId)).toHaveLength(1);
    expect(await deliveries(messageId)).toMatchObject([
      {
        id: result.deliveryIds[0],
        channel: 'email',
        kind: 'claim_message_to_member',
        recipientUserId: ids.member,
        facts: { previewRestricted: false },
      },
    ]);
  });

  it('never queues a member-facing notification for internal, member or foreign-tenant sends', async () => {
    const internal = await sendStaffReply('internal', { isInternal: true });
    if (!internal.success) throw new Error(internal.error);
    expect(await notificationRows(internal.message.id)).toEqual([]);
    expect(await deliveries(internal.message.id)).toEqual([]);
    const member = await sendStaffReply('member', asActor(ids.member, 'member'));
    if (!member.success) throw new Error(member.error);
    expect(await notificationRows(member.message.id)).toEqual([]);
    expect(await deliveries(member.message.id)).toMatchObject([
      {
        kind: 'staff_member_message',
        recipientUserId: ids.staff,
      },
    ]);
    expect(await sendStaffReply('foreign', asActor(ids.staff, 'staff', otherTenantId))).toEqual({
      success: false,
      error: 'Claim not found',
    });
  });

  it('admits a cross-home admin public reply and refuses their private note with zero effects', async () => {
    const { dbAdmin, user } = fixture.database;
    const id = ids.otherMember;
    await dbAdmin
      .update(user)
      .set({ tenantId: otherTenantId, role: 'admin' })
      .where(eq(user.id, id));
    try {
      const input = {
        session: {
          user: { id, role: 'admin', tenantId: otherTenantId, accessTenantId: homeTenantId },
        },
        authority: mintTestTenantAuthority(homeTenantId, { userId: id, role: 'admin' }),
        claimId: ids.claim,
        requestHeaders: new Headers(),
        content: 'Synthetic cross-home reply',
      };
      await expectRoleSend({ ...input, isInternal: true }, false);
      await expectRoleSend(input, true);
    } finally {
      await dbAdmin
        .update(user)
        .set({ tenantId: homeTenantId, role: 'member' })
        .where(eq(user.id, id));
    }
  });

  it('rolls the message back when database permission prevents its inbox insert', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await fixture.setNotificationInsertAllowed(false);
    try {
      expect(await sendStaffReply('notification failure')).toEqual({
        success: false,
        error: 'Failed to send message',
      });
      expect(errors).toHaveBeenCalledWith(
        'Error sending message:',
        expect.objectContaining({
          cause: expect.objectContaining({ code: '42501' }),
        })
      );
      expect(
        await fixture.database.dbAdmin.query.claimMessages.findFirst({
          where: eq(fixture.database.claimMessages.content, 'Synthetic reply notification failure'),
        })
      ).toBeUndefined();
    } finally {
      await fixture.setNotificationInsertAllowed(true);
      errors.mockRestore();
    }
  });

  it('queues only the current recipient’s scoped subscriptions and honors a disabled preference', async () => {
    const { dbAdmin, pushSubscriptions, userNotificationPreferences } = fixture.database;
    const rows = [
      { id: 'own-a', tenantId: homeTenantId, userId: ids.member },
      { id: 'own-b', tenantId: homeTenantId, userId: ids.member },
      { id: 'other-tenant', tenantId: otherTenantId, userId: ids.member },
      { id: 'other-user', tenantId: homeTenantId, userId: ids.otherMember },
    ].map(row => ({
      ...row,
      id: `${ids.claim}_${row.id}`,
      endpoint: `https://push.example.test/${ids.claim}/${row.id}`,
      p256dh: 'synthetic-key',
      auth: 'synthetic-auth',
      updatedAt: new Date(),
    }));
    await dbAdmin.insert(pushSubscriptions).values(rows);
    const result = await sendStaffReply('subscriptions');
    if (!result.success) throw new Error(result.error);
    expect(
      (await deliveries(result.message.id))
        .flatMap(row => row.pushSubscriptionId ?? [])
        .sort((a, b) => a.localeCompare(b))
    ).toEqual(
      rows
        .slice(0, 2)
        .map(row => row.id)
        .sort((a, b) => a.localeCompare(b))
    );
    await dbAdmin.insert(userNotificationPreferences).values({
      id: `${ids.claim}_prefs`,
      tenantId: homeTenantId,
      userId: ids.member,
      pushMessages: false,
      updatedAt: new Date(),
    });
    const disabled = await sendStaffReply('subscriptions disabled');
    if (!disabled.success) throw new Error(disabled.error);
    expect(await deliveries(disabled.message.id)).toMatchObject([{ channel: 'email' }]);
    await dbAdmin.delete(pushSubscriptions).where(
      inArray(
        pushSubscriptions.id,
        rows.map(row => row.id)
      )
    );
  });
});
