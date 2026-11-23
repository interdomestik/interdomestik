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

describe('staff claim notifications', () => {
  it('writes each table in one statement and queues email only for verified staff', async () => {
    const h = enqueueHarness();
    const ids = await enqueueStaffClaimNotification(h.tx, claim, source, [
      candidates[0],
      { ...candidates[1], emailVerified: false },
    ]);
    expect(h.insert.mock.calls).toEqual([[notifications], [notificationDeliveries]]);
    expect(h.values.mock.calls[0][0]).toEqual([
      {
        tenantId: 'tenant',
        userId: 'assignee',
        type: 'staff_member_message',
        id: 'ntf_staff:staff_member_message:message:assignee:in_app',
        title: '—',
        content: 'other',
        actionUrl: '/staff/claims/claim',
        previewRestricted: false,
      },
      expect.objectContaining({
        userId: 'same-branch',
        id: 'ntf_staff:staff_member_message:message:same-branch:in_app',
      }),
    ]);
    expect(h.values.mock.calls[1][0]).toEqual([
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
    const queued = h.values.mock.calls[1][0] as Array<{ id: string; recipientUserId: string }>;
    expect(queued.map(row => row.recipientUserId)).toEqual(['assignee', 'same-branch', 'admin']);
    expect(ids).toEqual([queued[0].id, queued[2].id]);
  });

  it('skips the delivery insert when no recipient has a verified email', async () => {
    const h = enqueueHarness();
    const ids = await enqueueStaffClaimNotification(h.tx, claim, source, [
      { ...staff('assignee'), emailVerified: false },
    ]);
    expect(h.insert.mock.calls).toEqual([[notifications]]);
    expect(ids).toEqual([]);
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
