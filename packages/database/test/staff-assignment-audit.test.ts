import assert from 'node:assert/strict';
import test from 'node:test';

import { eq, sql } from 'drizzle-orm';

import { claimLifecycleFieldsForStatus } from '../src/claim-lifecycle';
import { auditLog, claims } from '../src/schema';
import type { TenantTransaction } from '../src/tenant';
import { quoteIdentifier, TEST_DB_ROLE } from './rls-test-connection';
import { KS_TENANT_ID, openS8RestrictedSession } from './s8-claim-restricted-rls.fixture';

// Reuse the restricted-role lane; required integration fails closed on missing prerequisites.
test(
  'staff assignment CAS and audit commit or roll back together under the restricted role',
  { timeout: 30_000 },
  async t => {
    const session = await openS8RestrictedSession(t, { DB_MAX_CONNECTIONS: '4' });
    if (!session) return;
    const { adminDb, fixture } = session;
    const { claimId, userId } = fixture.ks;
    const claimWhere = eq(claims.id, claimId);
    const auditWhere = eq(auditLog.entityId, claimId);
    try {
      // Test-role privileges only, matching the existing restricted fixture's provisioning pattern.
      await adminDb.execute(
        sql.raw(`grant select, insert on table "audit_log" to ${quoteIdentifier(TEST_DB_ROLE)}`)
      );
      await adminDb
        .update(claims)
        .set(claimLifecycleFieldsForStatus('submitted'))
        .where(claimWhere);
      const [{ withTenantAuthority }, { mintTestTenantAuthority }, { assignClaimInTransaction }] =
        await Promise.all([
          import('../src/tenant-authority-context'),
          import('../src/testing/tenant-authority'),
          import('../../domain-claims/src/staff-claims/assign-transaction'),
        ]);
      const authority = mintTestTenantAuthority(KS_TENANT_ID, { userId, role: 'staff' });
      const params = {
        authority,
        claimId,
        userId,
        actorRole: 'staff',
        branchId: null,
        nextStaffId: userId,
        previousStaffId: null,
        requestHeaders: new Headers({ 'user-agent': 'Plan070 SQL proof' }),
      };
      const readClaim = async () => (await adminDb.select().from(claims).where(claimWhere))[0];
      const readAudits = () => adminDb.select().from(auditLog).where(auditWhere);
      const posture = await withTenantAuthority(authority, tx =>
        tx.execute<{
          role: string;
          bypass: boolean;
          superuser: boolean;
          rls: string;
        }>(sql`
        select current_user as role, rolbypassrls as bypass, rolsuper as superuser,
          current_setting('row_security') as rls
        from pg_roles where rolname = current_user`)
      );
      assert.deepEqual(posture[0], {
        role: TEST_DB_ROLE,
        bypass: false,
        superuser: false,
        rls: 'on',
      });

      await t.test(
        'a real audit primary-key failure rolls back an already applied update',
        async () => {
          const collisionId = fixture.newId('assignment_audit_collision');
          await adminDb.insert(auditLog).values({
            id: collisionId,
            tenantId: KS_TENANT_ID,
            action: 'test.collision',
            entityType: 'claim',
            entityId: claimId,
          });
          const before = await readClaim();
          let sawUpdatedRow = false;
          await assert.rejects(
            withTenantAuthority(authority, tx => {
              // Only the generated audit ID is replaced; both writes use the real tenant transaction.
              const failingTx = new Proxy(tx, {
                get(target, key) {
                  if (key === 'insert') {
                    return (table: typeof auditLog) => ({
                      values: async (row: typeof auditLog.$inferInsert) => {
                        assert.equal(table, auditLog);
                        const [pending] = await tx.select().from(claims).where(claimWhere);
                        assert.equal(pending?.staffId, userId, 'CAS applied before audit failure');
                        sawUpdatedRow = true;
                        return target.insert(table).values({ ...row, id: collisionId });
                      },
                    });
                  }
                  const value = Reflect.get(target, key, target);
                  return typeof value === 'function' ? value.bind(target) : value;
                },
              });
              return assignClaimInTransaction(failingTx, params);
            }),
            (error: unknown) => {
              assert.equal((error as { cause?: { code?: string } }).cause?.code, '23505');
              return true;
            }
          );
          assert.equal(sawUpdatedRow, true);
          assert.deepEqual(
            await readClaim(),
            before,
            'all assignment fields and timestamps rolled back'
          );
          assert.equal(
            (await readAudits()).length,
            1,
            'only the pre-existing collision row remains'
          );
          await adminDb.delete(auditLog).where(eq(auditLog.id, collisionId));
        }
      );

      await t.test(
        'two requests with the same snapshot produce one CAS winner and one audit',
        async concurrency => {
          let arrivals = 0;
          let release: () => void = () => undefined;
          const bothRead = new Promise<void>(resolve => {
            release = resolve;
          });
          const request = () =>
            withTenantAuthority(authority, async (tx: TenantTransaction) => {
              const [snapshot] = await tx
                .select({ staffId: claims.staffId })
                .from(claims)
                .where(claimWhere);
              assert.ok(snapshot);
              assert.equal(snapshot.staffId, null);
              arrivals += 1;
              if (arrivals === 2) release();
              // Neither request may enter CAS until both have read the unassigned row.
              await bothRead;
              concurrency.signal.throwIfAborted();
              return assignClaimInTransaction(tx, { ...params, previousStaffId: snapshot.staffId });
            }).catch((error: unknown) => {
              release();
              throw error;
            });
          concurrency.signal.addEventListener('abort', release, { once: true });
          let settled: PromiseSettledResult<Awaited<ReturnType<typeof request>>>[];
          try {
            settled = await Promise.allSettled([request(), request()]);
          } finally {
            release();
            concurrency.signal.removeEventListener('abort', release);
          }
          const results = settled.map(result => {
            if (result.status === 'rejected') throw result.reason;
            return result.value;
          });
          assert.equal(results.filter(result => result.success).length, 1);
          assert.deepEqual(
            results.find(result => !result.success),
            {
              success: false,
              error: 'Claim not found or access denied',
            }
          );
          const row = await readClaim();
          assert.equal(row?.staffId, userId);
          assert.equal(row?.assignedById, userId);
          assert.ok(row?.assignedAt);
          const audits = await readAudits();
          assert.equal(audits.length, 1);
          assert.equal(audits[0]?.action, 'claim.assigned');
          assert.deepEqual(audits[0]?.metadata, {
            previousStaffId: null,
            newStaffId: userId,
            userAgent: 'Plan070 SQL proof',
          });
        }
      );
    } finally {
      try {
        await adminDb.delete(auditLog).where(auditWhere);
      } finally {
        await session.close();
      }
    }
  }
);
