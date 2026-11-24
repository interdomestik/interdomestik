import assert from 'node:assert/strict';
import test from 'node:test';

import { inArray } from 'drizzle-orm';

import { notificationPreviewRestrictions, notifications, user } from '../src/schema';
import { grantTablePrivileges } from './activity-access-rls.support';
import { KS_TENANT_ID, openS8RestrictedSession } from './s8-claim-restricted-rls.fixture';

// WP-11: the inbox reader joins each notification's preview restriction. Under the restricted role
// it returns only the session user's rows of its tenant, with the flag as stored: null for a row
// WP-11 did not flag, else the stored boolean.
test('the inbox reader returns only its user’s rows with their stored preview flags', async t => {
  const session = await openS8RestrictedSession(t, { DB_MAX_CONNECTIONS: '4' });
  if (!session) return;
  const { adminDb, fixture } = session;
  const owner = fixture.ks.userId;
  const neighbour = 'wp11-inbox-neighbour';
  const ids = {
    unflagged: 'wp11-inbox-unflagged',
    open: 'wp11-inbox-open',
    restricted: 'wp11-inbox-restricted',
    neighbour: 'wp11-inbox-neighbour-row',
  };
  let revoke: (() => Promise<void>) | undefined;
  try {
    revoke = await grantTablePrivileges(adminDb, [
      ['select', 'notifications'],
      ['select', 'notification_preview_restrictions'],
    ]);
    await adminDb.insert(user).values({
      id: neighbour,
      tenantId: KS_TENANT_ID,
      name: 'Neighbour',
      email: `${neighbour}@example.test`,
      emailVerified: true,
      role: 'member',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const inbox = (id: string, userId: string, minute: number) => ({
      id,
      tenantId: KS_TENANT_ID,
      userId,
      type: 'new_message',
      title: 'New Message',
      content: 'Update',
      actionUrl: '/member',
      createdAt: new Date(Date.UTC(2026, 10, 23, 10, minute)),
    });
    await adminDb
      .insert(notifications)
      .values([
        inbox(ids.unflagged, owner, 1),
        inbox(ids.open, owner, 2),
        inbox(ids.restricted, owner, 3),
        inbox(ids.neighbour, neighbour, 4),
      ]);
    await adminDb.insert(notificationPreviewRestrictions).values([
      { tenantId: KS_TENANT_ID, notificationId: ids.open, restricted: false },
      { tenantId: KS_TENANT_ID, notificationId: ids.restricted, restricted: true },
      { tenantId: KS_TENANT_ID, notificationId: ids.neighbour, restricted: false },
    ]);

    const [{ getNotificationsCore }, { mintTestTenantAuthority }] = await Promise.all([
      import('../../domain-communications/src/notifications/get'),
      import('../src/testing/tenant-authority'),
    ]);
    const rows = await getNotificationsCore({
      session: { user: { id: owner, role: 'member', tenantId: KS_TENANT_ID } },
      authority: mintTestTenantAuthority(KS_TENANT_ID, { userId: owner, role: 'member' }),
    });
    const ours = rows
      .filter(row => Object.values(ids).includes(row.id))
      .map(row => ({ id: row.id, previewRestricted: row.previewRestricted }));
    // Newest first; the neighbour's row of the same tenant is not returned.
    assert.deepEqual(ours, [
      { id: ids.restricted, previewRestricted: true },
      { id: ids.open, previewRestricted: false },
      { id: ids.unflagged, previewRestricted: null },
    ]);
    assert.ok(rows.every(row => row.userId === owner && row.tenantId === KS_TENANT_ID));
  } finally {
    try {
      await adminDb.delete(notifications).where(inArray(notifications.id, Object.values(ids)));
      await adminDb.delete(user).where(inArray(user.id, [neighbour]));
    } finally {
      try {
        await revoke?.();
      } finally {
        await session.close();
      }
    }
  }
});
