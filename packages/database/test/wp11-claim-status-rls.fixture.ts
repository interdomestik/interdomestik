import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import type { TestContext } from 'node:test';

import { eq, inArray, sql } from 'drizzle-orm';

import { claimLifecycleFieldsForStatus } from '../src/claim-lifecycle';
import type { ClaimStatus } from '../src/constants';
import { assertDisposableUrl } from '../src/disposable-client';
import {
  auditLog,
  claimEscalationAgreements,
  claimRecoveryNoFeeEvidence,
  claimResponseRequests,
  claims,
  claimStageHistory,
  domainEvents,
  notificationDeliveries,
  notifications,
  serviceUsage,
  user,
} from '../src/schema';
import { quoteIdentifier, TEST_DB_ROLE } from './rls-test-connection';
import { KS_TENANT_ID, openS8RestrictedSession } from './s8-claim-restricted-rls.fixture';

type Session = NonNullable<Awaited<ReturnType<typeof openS8RestrictedSession>>>;
export type StatusTestTransaction = Parameters<Session['adminDb']['transaction']>[0] extends (
  tx: infer Tx
) => Promise<unknown>
  ? Tx
  : never;

export async function withStatusFixture(
  t: TestContext,
  run: (fixture: StatusFixture) => Promise<void>
) {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) assertDisposableUrl(databaseUrl);
  const session = await openS8RestrictedSession(t, { DB_MAX_CONNECTIONS: '4' });
  if (!session) return;
  const fixture = createStatusFixture(session);
  const { adminDb } = session;
  const role = quoteIdentifier(TEST_DB_ROLE);
  try {
    // Existing table grants exercise the read, write and lock operations used by the command.
    const existing = [
      'grant select on "user", subscriptions, membership_plans, sponsor_terms, sponsor_roster_entries, sponsor_handover_intents, sponsor_term_revisions, sponsor_revision_decisions, claim_escalation_agreements, claim_recovery_no_fee_evidence, claim_transition_evidence, user_notification_preferences, push_subscriptions, tenants, service_usage, domain_events',
      'grant insert on claim_stage_history, domain_events, audit_log, notifications, service_usage, claim_escalation_agreements',
      'grant select (id) on notifications',
      'grant update on claim_escalation_agreements',
      ...[
        'user',
        'subscriptions',
        'membership_plans',
        'sponsor_terms',
        'sponsor_roster_entries',
        'claim_recovery_no_fee_evidence',
        'claim_transition_evidence',
      ].map(table => `grant update (id) on ${quoteIdentifier(table)}`),
    ];
    // WP-11 leaves DELETE ungranted, and limits the request table's UPDATE to answer columns.
    const added = [
      'grant select, insert, update on notification_deliveries',
      'grant select, insert on claim_response_requests',
      'grant update (answered_at, answered_by, answer_kind, answer_message_id) on claim_response_requests',
    ];
    for (const grant of [...existing, ...added]) {
      await adminDb.execute(sql.raw(`${grant} to ${role}`));
    }
    await adminDb.update(user).set({ role: 'branch_manager' }).where(eq(user.id, fixture.ownerId));
    await adminDb.update(user).set({ role: 'tenant_admin' }).where(eq(user.id, fixture.adminId));
    await adminDb.insert(user).values(
      [fixture.staffId, fixture.peerStaffId].map(id => ({
        id,
        tenantId: KS_TENANT_ID,
        name: 'WP-11 staff test',
        email: `${id}@example.test`,
        emailVerified: false,
        role: 'staff',
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
    await run(fixture);
  } finally {
    try {
      await fixture.cleanup();
    } finally {
      await session.close();
    }
  }
}

function createStatusFixture({ adminDb, dbRls, fixture }: Session) {
  const ownerId = fixture.ks.userId;
  const adminId = fixture.mk.userId;
  const staffId = fixture.newId('status_staff');
  const peerStaffId = fixture.newId('status_peer');
  const claimIds: string[] = [];

  async function newClaim(status: ClaimStatus, staffId: string | null = null) {
    const claimId = fixture.newId('wp11_claim');
    claimIds.push(claimId);
    await adminDb.insert(claims).values({
      id: claimId,
      tenantId: KS_TENANT_ID,
      userId: ownerId,
      staffId,
      title: 'WP-11 contract claim',
      companyName: 'Test company',
      category: 'property',
      ...claimLifecycleFieldsForStatus(status),
    });
    await adminDb.insert(claimResponseRequests).values({
      id: fixture.newId('wp11_request'),
      tenantId: KS_TENANT_ID,
      claimId,
      kind: 'claim_submitted',
      requestedAt: new Date(),
    });
    return claimId;
  }

  async function cleanup() {
    await adminDb
      .delete(notificationDeliveries)
      .where(inArray(notificationDeliveries.claimId, claimIds));
    await adminDb.delete(notifications).where(eq(notifications.userId, ownerId));
    await adminDb
      .delete(claimResponseRequests)
      .where(inArray(claimResponseRequests.claimId, claimIds));
    await adminDb.delete(claimStageHistory).where(inArray(claimStageHistory.claimId, claimIds));
    await adminDb.delete(auditLog).where(inArray(auditLog.entityId, claimIds));
    await adminDb.delete(domainEvents).where(inArray(domainEvents.entityId, claimIds));
    await adminDb
      .delete(claimRecoveryNoFeeEvidence)
      .where(inArray(claimRecoveryNoFeeEvidence.claimId, claimIds));
    await adminDb
      .delete(claimEscalationAgreements)
      .where(inArray(claimEscalationAgreements.claimId, claimIds));
    await adminDb.delete(serviceUsage).where(eq(serviceUsage.userId, ownerId));
    await adminDb.delete(claims).where(inArray(claims.id, claimIds));
    await adminDb.delete(user).where(inArray(user.id, [staffId, peerStaffId]));
  }

  return {
    adminDb,
    dbRls,
    ownerId,
    adminId,
    staffId,
    peerStaffId,
    newId: fixture.newId,
    newClaim,
    cleanup,
  };
}

export type StatusFixture = ReturnType<typeof createStatusFixture>;

export function gate() {
  let open = () => {};
  const promise = new Promise<void>(resolve => {
    open = resolve;
  });
  return { open, promise };
}

export async function waitForClaimLock(
  fixture: StatusFixture,
  holderPid: number,
  signal: AbortSignal
) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    const [waiter] = await fixture.dbRls.execute<{ pid: number }>(sql`
      select pid from pg_stat_activity
      where datname = current_database() and ${holderPid} = any(pg_blocking_pids(pid))
      limit 1
    `);
    if (waiter) return waiter.pid;
    await sleep(20, undefined, { signal });
  }
  assert.fail('Expected a second connection to wait on the status lock');
}

export async function whileClaimWriterHoldsLock<T>(
  fixture: StatusFixture,
  signal: AbortSignal,
  prepare: Parameters<StatusFixture['adminDb']['transaction']>[0],
  compete: () => Promise<T>,
  whileWaiting?: (waiterPid: number) => Promise<void>
): Promise<T> {
  const ready = gate();
  const release = gate();
  let holderPid = 0;
  const holder = fixture.adminDb.transaction(async tx => {
    const [backend] = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    holderPid = backend.pid;
    await prepare(tx);
    ready.open();
    await release.promise;
  });
  const holderSettled = Promise.allSettled([holder]);
  let competitor: Promise<T> | undefined;
  try {
    await Promise.race([ready.promise, holder]);
    competitor = compete();
    const waiterPid = await Promise.race([
      waitForClaimLock(fixture, holderPid, signal),
      competitor.then(() => assert.fail('The command finished instead of waiting on the lock')),
    ]);
    await whileWaiting?.(waiterPid);
    release.open();
    await holder;
    return await competitor;
  } finally {
    release.open();
    await holderSettled;
    if (competitor) await Promise.allSettled([competitor]);
  }
}
