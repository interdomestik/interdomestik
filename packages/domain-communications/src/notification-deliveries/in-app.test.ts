import type { TenantTransaction } from '@interdomestik/database';
import { notificationPreviewRestrictions, notifications } from '@interdomestik/database/schema';
import { describe, expect, it, vi } from 'vitest';
import { enqueueClaimInboxNotification, enqueueClaimInboxNotifications } from './in-app';

const inbox = (id: string, previewRestricted: boolean) => ({
  id,
  tenantId: 'tenant',
  userId: `user-${id}`,
  type: 'new_message',
  title: 'title',
  content: 'content',
  actionUrl: '/member/claims/claim',
  previewRestricted,
});

/** `existing` lists inbox ids that an earlier write (possibly a previous build) already stored. */
function harness(existing: readonly string[] = []) {
  const statements: Array<{ table: unknown; rows: Array<Record<string, unknown>> }> = [];
  const insert = vi.fn((table: unknown) => ({
    values: (rows: Array<Record<string, unknown>>) => {
      statements.push({ table, rows });
      const created = rows.filter(row => !existing.includes(String(row.id)));
      return {
        onConflictDoNothing: () =>
          Object.assign(Promise.resolve(), {
            returning: () => Promise.resolve(created.map(row => ({ id: row.id }))),
          }),
      };
    },
  }));
  return { tx: { insert } as unknown as TenantTransaction, statements };
}

describe('claim inbox notifications', () => {
  it('flags only the inbox rows this batch created, so an earlier row keeps its state', async () => {
    const h = harness(['legacy']);
    await enqueueClaimInboxNotifications(h.tx, [inbox('fresh', false), inbox('legacy', false)]);

    expect(h.statements.map(statement => statement.table)).toEqual([
      notifications,
      notificationPreviewRestrictions,
    ]);
    expect(h.statements[0].rows.map(row => row.id)).toEqual(['fresh', 'legacy']);
    expect(h.statements[0].rows.every(row => !('previewRestricted' in row))).toBe(true);
    expect(h.statements[1].rows).toEqual([
      { tenantId: 'tenant', notificationId: 'fresh', restricted: false },
    ]);
  });

  it('writes no flag when every inbox row already existed', async () => {
    const h = harness(['legacy']);
    await enqueueClaimInboxNotification(h.tx, inbox('legacy', false));

    expect(h.statements.map(statement => statement.table)).toEqual([notifications]);
  });

  it('keeps each row’s own restriction', async () => {
    const h = harness();
    await enqueueClaimInboxNotifications(h.tx, [inbox('a', true), inbox('b', false)]);

    expect(h.statements[1].rows).toEqual([
      { tenantId: 'tenant', notificationId: 'a', restricted: true },
      { tenantId: 'tenant', notificationId: 'b', restricted: false },
    ]);
  });
});
