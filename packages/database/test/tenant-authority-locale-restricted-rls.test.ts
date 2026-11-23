import assert from 'node:assert/strict';
import test from 'node:test';

import { eq, inArray } from 'drizzle-orm';

import { user, userLocalePreferences } from '../src/schema';
import { grantTablePrivileges } from './activity-access-rls.support';
import { grantColumnPrivileges } from './column-grants.support';
import {
  KS_TENANT_ID,
  MK_TENANT_ID,
  openS8RestrictedSession,
} from './s8-claim-restricted-rls.fixture';

// WP-11: the recipient locale lives in `user_locale_preferences`. The save runs under the
// restricted role through `withTenantAuthority`, locks its user row FOR KEY SHARE and upserts one
// row per user; an absent user is a conflict.
test('saves the locale only when the session authority covers its own profile', async t => {
  const session = await openS8RestrictedSession(t, { DB_MAX_CONNECTIONS: '4' });
  if (!session) return;
  const { adminDb, fixture } = session;
  const { ks, mk } = fixture;
  const raceUser = 'wp11-locale-race';
  const lockUser = 'wp11-locale-lock';
  const users = [ks.userId, mk.userId, raceUser];
  let revokeColumns: (() => Promise<void>) | undefined;
  let revokeTable: (() => Promise<void>) | undefined;
  try {
    const [{ savePreferredLocale }, { mintTenantAuthority }] = await Promise.all([
      import('../../domain-communications/src/recipient-locale'),
      import('../src/tenant-authority'),
    ]);
    // The key-share lock needs UPDATE on one column of the user row.
    revokeColumns = await grantColumnPrivileges(adminDb, [
      ['select', 'user', ['id', 'tenant_id']],
      ['update', 'user', ['id']],
    ]);
    revokeTable = await grantTablePrivileges(adminDb, [
      ['select, insert, update', 'user_locale_preferences'],
    ]);
    await adminDb.update(user).set({ role: 'admin' }).where(eq(user.id, mk.userId));

    const readPreferences = () =>
      adminDb
        .select({ id: userLocalePreferences.userId, locale: userLocalePreferences.locale })
        .from(userLocalePreferences)
        .where(inArray(userLocalePreferences.userId, users))
        .orderBy(userLocalePreferences.userId);
    const before = await readPreferences();

    const admin = { id: mk.userId, role: 'admin', tenantId: MK_TENANT_ID };
    const authority = (tenantId: string, userId = admin.id) =>
      mintTenantAuthority({
        tenantId,
        purpose: 'session',
        principal: { userId, role: admin.role, branchId: null, agentId: null },
      });
    const crossHome = { user: { ...admin, accessTenantId: KS_TENANT_ID } };
    assert.equal(
      await savePreferredLocale(authority(KS_TENANT_ID), crossHome, 'mk'),
      'profile_scope_unavailable'
    );
    assert.equal(
      await savePreferredLocale(authority(KS_TENANT_ID, ks.userId), crossHome, 'mk'),
      'UNAUTHORIZED'
    );
    assert.deepEqual(await readPreferences(), before);

    const home = { user: { ...admin, accessTenantId: MK_TENANT_ID } };
    assert.equal(await savePreferredLocale(authority(MK_TENANT_ID), home, 'mk'), 'saved');
    const saved = [...before.filter(row => row.id !== admin.id), { id: admin.id, locale: 'mk' }];
    const byId = (rows: typeof saved) => [...rows].sort((x, y) => x.id.localeCompare(y.id));
    assert.deepEqual(await readPreferences(), byId(saved));
    // A second save updates the one row.
    assert.equal(await savePreferredLocale(authority(MK_TENANT_ID), home, 'de'), 'saved');
    assert.deepEqual(
      await readPreferences(),
      byId(saved.map(row => (row.id === admin.id ? { ...row, locale: 'de' } : row)))
    );

    // A principal whose user row is absent gets 'conflict' and writes nothing.
    const absent = 'wp11-absent-user';
    const ghost = { user: { ...admin, id: absent, accessTenantId: MK_TENANT_ID } };
    assert.equal(
      await savePreferredLocale(authority(MK_TENANT_ID, absent), ghost, 'sq'),
      'conflict'
    );
    const ghostRows = await adminDb
      .select({ id: userLocalePreferences.userId })
      .from(userLocalePreferences)
      .where(eq(userLocalePreferences.userId, absent));
    assert.deepEqual(ghostRows, []);

    const seedUser = (id: string) =>
      adminDb.insert(user).values({
        id,
        tenantId: MK_TENANT_ID,
        name: 'Locale user',
        email: `${id}@example.test`,
        emailVerified: true,
        role: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    const sessionOf = (id: string) => ({ user: { ...admin, id, accessTenantId: MK_TENANT_ID } });

    // Two first saves for one user overlap: both succeed and leave one row.
    await seedUser(raceUser);
    const raced = await Promise.all([
      savePreferredLocale(authority(MK_TENANT_ID, raceUser), sessionOf(raceUser), 'mk'),
      savePreferredLocale(authority(MK_TENANT_ID, raceUser), sessionOf(raceUser), 'de'),
    ]);
    assert.deepEqual(raced, ['saved', 'saved']);
    const raceRows = await adminDb
      .select({ locale: userLocalePreferences.locale })
      .from(userLocalePreferences)
      .where(eq(userLocalePreferences.userId, raceUser));
    assert.equal(raceRows.length, 1);
    assert.ok(['mk', 'de'].includes(raceRows[0]?.locale ?? ''));

    // The save locks its user before it writes: while another transaction holds the row, the save
    // waits; when that transaction deletes the user, the save reports a conflict. Without its own
    // lock the save would read the user, then fail on the foreign key.
    await seedUser(lockUser);
    let pending: Promise<string> | undefined;
    await adminDb.transaction(async tx => {
      await tx.select({ id: user.id }).from(user).where(eq(user.id, lockUser)).for('update');
      pending = savePreferredLocale(authority(MK_TENANT_ID, lockUser), sessionOf(lockUser), 'mk');
      const early = await Promise.race([
        pending.then(() => 'finished'),
        new Promise(resolve => setTimeout(() => resolve('waiting'), 300)),
      ]);
      assert.equal(early, 'waiting');
      await tx.delete(user).where(eq(user.id, lockUser));
    });
    assert.equal(await pending, 'conflict');
    const lockRows = await adminDb
      .select({ id: userLocalePreferences.userId })
      .from(userLocalePreferences)
      .where(eq(userLocalePreferences.userId, lockUser));
    assert.deepEqual(lockRows, []);
  } finally {
    try {
      await adminDb
        .delete(userLocalePreferences)
        .where(inArray(userLocalePreferences.userId, users));
      await adminDb.delete(user).where(inArray(user.id, [raceUser, lockUser]));
    } finally {
      try {
        await revokeTable?.();
      } finally {
        try {
          await revokeColumns?.();
        } finally {
          await session.close();
        }
      }
    }
  }
});
