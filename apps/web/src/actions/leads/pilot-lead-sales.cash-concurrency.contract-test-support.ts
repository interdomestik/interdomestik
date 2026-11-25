import { leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  cleanupPilotSalesTenants,
  type openPilotSalesContract,
  seedPilotSalesTenant,
} from '../pilot-sales.contract-test-support';
import {
  paymentAttemptState,
  seedLead,
  seedPaymentAttempt,
  useSession,
} from './pilot-lead-sales.test-support';

type AdminDb = Awaited<ReturnType<typeof openPilotSalesContract>>['dbAdmin'];

async function contendOnCashAttempt<Result>(
  dbAdmin: AdminDb,
  first: () => Promise<Result>,
  second: () => Promise<Result>
) {
  let release!: () => void;
  const held = new Promise<void>(resolve => {
    release = resolve;
  });
  let ready!: (pid: number) => void;
  const blocker = new Promise<number>(resolve => {
    ready = resolve;
  });
  const lock = dbAdmin.transaction(async tx => {
    // Both runtime transactions can read the attempt, but neither can UPDATE it yet.
    await tx.execute(sql`lock table lead_payment_attempts in share mode`);
    const [row] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    ready(row.pid);
    await held;
  });
  const actions: Promise<Result>[] = [];
  try {
    const pid = await Promise.race([blocker, lock.then(() => 0)]);
    const waitForUpdates = (count: number) =>
      vi.waitFor(
        async () => {
          const rows = await dbAdmin.execute<{ pid: number }>(sql`select pid from pg_locks
            where locktype = 'relation' and relation = 'public.lead_payment_attempts'::regclass
              and mode = 'RowExclusiveLock' and not granted
              and ${pid}::int = any(pg_blocking_pids(pid))`);
          expect(rows).toHaveLength(count);
        },
        { timeout: 5000 }
      );
    async function start(action: () => Promise<Result>, count: number) {
      const result = action();
      actions.push(result);
      await Promise.race([
        waitForUpdates(count),
        result.then(() => {
          throw new Error('The cash action finished without reaching the blocked UPDATE.');
        }),
      ]);
    }
    await start(first, 1);
    await start(second, 2);
  } finally {
    release();
    await Promise.allSettled([lock, ...actions]);
  }
  await lock;
  return Promise.all(actions);
}

