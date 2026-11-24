import { ROLES } from '@interdomestik/shared-auth';
import { inArray } from 'drizzle-orm';
import { expect, vi } from 'vitest';
import { fixture, homeTenantId, ids, otherTenantId } from './tenant-context.integration-fixture';

/** Full rows include read_at: counts alone cannot detect a denied receipt update. */
export function messageEffects() {
  const {
    dbAdmin,
    claimMessages,
    auditLog,
    notifications,
    notificationDeliveries,
    claimResponseRequests,
  } = fixture.database;
  const tenants = [homeTenantId, otherTenantId];
  return Promise.all([
    dbAdmin
      .select()
      .from(claimMessages)
      .where(inArray(claimMessages.tenantId, tenants))
      .orderBy(claimMessages.id),
    dbAdmin.select().from(auditLog).where(inArray(auditLog.tenantId, tenants)).orderBy(auditLog.id),
    dbAdmin
      .select()
      .from(notifications)
      .where(inArray(notifications.tenantId, tenants))
      .orderBy(notifications.id),
    dbAdmin
      .select()
      .from(notificationDeliveries)
      .where(inArray(notificationDeliveries.tenantId, tenants))
      .orderBy(notificationDeliveries.id),
    dbAdmin
      .select()
      .from(claimResponseRequests)
      .where(inArray(claimResponseRequests.tenantId, tenants))
      .orderBy(claimResponseRequests.id),
  ]);
}

type MessageEffects = Awaited<ReturnType<typeof messageEffects>>;
const publicReplyRoles = new Set<string | null | undefined>([
  ROLES.staff,
  ROLES.admin,
  ROLES.tenant_admin,
  ROLES.super_admin,
]);

export async function expectRoleSend(
  params: Parameters<typeof fixture.send>[0],
  admitted: boolean,
  denial = 'Access denied'
): Promise<void> {
  const before = await messageEffects();
  const audit = vi.fn();
  const result = await fixture.send({ ...params, deps: { logAuditEvent: audit } });
  expect(result.success).toBe(admitted);
  expect(audit).toHaveBeenCalledTimes(Number(admitted));
  const after = await messageEffects();
  if (result.success) {
    expect(after[0].find(message => message.id === result.message.id)).toMatchObject({
      senderId: params.session?.user?.id,
      content: params.content,
      isInternal: params.isInternal ?? false,
    });
    expect(after[0].filter(message => message.id !== result.message.id)).toEqual(before[0]);
    const role = params.session?.user?.role;
    if (!params.isInternal && (role === 'member' || role === 'user')) {
      expect(after[3].filter(row => row.subjectMessageId === result.message.id)).toMatchObject([
        { kind: 'staff_member_message', recipientUserId: ids.staff },
      ]);
      expect(after[4].filter(row => row.sourceMessageId === result.message.id)).toMatchObject([
        { kind: 'member_message' },
      ]);
    } else if (!params.isInternal && publicReplyRoles.has(role)) {
      expect(after[3].filter(row => row.subjectMessageId === result.message.id)).toMatchObject([
        { kind: 'claim_message_to_member', recipientUserId: ids.member },
      ]);
    } else {
      expect(after.slice(1)).toEqual(before.slice(1));
    }
  } else {
    expect(result).toEqual({ success: false, error: denial });
    expect(after).toEqual(before);
  }
  await expectMessageContextCleared();
}

export function expectOnlyReceiptChanges(
  before: MessageEffects,
  after: MessageEffects,
  eligibleIds: readonly string[]
): void {
  const messages = before[0].map(message => ({
    ...message,
    readAt: eligibleIds.includes(message.id) ? expect.any(Date) : message.readAt,
  }));
  expect(after).toEqual([messages, ...before.slice(1)]);
}

/** Inspect both pooled sessions, including whichever connection performed the operation. */
export async function expectMessageContextCleared(): Promise<void> {
  const connections = await Promise.all([fixture.rlsClient.reserve(), fixture.rlsClient.reserve()]);
  try {
    const contexts = await Promise.all(
      connections.map(
        connection => connection`
      select nullif(current_setting('app.current_tenant_id', true), '') as tenant,
        nullif(current_setting('app.current_access_tenant_id', true), '') as access,
        nullif(current_setting('app.user_role', true), '') as role,
        (select count(*)::int from claim_messages) as visible
      `
      )
    );
    expect(contexts.map(rows => rows[0])).toEqual([
      { tenant: null, access: null, role: null, visible: 0 },
      { tenant: null, access: null, role: null, visible: 0 },
    ]);
  } finally {
    connections.forEach(connection => connection.release());
  }
}
