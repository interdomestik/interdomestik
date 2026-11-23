import assert from 'node:assert/strict';
import test from 'node:test';

import { eq, sql } from 'drizzle-orm';

import { claimLifecycleFieldsForStatus } from '../src/claim-lifecycle';
import { auditLog, claims, user } from '../src/schema';
import { grantColumnPrivileges } from './column-grants.support';
import { quoteIdentifier, TEST_DB_ROLE } from './rls-test-connection';
import { KS_TENANT_ID, openS8RestrictedSession } from './s8-claim-restricted-rls.fixture';
import { gate } from './wp11-claim-status-rls.fixture';

test(
  'concurrent staff assignments serialize and audit the committed change under the restricted role',
  { timeout: 30_000 },
  async t => {
    const session = await openS8RestrictedSession(t, { DB_MAX_CONNECTIONS: '4' });
    if (!session) return;
    const { adminDb, fixture } = session;
    const { claimId, userId } = fixture.ks;
    const claimWhere = eq(claims.id, claimId);
    const auditWhere = eq(auditLog.entityId, claimId);
    let revokeColumns: (() => Promise<void>) | undefined;
    try {
      await adminDb.execute(
        sql.raw(`grant select, insert on table "audit_log" to ${quoteIdentifier(TEST_DB_ROLE)}`)
      );
      await adminDb.execute(
        sql.raw(`grant select on table "user" to ${quoteIdentifier(TEST_DB_ROLE)}`)
      );
      // The claim command locks the user row; FOR UPDATE needs UPDATE on a column.
      revokeColumns = await grantColumnPrivileges(adminDb, [['update', 'user', ['id']]]);
      await adminDb.update(user).set({ role: 'staff' }).where(eq(user.id, userId));
      await adminDb
        .update(claims)
        .set({ ...claimLifecycleFieldsForStatus('submitted'), staffId: null })
        .where(claimWhere);

      const [{ withTenantAuthority }, { mintTestTenantAuthority }, { changeClaimAssignment }] =
        await Promise.all([
          import('../src/tenant-authority-context'),
          import('../src/testing/tenant-authority'),
          import('../../domain-claims/src/staff-claims/assign'),
        ]);
      const authority = mintTestTenantAuthority(KS_TENANT_ID, { userId, role: 'staff' });
      const posture = await withTenantAuthority(authority, tx =>
        tx.execute<{ name: string; bypass: boolean; superuser: boolean; rls: string }>(sql`
          select current_user as name, rolbypassrls as bypass, rolsuper as superuser,
            current_setting('row_security') as rls
          from pg_roles where rolname = current_user`)
      );
      assert.deepEqual(posture[0], {
        name: TEST_DB_ROLE,
        bypass: false,
        superuser: false,
        rls: 'on',
      });

      const request = () =>
        changeClaimAssignment(
          authority,
          { claimId },
          {
            requestHeaders: new Headers({ 'user-agent': 'WP-11 assignment proof' }),
          }
        );

      const release = gate();
      const locked = gate();
      let blockerPid = 0;
      const blocker = withTenantAuthority(authority, async tx => {
        await tx.select({ id: claims.id }).from(claims).where(claimWhere).for('no key update');
        const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        blockerPid = backend.pid;
        locked.open();
        await release.promise;
      });
      await Promise.race([
        locked.promise,
        blocker.then(() => {
          throw new Error('Claim lock transaction ended before exposing its backend');
        }),
      ]);
      const attempts = Promise.all([request(), request()]);
      try {
        // Confirm the two requests joined the blocked row-lock chain at the locking claim read
        // before releasing it. The chain follows lock waits from the blocker. pg_stat_activity
        // truncates that select (every column) before its locking clause, so a waiter is matched
        // by its visible select prefix; a waiter at the guarded update does not count.
        let blocked = 0;
        for (let poll = 0; poll < 100 && blocked < 2; poll++) {
          const [activity] = await adminDb.execute<{ count: number }>(sql`
            with recursive waiting(pid) as (
              select pid from pg_stat_activity
              where datname = current_database() and wait_event_type = 'Lock'
                and query like 'select %'
                and ${blockerPid} = any(pg_blocking_pids(pid))
              union
              select activity.pid from pg_stat_activity activity join waiting
                on waiting.pid = any(pg_blocking_pids(activity.pid))
              where activity.datname = current_database() and activity.wait_event_type = 'Lock'
                and activity.query like 'select %'
            )
            select count(*)::int as count from waiting
          `);
          blocked = activity.count;
          if (blocked < 2) await new Promise(resolve => setTimeout(resolve, 20));
        }
        assert.equal(blocked, 2);
      } finally {
        release.open();
        await blocker;
        await attempts;
      }

      const results = await attempts;
      assert.equal(results.filter(result => result.ok && result.changed).length, 1);
      assert.equal(results.filter(result => result.ok && !result.changed).length, 1);
      const [row] = await adminDb.select().from(claims).where(claimWhere);
      assert.equal(row?.staffId, userId);
      assert.equal(row?.assignedById, userId);
      const audits = await adminDb.select().from(auditLog).where(auditWhere);
      assert.deepEqual(
        audits.map(audit => ({ action: audit.action, metadata: audit.metadata })),
        [
          {
            action: 'claim.assigned',
            metadata: {
              previousStaffId: null,
              newStaffId: userId,
              userAgent: 'WP-11 assignment proof',
            },
          },
        ]
      );
    } finally {
      try {
        await adminDb.delete(auditLog).where(auditWhere);
      } finally {
        try {
          await revokeColumns?.();
        } finally {
          await session.close();
        }
      }
    }
  }
);