export function registerCashConcurrencyCases(getAdminDb: () => AdminDb) {
  it.each([
    { first: 'approve', second: 'needs_info', status: 'pending' },
    { first: 'resubmit', second: 'reject', status: 'needs_info' },
    { first: 'needs_info', second: 'needs_info', status: 'needs_info' },
  ] as const)(
    'commits one cash update and audit for $first versus $second from $status',
    async ({ first, second, status }) => {
      const dbAdmin = getAdminDb();
      const tenantId = `pilot-cash-race-${randomUUID()}`;
      try {
        const fixture = await seedPilotSalesTenant(dbAdmin, tenantId, true);
        const { resubmitCashAttemptAction, verifyCashAttemptAction } =
          await import('@/features/admin/verification/actions/verification');
        const target = await seedPaymentAttempt(dbAdmin, fixture, 'race');
        const sameStatus = first === second;
        const version = sameStatus ? '2099-01-01 00:00:00.123456' : '2025-01-01 00:00:00.123456';
        await dbAdmin
          .update(leadPaymentAttempts)
          .set({ status, updatedAt: sql`${version}::timestamp` })
          .where(eq(leadPaymentAttempts.id, target.attemptId));

        const run = (decision: typeof first | typeof second, note: string) => {
          if (decision === 'resubmit') {
            useSession(fixture, 'agent');
            return resubmitCashAttemptAction({ attemptId: target.attemptId, note });
          }
          useSession(fixture, 'staff');
          return verifyCashAttemptAction({ attemptId: target.attemptId, decision, note });
        };
        const [left, right] = await contendOnCashAttempt(
          dbAdmin,
          () => run(first, 'first edit'),
          () => run(second, 'second edit')
        );
        const [winner, loser] = left.success ? [left, right] : [right, left];
        expect(winner).toMatchObject({ success: true });
        expect(loser).toMatchObject({ success: false, code: 'CONFLICT' });

        const stored = await paymentAttemptState(dbAdmin, tenantId, target);
        const winningDecision = left.success ? first : second;
        const winningNote = left.success ? 'first edit' : 'second edit';
        const auditAction =
          winningDecision === 'resubmit'
            ? 'PAYMENT_RESUBMITTED'
            : `VERIFY_PAYMENT_${winningDecision.toUpperCase()}`;
        expect(stored.audit).toMatchObject([
          { action: auditAction, metadata: { previousStatus: status, note: winningNote } },
        ]);
        expect(stored.attempt.status).toBe(
          {
            resubmit: 'pending',
            approve: 'succeeded',
            reject: 'rejected',
            needs_info: 'needs_info',
          }[winningDecision]
        );
        if (sameStatus) {
          const [row] = await dbAdmin
            .select({ token: sql<string>`${leadPaymentAttempts.updatedAt}::text` })
            .from(leadPaymentAttempts)
            .where(eq(leadPaymentAttempts.id, target.attemptId));
          expect(row.token).toBe('2099-01-01 00:00:00.123457');
          expect(stored.attempt.verificationNote).toBe(winningNote);
        }
      } finally {
        await cleanupPilotSalesTenants(dbAdmin, [tenantId]);
      }
    },
    30_000
  );

  it('refuses resubmission by staff or for a lead in another tenant', async () => {
    const dbAdmin = getAdminDb();
    const tenantId = `pilot-cash-actor-${randomUUID()}`;
    const otherTenantId = `pilot-cash-foreign-${randomUUID()}`;
    try {
      const fixture = await seedPilotSalesTenant(dbAdmin, tenantId, true);
      const other = await seedPilotSalesTenant(dbAdmin, otherTenantId, true);
      const local = await seedPaymentAttempt(dbAdmin, fixture, 'rejected', { status: 'rejected' });
      const otherLead = await seedLead(dbAdmin, other, 'foreign-lead');
      // An assigned agent still cannot resubmit an attempt whose lead belongs to another tenant.
      await dbAdmin
        .update(memberLeads)
        .set({ agentId: fixture.agentId })
        .where(eq(memberLeads.id, otherLead));
      const mismatched = await seedPaymentAttempt(dbAdmin, fixture, 'mismatch', {
        status: 'rejected',
      });
      await dbAdmin
        .update(leadPaymentAttempts)
        .set({ leadId: otherLead })
        .where(eq(leadPaymentAttempts.id, mismatched.attemptId));
      const foreign = { ...mismatched, leadId: otherLead };
      const localBefore = await paymentAttemptState(dbAdmin, tenantId, local);
      const foreignBefore = await paymentAttemptState(dbAdmin, tenantId, foreign);
      const { resubmitCashAttemptAction } =
        await import('@/features/admin/verification/actions/verification');

      useSession(fixture, 'staff');
      expect(await resubmitCashAttemptAction({ attemptId: local.attemptId })).toMatchObject({
        success: false,
        code: 'FORBIDDEN',
      });
      useSession(fixture, 'agent');
      const missing = await resubmitCashAttemptAction({ attemptId: `${tenantId}-missing` });
      expect(missing).toMatchObject({ success: false });
      expect(await resubmitCashAttemptAction({ attemptId: foreign.attemptId })).toEqual(missing);
      expect(await paymentAttemptState(dbAdmin, tenantId, local)).toEqual(localBefore);
      expect(await paymentAttemptState(dbAdmin, tenantId, foreign)).toEqual(foreignBefore);
    } finally {
      await cleanupPilotSalesTenants(dbAdmin, [tenantId, otherTenantId]);
    }
  }, 30_000);

  it('resubmits an existing cash attempt with a sub-millisecond timestamp', async () => {
    const dbAdmin = getAdminDb();
    const tenantId = `pilot-cash-precision-${randomUUID()}`;
    try {
      const fixture = await seedPilotSalesTenant(dbAdmin, tenantId, true);
      const target = await seedPaymentAttempt(dbAdmin, fixture, 'precision', {
        status: 'rejected',
      });
      await dbAdmin
        .update(leadPaymentAttempts)
        .set({ updatedAt: sql`timestamp '2025-01-01 00:00:00.123456'` })
        .where(eq(leadPaymentAttempts.id, target.attemptId));
      const { resubmitCashAttemptAction } =
        await import('@/features/admin/verification/actions/verification');
      useSession(fixture, 'agent');

      expect(await resubmitCashAttemptAction({ attemptId: target.attemptId })).toEqual({
        success: true,
      });
      const stored = await paymentAttemptState(dbAdmin, tenantId, target);
      expect(stored.attempt).toMatchObject({ status: 'pending', isResubmission: true });
      expect(stored.audit).toMatchObject([{ action: 'PAYMENT_RESUBMITTED' }]);
    } finally {
      await cleanupPilotSalesTenants(dbAdmin, [tenantId]);
    }
  }, 30_000);
}
