import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';

import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { claimTransitionEvidence, claims, user } from '../src/schema';
import {
  applyRlsTestConnectionEnv,
  grantRlsTestRole,
  quoteIdentifier,
  quoteSqlLiteral,
  requireRlsPreconditions,
  TEST_DB_PASSWORD,
  TEST_DB_ROLE,
} from './rls-test-connection';

const KS_TENANT_ID = 'tenant_ks';
const MK_TENANT_ID = 'tenant_mk';
const REQUIRED_RLS_TABLES = ['claim_transition_evidence'] as const;

function uniqueId(prefix: string): string {
  return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

function isRlsRejection(error: unknown): boolean {
  const cause = (error as { cause?: { message?: string } }).cause;
  return /violates row-level security policy/iu.test(cause?.message ?? String(error));
}

test('claim_transition_evidence RLS scopes reads by access tenant and writes by home tenant', async t => {
  const requireIntegration = process.env.REQUIRE_RLS_INTEGRATION === '1';

  if (!process.env.DATABASE_URL) {
    if (requireIntegration) assert.fail('RLS test requires DATABASE_URL.');
    return t.skip('DATABASE_URL is required for RLS integration test');
  }

  const adminSql = postgres(process.env.DATABASE_URL);
  const adminDb = drizzle(adminSql);
  await requireRlsPreconditions(adminDb, adminSql, requireIntegration, t, REQUIRED_RLS_TABLES);
  if (t.signal.aborted) return;

  await adminDb.execute(
    sql.raw(`
    do $$
    begin
      create role ${quoteIdentifier(TEST_DB_ROLE)} login password ${quoteSqlLiteral(TEST_DB_PASSWORD)};
    exception when duplicate_object then
      alter role ${quoteIdentifier(TEST_DB_ROLE)} with login password ${quoteSqlLiteral(TEST_DB_PASSWORD)};
    end
    $$;
  `)
  );
  await grantRlsTestRole(adminDb, REQUIRED_RLS_TABLES);
  await adminDb.execute(
    sql.raw(`grant insert on table "claim_transition_evidence" to ${quoteIdentifier(TEST_DB_ROLE)}`)
  );

  const now = new Date();
  const userId = uniqueId('rls_user_ks');
  const claimId = uniqueId('rls_claim_ks');
  const evidenceId = uniqueId('rls_transition_evidence_ks');
  let restoreEnv: ReturnType<typeof applyRlsTestConnectionEnv> | null = null;
  let dbAdmin: (typeof import('../src/db'))['dbAdmin'] | null = null;
  let withTenantContext: (typeof import('../src/tenant'))['withTenantContext'] | null = null;

  try {
    restoreEnv = applyRlsTestConnectionEnv(process.env.DATABASE_URL);
    [{ dbAdmin }, { withTenantContext }] = await Promise.all([
      import('../src/db'),
      import('../src/tenant'),
    ]);
    await dbAdmin.insert(user).values({
      createdAt: now,
      email: `${userId}@example.test`,
      emailVerified: true,
      id: userId,
      name: 'RLS Evidence User',
      role: 'member',
      tenantId: KS_TENANT_ID,
      updatedAt: now,
    });
    await dbAdmin.insert(claims).values({
      category: 'retail',
      companyName: 'RLS Evidence Co',
      description: 'transition evidence RLS proof',
      id: claimId,
      origin: 'portal',
      tenantId: KS_TENANT_ID,
      title: 'RLS evidence claim',
      userId,
    });

    await withTenantContext({ tenantId: KS_TENANT_ID }, async tx => {
      await tx.insert(claimTransitionEvidence).values({
        accessTenantId: MK_TENANT_ID,
        claimId,
        evidenceStatus: 'signed',
        evidenceType: 'assignment_signed',
        id: evidenceId,
        tenantId: KS_TENANT_ID,
      });
    });

    const ksRows = await withTenantContext({ tenantId: KS_TENANT_ID }, tx =>
      tx
        .select({ id: claimTransitionEvidence.id })
        .from(claimTransitionEvidence)
        .where(eq(claimTransitionEvidence.id, evidenceId))
    );
    assert.equal(ksRows.length, 0, 'home tenant must not see divergent access evidence');

    const mkRows = await withTenantContext(
      { tenantId: KS_TENANT_ID, accessTenantId: MK_TENANT_ID },
      tx =>
        tx
          .select({ id: claimTransitionEvidence.id })
          .from(claimTransitionEvidence)
          .where(eq(claimTransitionEvidence.id, evidenceId))
    );
    assert.equal(mkRows.length, 1, 'access_tenant tenant_mk must see delegated evidence');

    await assert.rejects(
      () =>
        withTenantContext!({ tenantId: MK_TENANT_ID, accessTenantId: KS_TENANT_ID }, tx =>
          tx.insert(claimTransitionEvidence).values({
            claimId,
            evidenceStatus: 'signed',
            evidenceType: 'poa_signed',
            id: uniqueId('rls_transition_evidence_rejected_mk'),
            tenantId: MK_TENANT_ID,
          })
        ),
      isRlsRejection
    );
  } finally {
    if (dbAdmin) {
      await dbAdmin
        .delete(claimTransitionEvidence)
        .where(eq(claimTransitionEvidence.id, evidenceId));
      await dbAdmin.delete(claims).where(eq(claims.id, claimId));
      await dbAdmin.delete(user).where(eq(user.id, userId));
    }
    restoreEnv?.restore();
    await adminSql.end({ timeout: 5 });
  }
});
