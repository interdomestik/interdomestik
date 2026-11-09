import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as poll } from 'node:timers/promises';

import { eq, sql } from 'drizzle-orm';

import { auditLog, branches, leadPaymentAttempts, memberLeads, user } from '../src/schema';
import { buildCashStatesToSeed } from '../src/seed-golden/cash-states';
import { mintTestTenantAuthority } from '../src/testing/tenant-authority';
import { quoteIdentifier, TEST_DB_ROLE } from './rls-test-connection';
import { openS8RestrictedSession } from './s8-claim-restricted-rls.fixture';

function signal() {
  let resolve = (): void => {};
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

// Uses the existing restricted-login harness; never run against an unowned database.
test('cash resubmission commits exactly once and rolls back after an audit failure', async t => {
  const session = await openS8RestrictedSession(t, { DB_MAX_CONNECTIONS: '4' });
  if (!session) return;
  t.after(() => session.close());
  const { adminDb, fixture } = session;
  const { withTenantAuthority } = await import('../src/tenant-authority-context');
  const source = buildCashStatesToSeed().find(row => row.attempt.status === 'needs_info');
  assert.ok(source, 'NEEDS_INFO catalogue row is required');
  const branchId = fixture.newId('cash_resubmit_branch');
  const agentId = fixture.newId('cash_resubmit_agent');
  const verifierId = fixture.newId('cash_resubmit_verifier');
  const lead = {
    ...source.lead,
    id: fixture.newId('cash_resubmit_lead'),
    branchId,
    agentId,
    consentCapturedBy: agentId,
    email: `${fixture.newId('cash_resubmit')}@example.invalid`,
  };
  const attempt = {
    ...source.attempt,
    id: fixture.newId('cash_resubmit_attempt'),
    leadId: lead.id,
    verifiedBy: verifierId,
  };
  const authority = mintTestTenantAuthority(lead.tenantId, {
    userId: lead.agentId,
    role: 'agent',
  });
  try {
    // Only fixture-role grants, using the existing role and real unchanged RLS policies.
    const role = quoteIdentifier(TEST_DB_ROLE);
    await adminDb.execute(sql.raw(`grant select on member_leads to ${role}`));
    await adminDb.execute(sql.raw(`grant select, update on lead_payment_attempts to ${role}`));
    await adminDb.execute(sql.raw(`grant insert on audit_log to ${role}`));
    const [posture] = await withTenantAuthority(authority, tx =>
      tx.execute<{
        sessionRole: string;
        currentRole: string;
        superuser: boolean;
        bypass: boolean;
        rowSecurity: string;
        leadsRls: boolean;
        attemptsRls: boolean;
        auditRls: boolean;
      }>(sql`select session_user as "sessionRole", current_user as "currentRole",
        rolsuper as superuser, rolbypassrls as bypass,
        current_setting('row_security') as "rowSecurity",
        row_security_active('public.member_leads'::regclass) as "leadsRls",
        row_security_active('public.lead_payment_attempts'::regclass) as "attemptsRls",
        row_security_active('public.audit_log'::regclass) as "auditRls"
        from pg_roles where rolname = session_user`)
    );
    assert.deepEqual(posture, {
      sessionRole: TEST_DB_ROLE,
      currentRole: TEST_DB_ROLE,
      superuser: false,
      bypass: false,
      rowSecurity: 'on',
      leadsRls: true,
      attemptsRls: true,
      auditRls: true,
    });
    await adminDb.insert(branches).values({
      id: branchId,
      tenantId: lead.tenantId,
      name: branchId,
      slug: branchId,
    });
    await adminDb.insert(user).values(
      [
        [agentId, 'agent'],
        [verifierId, 'admin'],
      ].map(([id, role]) => ({
        id,
        role,
        tenantId: lead.tenantId,
        branchId,
        name: id,
        email: `${id}@example.invalid`,
        emailVerified: true,
        createdAt: source.lead.createdAt,
        updatedAt: source.lead.updatedAt,
      }))
    );
    await adminDb.insert(memberLeads).values(lead);
    await adminDb.insert(leadPaymentAttempts).values(attempt);
    // Import after the harness configures the app's restricted pool. No mutation is mocked.
    const { resubmitCashAttemptCore } =
      await import('../../../apps/web/src/features/admin/verification/server/mutations/resubmit-attempt');
    const ctx = {
      authority,
      tenantId: lead.tenantId,
      session: { user: { id: lead.agentId, role: 'agent' } },
    } as unknown as Parameters<typeof resubmitCashAttemptCore>[0];
    const resubmit = (note: string) =>
      resubmitCashAttemptCore(ctx, { attemptId: attempt.id, note });
    const storedAttempt = async () =>
      (
        await adminDb
          .select()
          .from(leadPaymentAttempts)
          .where(eq(leadPaymentAttempts.id, attempt.id))
      )[0];
    const audits = () => adminDb.select().from(auditLog).where(eq(auditLog.entityId, attempt.id));

    await t.test(
      'audit failure after UPDATE rolls back the whole attempt; retry is clean',
      async () => {
        const before = await storedAttempt();
        // PostgreSQL JSONB rejects U+0000 at the audit INSERT, after UPDATE ... RETURNING.
        await assert.rejects(resubmit('\u0000'), (error: unknown) => {
          const failure = error as { query?: string; cause?: { code?: string } };
          assert.match(failure.query ?? '', /insert into "audit_log"/u);
          assert.equal(failure.cause?.code, '22P05');
          return true;
        });
        assert.deepEqual(await storedAttempt(), before, 'all updated fields rolled back');
        assert.deepEqual(await audits(), [], 'no partial audit survived');
        assert.deepEqual(await resubmit('clean retry'), { success: true });
        assert.equal((await storedAttempt()).status, 'pending');
        assert.equal((await audits()).length, 1);
      }
    );

    // Restore only this test-owned copy for the controlled race.
    await adminDb
      .update(leadPaymentAttempts)
      .set(attempt)
      .where(eq(leadPaymentAttempts.id, attempt.id));
    await adminDb.delete(auditLog).where(eq(auditLog.entityId, attempt.id));
    await t.test('both UPDATEs contend in PostgreSQL; exactly one wins and audits', async () => {
      const locked = signal();
      const release = signal();
      let holder = 0;
      const held = adminDb.transaction(async tx => {
        await tx.execute(sql`lock table lead_payment_attempts in share mode`);
        const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        holder = backend.pid;
        locked.resolve();
        await release.promise;
      });
      const holderResult = held.then(
        () => null,
        (error: unknown) => error
      );
      let results: Promise<PromiseSettledResult<{ success: boolean }>[]> = Promise.resolve([]);
      try {
        await Promise.race([locked.promise, held]);
        results = Promise.allSettled([resubmit('race one'), resubmit('race two')]);
        const waitForBothUpdates = async (deadline: number): Promise<void> => {
          const rows = await withTenantAuthority(authority, tx =>
            tx.execute<{ pid: number }>(sql`select pid from pg_stat_activity
              where usename = ${TEST_DB_ROLE} and state = 'active'
                and query like 'update "lead_payment_attempts"%'
                and ${holder}::int = any(pg_blocking_pids(pid))`)
          );
          if (rows.length === 2) return;
          assert.ok(Date.now() < deadline, 'both core calls must reach the blocked UPDATE');
          await poll(20);
          await waitForBothUpdates(deadline);
        };
        await waitForBothUpdates(Date.now() + 5000);
        release.resolve();
        await held;
        const outcomes = await results;
        assert.deepEqual(
          outcomes.filter(result => result.status === 'fulfilled'),
          [{ status: 'fulfilled', value: { success: true } }]
        );
        const losers = outcomes.filter(result => result.status === 'rejected');
        assert.equal(losers.length, 1);
        assert.equal(
          losers[0].reason.message,
          'This payment attempt was just decided by someone else. Reload and retry.'
        );
      } finally {
        release.resolve();
        await Promise.all([holderResult, results]);
      }
      const stored = await storedAttempt();
      assert.equal(stored.status, 'pending');
      assert.equal(stored.isResubmission, true);
      const committed = await audits();
      assert.equal(committed.length, 1);
      assert.equal(committed[0].action, 'PAYMENT_RESUBMITTED');
      const metadata = committed[0].metadata as { note: string; previousStatus: string };
      assert.ok(['race one', 'race two'].includes(metadata.note));
      assert.equal(metadata.previousStatus, 'needs_info');
    });
  } finally {
    await adminDb.delete(auditLog).where(eq(auditLog.entityId, attempt.id));
    await adminDb.delete(leadPaymentAttempts).where(eq(leadPaymentAttempts.id, attempt.id));
    await adminDb.delete(memberLeads).where(eq(memberLeads.id, lead.id));
    await adminDb.delete(user).where(sql`${user.id} in (${agentId}, ${verifierId})`);
    await adminDb.delete(branches).where(eq(branches.id, branchId));
  }
});
