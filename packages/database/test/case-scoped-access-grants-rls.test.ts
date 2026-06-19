import assert from 'node:assert/strict';
import test from 'node:test';

import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { caseScopedAccessGrants } from '../src/schema';
import {
  ACCESS_TENANT_ID,
  allowRlsGrantTableAccess,
  assertRejectsDb,
  cleanupGrantProofRows,
  grantRow,
  HOME_TENANT_ID,
  REQUIRED_RLS_TABLES,
  seedGrantProofRows,
  uniqueId,
} from './case-scoped-access-grants-rls-fixture';
import { applyRlsTestConnectionEnv, requireRlsPreconditions } from './rls-test-connection';

test('case-scoped access grants enforce live RLS and grant constraints', async t => {
  const requireIntegration = process.env.REQUIRE_RLS_INTEGRATION === '1';
  if (!process.env.DATABASE_URL) {
    if (requireIntegration) {
      assert.fail('case_scoped_access_grants RLS test requires DATABASE_URL.');
    }
    t.skip('DATABASE_URL is required for case-scoped grant RLS integration test');
    return;
  }

  const adminSql = postgres(process.env.DATABASE_URL);
  const adminDb = drizzle(adminSql);
  await requireRlsPreconditions(adminDb, adminSql, requireIntegration, t, REQUIRED_RLS_TABLES);
  if (t.signal.aborted) return;

  await allowRlsGrantTableAccess(adminDb);

  const homeUserId = uniqueId('rls_home_user');
  const accessUserId = uniqueId('rls_access_user');
  const claimId = uniqueId('rls_claim');
  const grantId = uniqueId('rls_grant');
  const now = new Date();
  const rlsTestEnv = applyRlsTestConnectionEnv(process.env.DATABASE_URL);
  const [{ dbAdmin }, { withTenantContext }] = await Promise.all([
    import('../src/db'),
    import('../src/tenant'),
  ]);

  try {
    await seedGrantProofRows(dbAdmin, { accessUserId, claimId, grantId, homeUserId }, now);

    const visibleToAccessTenant = await withTenantContext({ tenantId: ACCESS_TENANT_ID }, tx =>
      tx.select().from(caseScopedAccessGrants).where(eq(caseScopedAccessGrants.id, grantId))
    );
    assert.equal(visibleToAccessTenant.length, 1);
    const accessTenantUpdate = await withTenantContext({ tenantId: ACCESS_TENANT_ID }, tx =>
      tx
        .update(caseScopedAccessGrants)
        .set({ revokedAt: now })
        .where(eq(caseScopedAccessGrants.id, grantId))
        .returning({ id: caseScopedAccessGrants.id })
    );
    assert.equal(accessTenantUpdate.length, 0);
    const accessTenantDelete = await withTenantContext({ tenantId: ACCESS_TENANT_ID }, tx =>
      tx
        .delete(caseScopedAccessGrants)
        .where(eq(caseScopedAccessGrants.id, grantId))
        .returning({ id: caseScopedAccessGrants.id })
    );
    assert.equal(accessTenantDelete.length, 0);

    const homeTenantUpdate = await withTenantContext({ tenantId: HOME_TENANT_ID }, tx =>
      tx
        .update(caseScopedAccessGrants)
        .set({ expiresAt: new Date(now.getTime() + 120_000) })
        .where(eq(caseScopedAccessGrants.id, grantId))
        .returning({ id: caseScopedAccessGrants.id })
    );
    assert.equal(homeTenantUpdate.length, 1);

    const hiddenFromWrongTenant = await withTenantContext({ tenantId: 'tenant_unknown' }, tx =>
      tx.select().from(caseScopedAccessGrants).where(eq(caseScopedAccessGrants.id, grantId))
    );
    assert.equal(hiddenFromWrongTenant.length, 0);

    await withTenantContext({ tenantId: HOME_TENANT_ID }, tx =>
      tx.insert(caseScopedAccessGrants).values(
        grantRow({
          id: uniqueId('rls_grant'),
          actorId: homeUserId,
          caseId: claimId,
          correlationId: 'rls_duplicate_correlation',
        })
      )
    );
    await assertRejectsDb(
      assert.rejects,
      () =>
        withTenantContext({ tenantId: ACCESS_TENANT_ID }, tx =>
          tx
            .insert(caseScopedAccessGrants)
            .values(grantRow({ id: uniqueId('rls_grant'), actorId: accessUserId, caseId: claimId }))
        ),
      '42501'
    );
    await assertRejectsDb(
      assert.rejects,
      () =>
        dbAdmin.insert(caseScopedAccessGrants).values({
          ...grantRow({ id: uniqueId('rls_grant'), actorId: accessUserId, caseId: claimId }),
          documentClasses: ['identity' as 'legal'],
        }),
      '23514'
    );
    await assertRejectsDb(
      assert.rejects,
      () =>
        dbAdmin.insert(caseScopedAccessGrants).values(
          grantRow({
            id: uniqueId('rls_grant'),
            actorId: accessUserId,
            caseId: claimId,
            correlationId: uniqueId('rls_corr'),
          })
        ),
      '23505'
    );
    await assertRejectsDb(
      assert.rejects,
      () =>
        dbAdmin.insert(caseScopedAccessGrants).values({
          ...grantRow({ id: uniqueId('rls_grant'), actorId: accessUserId, caseId: claimId }),
          correlationId: 'rls_duplicate_correlation',
        }),
      '23505'
    );
  } finally {
    rlsTestEnv.restore();
    await cleanupGrantProofRows(dbAdmin, { accessUserId, claimId, homeUserId });
    await adminSql.end({ timeout: 5 });
  }
});
