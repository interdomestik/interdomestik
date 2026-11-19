import assert from 'node:assert/strict';
import test from 'node:test';

import { eq, sql } from 'drizzle-orm';

import { auditLog } from '../src/schema';
import { quoteIdentifier, TEST_DB_ROLE } from './rls-test-connection';
import {
  KS_TENANT_ID,
  MK_TENANT_ID,
  openS8RestrictedSession,
} from './s8-claim-restricted-rls.fixture';

// WP-02: the action wrapper records every authenticated refusal as one `action.refused` audit row
// written under the caller's own authority (design §5.2). Proved here on the real database under
// the restricted role: the caller's tenant writes its row, cannot write one for another tenant,
// and another tenant cannot read it.
test(
  'a refusal row stays inside the caller tenant under the restricted role',
  { timeout: 30_000 },
  async t => {
    const session = await openS8RestrictedSession(t, { DB_MAX_CONNECTIONS: '2' });
    if (!session) return;
    const { adminDb, fixture } = session;
    const operation = fixture.newId('refusal_rls_operation');
    const byOperation = eq(auditLog.entityId, operation);
    try {
      await adminDb.execute(
        sql.raw(`grant select, insert on table "audit_log" to ${quoteIdentifier(TEST_DB_ROLE)}`)
      );
      const [{ withTenantAuthority }, { mintTestTenantAuthority }] = await Promise.all([
        import('../src/tenant-authority-context'),
        import('../src/testing/tenant-authority'),
      ]);
      const callerA = mintTestTenantAuthority(KS_TENANT_ID, {
        userId: fixture.ks.userId,
        role: 'member',
      });
      const callerB = mintTestTenantAuthority(MK_TENANT_ID, {
        userId: fixture.mk.userId,
        role: 'staff',
      });
      const refusalRow = (id: string, tenantId: string) => ({
        id,
        tenantId,
        actorId: fixture.ks.userId,
        actorRole: 'member',
        action: 'action.refused',
        entityType: 'server_action',
        entityId: operation,
        metadata: { code: 'FORBIDDEN', basis: 'role', subject: { type: 'claim', id: 'unknown' } },
      });

      await t.test("tenant A's authority writes tenant A's refusal row", async () => {
        await withTenantAuthority(callerA, tx =>
          tx.insert(auditLog).values(refusalRow(fixture.newId('refusal_a'), KS_TENANT_ID))
        );
        const rows = await adminDb.select().from(auditLog).where(byOperation);
        assert.equal(rows.length, 1);
        assert.equal(rows[0]?.tenantId, KS_TENANT_ID);
      });

      await t.test("a row claiming tenant B under tenant A's context is refused", async () => {
        await assert.rejects(
          withTenantAuthority(callerA, tx =>
            tx.insert(auditLog).values(refusalRow(fixture.newId('refusal_b'), MK_TENANT_ID))
          )
        );
        const rows = await adminDb.select().from(auditLog).where(byOperation);
        assert.deepEqual(
          rows.map(row => row.tenantId),
          [KS_TENANT_ID]
        );
      });

      await t.test("tenant B cannot read tenant A's refusal row; tenant A can", async () => {
        const seenByB = await withTenantAuthority(callerB, tx =>
          tx.select({ id: auditLog.id }).from(auditLog).where(byOperation)
        );
        const seenByA = await withTenantAuthority(callerA, tx =>
          tx.select({ id: auditLog.id }).from(auditLog).where(byOperation)
        );
        assert.equal(seenByB.length, 0);
        assert.equal(seenByA.length, 1);
      });
    } finally {
      try {
        await adminDb.delete(auditLog).where(byOperation);
      } finally {
        await session.close();
      }
    }
  }
);
