import type { TenantTransaction } from '@interdomestik/database';
import {
  auditLog,
  notificationDeliveries,
  notificationPreviewRestrictions,
  notifications,
} from '@interdomestik/database/schema';
import { drizzle } from 'drizzle-orm/postgres-js';
import { describe, expect, it, vi } from 'vitest';
import { INSERT_BATCH_ROWS } from './enqueue';
import { enqueueStaffClaimNotification } from './staff';

const claim = {
  tenantId: 'tenant',
  claimId: 'claim',
  claimNumber: null,
  category: 'private category',
};
const source = { kind: 'staff_member_message', messageId: 'message' } as const;
const staff = (id: string, branchId: string | null = null) => ({
  id,
  role: 'staff',
  branchId,
  emailVerified: true,
});
const candidates = [staff('assignee'), staff('same-branch', 'a')];

/** `conflicted` lists recipient ids whose email delivery already exists (ON CONFLICT DO NOTHING). */
function enqueueHarness(conflicted: readonly string[] = []) {
  const values = vi.fn().mockImplementation(rows => {
    const inserted = (Array.isArray(rows) ? rows : [rows])
      .filter(row => !conflicted.includes(row.recipientUserId))
      .reverse()
      .map(row => ({ id: row.id }));
    const returning = () => Promise.resolve(inserted);
    return { onConflictDoNothing: () => Object.assign(Promise.resolve(), { returning }) };
  });
  const insert = vi.fn(() => ({ values }));
  return { tx: { insert } as unknown as TenantTransaction, insert, values };
}

/**
 * Builds every statement with the real Drizzle builder and records its bind parameters; execution
 * is simulated: every row is new.
 */
function builderHarness() {
  const builder = drizzle.mock();
  const statements: Array<{ rows: number; params: number }> = [];
  const queued: string[] = [];
  const insert = (
    table:
      typeof notifications | typeof notificationPreviewRestrictions | typeof notificationDeliveries
  ) => ({
    values: (rows: Array<{ id: string }>) => ({
      onConflictDoNothing: (
        config: Parameters<
          ReturnType<ReturnType<typeof builder.insert>['values']>['onConflictDoNothing']
        >[0]
      ) => {
        const query = builder
          .insert(table)
          .values(rows as never)
          .onConflictDoNothing(config);
        statements.push({ rows: rows.length, params: query.toSQL().params.length });
        if (table === notificationDeliveries) queued.push(...rows.map(row => row.id));
        const inserted = rows.map(row => ({ id: row.id }));
        return Object.assign(Promise.resolve(), { returning: () => Promise.resolve(inserted) });
      },
    }),
  });
  return { tx: { insert } as unknown as TenantTransaction, statements, queued };
}

describe('staff claim notifications', () => {
  it('writes each table in one statement and queues email only for verified staff', async () => {
    const h = enqueueHarness();
    const ids = await enqueueStaffClaimNotification(h.tx, claim, source, [
      candidates[0],
      { ...candidates[1], emailVerified: false },
    ]);
    expect(h.insert.mock.calls).toEqual([
      [notifications],
      [notificationPreviewRestrictions],
      [notificationDeliveries],
    ]);
    expect(h.values.mock.calls[0][0]).toEqual([
      {
        tenantId: 'tenant',
        userId: 'assignee',
        type: 'staff_member_message',
        id: 'ntf_staff:staff_member_message:message:assignee:in_app',
        title: '—',
        content: 'other',
        actionUrl: '/staff/claims/claim',
      },
      expect.objectContaining({
        userId: 'same-branch',
        id: 'ntf_staff:staff_member_message:message:same-branch:in_app',
      }),
    ]);
    expect(h.values.mock.calls[1][0]).toEqual(
      expect.arrayContaining([
        {
          tenantId: 'tenant',
          notificationId: 'ntf_staff:staff_member_message:message:assignee:in_app',
          restricted: false,
        },
        {
          tenantId: 'tenant',
          notificationId: 'ntf_staff:staff_member_message:message:same-branch:in_app',
          restricted: false,
        },
      ])
    );
    expect(h.values.mock.calls[1][0]).toHaveLength(2);
    expect(h.values.mock.calls[2][0]).toEqual([
      expect.objectContaining({
        id: ids[0],
        recipientUserId: 'assignee',
        facts: {},
        idempotencyKey: 'staff:staff_member_message:message:assignee:email',
      }),
    ]);
    expect(ids).toHaveLength(1);
  });

  it('returns only newly queued email ids, in recipient order', async () => {
    const h = enqueueHarness(['same-branch']);
    const ids = await enqueueStaffClaimNotification(h.tx, claim, source, [
      staff('assignee'),
      staff('same-branch', 'a'),
      staff('admin'),
    ]);
    const queued = h.values.mock.calls[2][0] as Array<{ id: string; recipientUserId: string }>;
    expect(queued.map(row => row.recipientUserId)).toEqual(['assignee', 'same-branch', 'admin']);
    expect(ids).toEqual([queued[0].id, queued[2].id]);
  });

  it('skips the delivery insert when no recipient has a verified email', async () => {
    const h = enqueueHarness();
    const ids = await enqueueStaffClaimNotification(h.tx, claim, source, [
      { ...staff('assignee'), emailVerified: false },
    ]);
    expect(h.insert.mock.calls).toEqual([[notifications], [notificationPreviewRestrictions]]);
    expect(ids).toEqual([]);
  });

  it('splits 20,000 recipients into bounded statements and keeps every id in order', async () => {
    const recipients = Array.from({ length: 20_000 }, (_, index) => staff(`staff-${index}`));
    const h = builderHarness();
    const ids = await enqueueStaffClaimNotification(h.tx, claim, source, recipients);
    // The ceiling is pinned here, not read back from the constant under test.
    expect(INSERT_BATCH_ROWS).toBe(1000);
    // 20 inbox, 20 preview-restriction and 20 delivery statements.
    expect(h.statements).toHaveLength(60);
    expect(h.statements.reduce((total, statement) => total + statement.rows, 0)).toBe(60_000);
    expect(Math.max(...h.statements.map(statement => statement.rows))).toBe(1000);
    expect(Math.max(...h.statements.map(statement => statement.params))).toBeLessThan(65_535);
    expect(ids).toHaveLength(recipients.length);
    expect(ids).toEqual(h.queued);
    expect(new Set(ids).size).toBe(recipients.length);
  });

  it('records the unrouted claim and kind when a staff notification has no recipient', async () => {
    const h = enqueueHarness();
    await expect(enqueueStaffClaimNotification(h.tx, claim, source, [])).resolves.toEqual([]);
    expect(h.insert).toHaveBeenCalledExactlyOnceWith(auditLog);
    expect(h.values).toHaveBeenCalledExactlyOnceWith({
      id: expect.any(String),
      tenantId: 'tenant',
      action: 'notification.unrouted',
      entityType: 'claim',
      entityId: 'claim',
      metadata: { kind: 'staff_member_message' },
    });
  });
});
