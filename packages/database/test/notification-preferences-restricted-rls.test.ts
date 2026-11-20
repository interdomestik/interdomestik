import assert from 'node:assert/strict';
import test from 'node:test';
import { inspect } from 'node:util';

import { eq, getTableColumns, inArray, sql } from 'drizzle-orm';

import { user, userNotificationPreferences as prefs } from '../src/schema';
import { quoteIdentifier, TEST_DB_ROLE } from './rls-test-connection';
import { grantRlsTestRole } from './rls-test-grants';
import {
  KS_TENANT_ID,
  MK_TENANT_ID,
  openS8RestrictedSession,
} from './s8-claim-restricted-rls.fixture';

test('the restricted role saves notification preferences for the authority principal', async t => {
  const session = await openS8RestrictedSession(t);
  if (!session) return;
  const { adminDb, fixture } = session;
  const { userId } = fixture.ks;
  const peerId = fixture.newId('preferences_ks_peer');
  const otherUserIds = [peerId, fixture.mk.userId];
  const role = quoteIdentifier(TEST_DB_ROLE);

  // PostgreSQL timestamps retain microseconds that a JavaScript Date would discard.
  const readRows = (userIds: string[]) =>
    adminDb
      .select({
        ...getTableColumns(prefs),
        createdAt: sql<string>`${prefs.createdAt}::text`,
        updatedAt: sql<string>`${prefs.updatedAt}::text`,
      })
      .from(prefs)
      .where(inArray(prefs.userId, userIds))
      .orderBy(prefs.userId);
  const readSavedRow = async () => {
    const rows = await readRows([userId]);
    assert.equal(rows.length, 1, 'the principal has exactly one preferences row');
    return rows[0];
  };

  const failures: unknown[] = [];
  try {
    await grantRlsTestRole(adminDb, ['user_notification_preferences']);
    await adminDb.execute(
      sql.raw(`grant insert, update on table "user_notification_preferences" to ${role}`)
    );
    const [
      { updateNotificationPreferencesCore },
      { withTenantAuthority },
      { mintTestTenantAuthority },
    ] = await Promise.all([
      import('../../domain-users/src/user-settings/update'),
      import('../src/tenant-authority-context'),
      import('../src/testing/tenant-authority'),
    ]);
    const authority = mintTestTenantAuthority(KS_TENANT_ID, { userId, role: 'member' });
    // A stale tenant on the session makes the source of the persisted tenant observable.
    const actor = { user: { id: userId, role: 'member', tenantId: MK_TENANT_ID } };
    const now = new Date();
    await adminDb.insert(user).values({
      id: peerId,
      tenantId: KS_TENANT_ID,
      name: 'Preferences KS peer',
      email: `${peerId}@example.test`,
      emailVerified: true,
      role: 'member',
      createdAt: now,
      updatedAt: now,
    });
    await adminDb.insert(prefs).values([
      {
        id: fixture.newId('prefs_ks'),
        tenantId: KS_TENANT_ID,
        userId: peerId,
        emailMarketing: true,
      },
      {
        id: fixture.newId('prefs_mk'),
        tenantId: MK_TENANT_ID,
        userId: fixture.mk.userId,
        inAppAll: false,
      },
    ]);
    const othersBefore = await readRows(otherUserIds);
    assert.equal(othersBefore.length, 2);
    assert.deepEqual(await readRows([userId]), []);

    await withTenantAuthority(authority, async tx => {
      const [posture] = await tx.execute<{
        currentUser: string;
        bypass: boolean;
        superuser: boolean;
      }>(sql`
        select current_user as "currentUser", rolbypassrls as bypass, rolsuper as superuser
        from pg_roles where rolname = current_user`);
      assert.deepEqual(posture, { currentUser: TEST_DB_ROLE, bypass: false, superuser: false });
      const visible = await tx
        .select({ userId: prefs.userId })
        .from(prefs)
        .where(inArray(prefs.userId, otherUserIds));
      assert.deepEqual(visible, [{ userId: peerId }]);
    });

    // Every insert value differs from its column default, and the update flips all six.
    const initial = {
      emailClaimUpdates: false,
      emailMarketing: true,
      emailNewsletter: false,
      pushClaimUpdates: false,
      pushMessages: false,
      inAppAll: false,
    };
    const changed = {
      emailClaimUpdates: true,
      emailMarketing: false,
      emailNewsletter: true,
      pushClaimUpdates: true,
      pushMessages: true,
      inAppAll: true,
    };
    const save = (preferences: typeof initial, token = authority) =>
      updateNotificationPreferencesCore({ session: actor, authority: token, preferences });

    assert.deepEqual(await save(initial), { success: true });
    const inserted = await readSavedRow();
    assert.partialDeepStrictEqual(inserted, { tenantId: KS_TENANT_ID, userId, ...initial });
    assert.deepEqual(await readRows(otherUserIds), othersBefore);

    assert.deepEqual(await save(changed), { success: true });
    const updated = await readSavedRow();
    assert.deepEqual(updated, { ...inserted, ...changed, updatedAt: updated.updatedAt });
    assert.deepEqual(await readRows(otherUserIds), othersBefore);

    const peerAuthority = mintTestTenantAuthority(KS_TENANT_ID, { userId: peerId, role: 'member' });
    const allUserIds = [userId, ...otherUserIds];
    const beforeRefusal = await readRows(allUserIds);
    assert.deepEqual(await save(initial, peerAuthority), { success: false, error: 'Unauthorized' });
    assert.deepEqual(await readRows(allUserIds), beforeRefusal);
  } catch (error) {
    failures.push(error);
  } finally {
    for (const cleanup of [
      () => adminDb.delete(prefs).where(eq(prefs.userId, peerId)),
      () => adminDb.delete(user).where(eq(user.id, peerId)),
      () => session.close(),
    ]) {
      try {
        await cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
  }

  for (const error of failures.slice(1)) {
    t.diagnostic(`Additional cleanup failure: ${inspect(error)}`);
  }
  if (failures.length > 0) throw failures[0];
});
