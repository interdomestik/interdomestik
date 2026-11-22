import type { TenantTransaction } from '@interdomestik/database';
import { auditLog, notificationDeliveries, notifications } from '@interdomestik/database/schema';
import { describe, expect, it, vi } from 'vitest';
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

function enqueueHarness() {
  const values = vi.fn().mockImplementation(row => ({
    onConflictDoNothing: () => ({ returning: () => Promise.resolve([{ id: row.id }]) }),
  }));
  const insert = vi.fn(() => ({ values }));
  return { tx: { insert } as unknown as TenantTransaction, insert, values };
}

describe('staff claim notifications', () => {
  it('writes only the staff inbox fields and queues email only for verified staff', async () => {
    const h = enqueueHarness();
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
      previewRestricted: false,
    });
    expect(h.values.mock.calls[1][0]).toMatchObject({
      id: ids[0],
      recipientUserId: 'assignee',
      facts: {},
      idempotencyKey: 'staff:staff_member_message:message:assignee:email',
    });
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
