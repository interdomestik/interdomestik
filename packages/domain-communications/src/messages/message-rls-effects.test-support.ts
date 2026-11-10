import { inArray } from 'drizzle-orm';
import { expect, vi } from 'vitest';
import { fixture, homeTenantId, otherTenantId } from './tenant-context.integration-fixture';

/** Full rows include read_at: counts alone cannot detect a denied receipt update. */
export function messageEffects() {
  const { dbAdmin, claimMessages, auditLog, notifications } = fixture.database;
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
  ]);
}

type MessageEffects = Awaited<ReturnType<typeof messageEffects>>;

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
    expect(after.slice(1)).toEqual(before.slice(1));
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
  expect(after).toEqual([messages, before[1], before[2]]);
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
