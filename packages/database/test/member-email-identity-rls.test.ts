import assert from 'node:assert/strict';
import test from 'node:test';

import { inArray, sql } from 'drizzle-orm';

import { user } from '../src/schema';
import type { TenantTransaction } from '../src/tenant';
import {
  KS_TENANT_ID,
  MK_TENANT_ID,
  openS8RestrictedSession,
} from './s8-claim-restricted-rls.fixture';

type PgFailure = { code?: unknown; constraint_name?: unknown; cause?: unknown };

function uniqueViolation(error: unknown): string | null {
  for (let current = error as PgFailure | undefined; current;) {
    if (current.code === '23505') return String(current.constraint_name);
    current = current.cause as PgFailure | undefined;
  }
  return null;
}

// ACQ-2b1 (migration 0098): one account per mailbox across all tenants, whatever the letter case.
// Tenant RLS hides other tenants' users from any lookup, so only the index can enforce this.
test('the case-insensitive email index holds across tenants under the restricted role', async t => {
  const session = await openS8RestrictedSession(t);
  if (!session) return;
  const { adminDb, fixture } = session;
  const created: string[] = [];
  const suffix = `${Date.now()}`;
  try {
    const [{ withTenantAuthority }, { mintTestTenantAuthority }] = await Promise.all([
      import('../src/tenant-authority-context'),
      import('../src/testing/tenant-authority'),
    ]);
    const insertMember = (tenantId: string, id: string, email: string) =>
      withTenantAuthority(mintTestTenantAuthority(tenantId), (tx: TenantTransaction) => {
        created.push(id);
        const now = new Date();
        return tx.insert(user).values({
          id,
          tenantId,
          email,
          name: 'ACQ-2b1 email identity',
          emailVerified: false,
          role: 'member',
          createdAt: now,
          updatedAt: now,
        });
      });
    const ksEmail = `${fixture.ks.userId}@example.test`;

    await t.test(
      'another tenant cannot see the account a new member would collide with',
      async () => {
        const visible = await withTenantAuthority(mintTestTenantAuthority(MK_TENANT_ID), tx =>
          tx
            .select({ id: user.id })
            .from(user)
            .where(sql`lower(${user.email}) = ${ksEmail.toLowerCase()}`)
        );
        assert.deepEqual(visible, []);
      }
    );

    await t.test('the hidden account still refuses a case variant in another tenant', async () => {
      const failure = await insertMember(
        MK_TENANT_ID,
        `acq2b1_mk_${suffix}`,
        ksEmail.toUpperCase()
      ).then(
        () => null,
        error => error
      );
      assert.equal(uniqueViolation(failure), 'user_email_lower_unique');
      const rows = await adminDb
        .select({ id: user.id })
        .from(user)
        .where(inArray(user.id, created));
      assert.deepEqual(rows, [], 'the refused insert rolled back');
    });

    await t.test('concurrent case variants in two tenants create exactly one account', async () => {
      const results = await Promise.allSettled([
        insertMember(KS_TENANT_ID, `acq2b1_race_ks_${suffix}`, `Race.${suffix}@Example.test`),
        insertMember(MK_TENANT_ID, `acq2b1_race_mk_${suffix}`, `race.${suffix}@example.test`),
      ]);
      assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
      const refused = results.find(result => result.status === 'rejected');
      assert.equal(uniqueViolation(refused?.reason), 'user_email_lower_unique');
    });
  } finally {
    if (created.length > 0) await adminDb.delete(user).where(inArray(user.id, created));
    await session.close();
  }
});
