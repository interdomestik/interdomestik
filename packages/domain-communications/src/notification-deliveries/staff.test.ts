import type { TenantTransaction } from '@interdomestik/database';
import { auditLog, notificationDeliveries, notifications } from '@interdomestik/database/schema';
import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { enqueueStaffClaimNotification, resolveStaffClaimNotificationRecipients } from './staff';

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
const admin = { ...staff('tenant-admin'), role: 'tenant_admin' };
const candidates = [
  staff('assignee'),
  staff('same-branch', 'a'),
  staff('outside-branch', 'b'),
  admin,
];

function txWithCandidates(users: typeof candidates, admitted: boolean[] = []) {
  const lock = vi.fn().mockResolvedValue(users);
  const select = vi.fn().mockReturnValue({
    from: () => ({
      where: () => {
        const rows = Promise.resolve(admitted.shift() ? [{ id: claim.claimId }] : []);
        return Object.assign(rows, { orderBy: () => ({ for: lock }) });
      },
    }),
  });
  const values = vi.fn().mockImplementation(row => ({
    onConflictDoNothing: () => ({ returning: async () => [{ id: row.id }] }),
  }));
  const insert = vi.fn(() => ({ values }));
  return { tx: { select, insert } as unknown as TenantTransaction, insert, values, lock };
}

describe('staff claim notification routing', () => {
  it('locks and checks every staff candidate, then routes only to the admitted assignee', async () => {
    const h = txWithCandidates(candidates, [false, true, true, false]);
    const readScope = vi.fn((_recipient: { userId: string }) => sql`true`);
    const result = await resolveStaffClaimNotificationRecipients(
      h.tx,
      {
        ...claim,
        staffId: 'assignee',
      },
      readScope
    );
    expect(result).toEqual([candidates[0]]);
    expect(h.lock).toHaveBeenCalledExactlyOnceWith('share');
    expect(readScope.mock.calls.map(([recipient]) => recipient.userId)).toEqual([
      'assignee',
      'same-branch',
      'outside-branch',
    ]);
  });

  it('excludes the assignee out of scope and admits only the other staff in scope', async () => {
    const h = txWithCandidates(candidates, [false, false, true, false]);
    const readScope = vi.fn(() => sql`true`);
    await expect(
      resolveStaffClaimNotificationRecipients(
        h.tx,
        {
          ...claim,
          staffId: 'assignee',
        },
        readScope
      )
    ).resolves.toEqual([candidates[1]]);
  });

  it('falls back to tenant administrators only when no staff member is admitted', async () => {
    const h = txWithCandidates(candidates);
    const readScope = vi.fn(() => sql`false`);
    await expect(
      resolveStaffClaimNotificationRecipients(
        h.tx,
        {
          ...claim,
          staffId: 'assignee',
        },
        readScope
      )
    ).resolves.toEqual([admin]);
  });

  it('writes only the staff inbox fields and queues email only for verified staff', async () => {
    const h = txWithCandidates(candidates);
    const ids = await enqueueStaffClaimNotification(h.tx, claim, source, [
      candidates[0],
      { ...candidates[1], emailVerified: false },
    ]);
    expect(h.insert.mock.calls).toEqual([
      [notifications],
      [notificationDeliveries],
      [notifications],
    ]);
    expect(h.values.mock.calls[0][0]).toEqual({
      tenantId: 'tenant',
      userId: 'assignee',
      type: 'staff_member_message',
      id: 'ntf_staff:staff_member_message:message:assignee:in_app',
      title: '—',
      content: 'other',
      actionUrl: '/staff/claims/claim',
    });
    expect(h.values.mock.calls[1][0]).toMatchObject({
      id: ids[0],
      recipientUserId: 'assignee',
      facts: {},
      idempotencyKey: 'staff:staff_member_message:message:assignee:email',
    });
  });

  it('records the unrouted claim and kind when a staff notification has no recipient', async () => {
    const h = txWithCandidates([]);
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
