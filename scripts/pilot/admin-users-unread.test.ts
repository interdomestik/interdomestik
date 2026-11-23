import { randomUUID } from 'node:crypto';
import {
  dbAdmin,
  user,
  claims,
  claimMessages,
  sql,
  inArray,
  withTenantContext,
} from '@interdomestik/database';
import assert from 'node:assert/strict';
import test from 'node:test';
import { getUsersCore } from '../../packages/domain-users/src/admin/get-users';

// Opt in against an owned, migrated and seeded local database; never a production target.
test(
  'aggregates actual unread SQL with a non-bypass role and two tenants',
  { skip: process.env.RECORDS_USER_LIST_DB_PROOF !== '1' },
  async () => {
    const target = new URL(process.env.DATABASE_URL!);
    assert.equal(target.hostname, '127.0.0.1');
    assert.equal(target.port, '55432');
    assert.equal(process.env.DB_RLS_ROLE, 'records_search_rls');
    await dbAdmin.execute(
      sql`do $$ begin create role records_search_rls nologin nosuperuser nobypassrls; exception when duplicate_object then null; end $$`
    );
    await dbAdmin.execute(sql`grant usage on schema public to records_search_rls`);
    await dbAdmin.execute(sql`grant select on all tables in schema public to records_search_rls`);
    const prefix = `records-list-proof-${randomUUID()}`;
    const memberId = `${prefix}-member`;
    const emptyId = `${prefix}-empty`;
    const foreignId = `${prefix}-foreign`;
    const staffId = `${prefix}-staff`;
    const oldClaim = `${prefix}-claim-a`;
    const newClaim = `${prefix}-claim-b`;
    const foreignClaim = `${prefix}-claim-mk`;
    const now = new Date('2026-01-01T00:00:00Z');
    const recent = new Date('2026-01-02T00:00:00Z');
    const session = { user: { id: staffId, role: 'tenant_admin', tenantId: 'tenant_ks' } };
    try {
      await dbAdmin.insert(user).values([
        {
          id: memberId,
          tenantId: 'tenant_ks',
          name: prefix,
          email: `${memberId}@example.test`,
          emailVerified: true,
          role: 'member',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: emptyId,
          tenantId: 'tenant_ks',
          name: prefix,
          email: `${emptyId}@example.test`,
          emailVerified: true,
          role: 'member',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: foreignId,
          tenantId: 'tenant_mk',
          name: prefix,
          email: `${foreignId}@example.test`,
          emailVerified: true,
          role: 'member',
          createdAt: now,
          updatedAt: now,
        },
        {
          id: staffId,
          tenantId: 'tenant_ks',
          name: 'Fixture Staff',
          email: `${staffId}@example.test`,
          emailVerified: true,
          role: 'staff',
          createdAt: now,
          updatedAt: now,
        },
      ]);
      await dbAdmin.insert(claims).values([
        {
          id: oldClaim,
          tenantId: 'tenant_ks',
          userId: memberId,
          title: 'Fixture',
          category: 'retail',
          companyName: 'Fixture',
        },
        {
          id: newClaim,
          tenantId: 'tenant_ks',
          userId: memberId,
          title: 'Fixture',
          category: 'retail',
          companyName: 'Fixture',
        },
        {
          id: foreignClaim,
          tenantId: 'tenant_mk',
          userId: foreignId,
          title: 'Fixture',
          category: 'retail',
          companyName: 'Fixture',
        },
      ]);
      await dbAdmin.insert(claimMessages).values([
        {
          id: `${prefix}-message-old`,
          tenantId: 'tenant_ks',
          claimId: oldClaim,
          senderId: memberId,
          content: 'fixture',
          createdAt: now,
        },
        {
          id: `${prefix}-message-a`,
          tenantId: 'tenant_ks',
          claimId: oldClaim,
          senderId: memberId,
          content: 'fixture',
          createdAt: recent,
        },
        {
          id: `${prefix}-message-z`,
          tenantId: 'tenant_ks',
          claimId: newClaim,
          senderId: memberId,
          content: 'fixture',
          createdAt: recent,
        },
        {
          id: `${prefix}-message-read`,
          tenantId: 'tenant_ks',
          claimId: newClaim,
          senderId: memberId,
          content: 'fixture',
          createdAt: recent,
          readAt: recent,
        },
        {
          id: `${prefix}-message-staff`,
          tenantId: 'tenant_ks',
          claimId: newClaim,
          senderId: staffId,
          content: 'fixture',
          createdAt: recent,
        },
        {
          id: `${prefix}-message-mk`,
          tenantId: 'tenant_mk',
          claimId: foreignClaim,
          senderId: foreignId,
          content: 'fixture',
          createdAt: recent,
        },
      ]);
      const runtime = await withTenantContext(
        { tenantId: 'tenant_ks', role: 'tenant_admin' },
        async tx =>
          tx.execute<{ role: string; bypass: boolean; superuser: boolean }>(
            sql`select current_user as role, rolbypassrls as bypass, rolsuper as superuser from pg_roles where rolname=current_user`
          )
      );
      assert.deepEqual(runtime[0], {
        role: 'records_search_rls',
        bypass: false,
        superuser: false,
      });
      const rows = await getUsersCore({ session, filters: { search: prefix, role: 'member' } });
      assert.equal(rows.length, 2);
      const member = rows.find(row => row.id === memberId);
      assert.deepEqual(
        {
          unreadCount: member?.unreadCount,
          unreadClaimId: member?.unreadClaimId,
          alertLink: member?.alertLink,
        },
        {
          unreadCount: 3,
          unreadClaimId: newClaim,
          alertLink: `/admin/claims/${newClaim}`,
        }
      );
      const empty = rows.find(row => row.id === emptyId);
      assert.deepEqual(
        {
          unreadCount: empty?.unreadCount,
          unreadClaimId: empty?.unreadClaimId,
          alertLink: empty?.alertLink,
        },
        {
          unreadCount: 0,
          unreadClaimId: null,
          alertLink: null,
        }
      );
      assert.equal(
        rows.some(row => row.id === foreignId),
        false
      );
      const choices = await getUsersCore({
        session,
        filters: { search: prefix, role: 'member' },
        includeUnreadCounts: false,
      });
      assert.equal(
        choices.every(row => row.unreadCount === 0 && row.unreadClaimId === null),
        true
      );
      assert.deepEqual(
        await getUsersCore({ session, filters: { search: `${prefix}-no-match` } }),
        []
      );
      console.log(
        'RECORDS_SQL_PROOF: strict role; 2 tenant-safe rows; 3 unread -> one aggregate/latest claim; timestamp tie, read and staff exclusions passed'
      );
    } finally {
      await dbAdmin
        .delete(claimMessages)
        .where(inArray(claimMessages.claimId, [oldClaim, newClaim, foreignClaim]));
      await dbAdmin.delete(claims).where(inArray(claims.id, [oldClaim, newClaim, foreignClaim]));
      await dbAdmin.delete(user).where(inArray(user.id, [memberId, emptyId, foreignId, staffId]));
    }
  }
);
