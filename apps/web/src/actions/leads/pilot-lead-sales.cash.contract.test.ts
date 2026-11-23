import { readPilotSwitch } from '@interdomestik/database/pilot-switch';
import {
  leadPaymentAttempts,
  membershipCards,
  subscriptions,
  user,
} from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanupPilotSalesTenants,
  finishSaleDuringPilotFlip,
  flipPilotSales,
  openPilotSalesContract,
  pilotSalesContractEnabled,
  seedPilotSalesTenant,
} from '../pilot-sales.contract-test-support';
import {
  paymentAttemptState,
  request,
  seedLead,
  seedPaymentAttempt,
  useSession,
} from './pilot-lead-sales.test-support';

describe.runIf(pilotSalesContractEnabled)('lead sales under a restricted PostgreSQL role', () => {
  let contract: Awaited<ReturnType<typeof openPilotSalesContract>> | undefined;
  beforeAll(async () => {
    contract = await openPilotSalesContract();
  });
  afterAll(async () => {
    await contract?.close();
  });

  it('makes a flip wait for cash approval, then fulfills that approval after closure', async () => {
    const { dbAdmin } = contract!;
    const tenantId = `pilot-cash-flip-${randomUUID()}`;
    try {
      const fixture = await seedPilotSalesTenant(dbAdmin, tenantId, true);
      const { resubmitCashAttemptAction, verifyCashAttemptAction } =
        await import('@/features/admin/verification/actions/verification');
      const { withTenantAuthority } =
        await import('@interdomestik/database/tenant-authority-context');
      const admitted = await seedPaymentAttempt(dbAdmin, fixture, 'inflight');
      const later = await seedPaymentAttempt(dbAdmin, fixture, 'later');
      const rejected = await seedPaymentAttempt(dbAdmin, fixture, 'rejected', {
        status: 'rejected',
      });
      const laterBefore = await paymentAttemptState(dbAdmin, tenantId, later);
      const rejectedBefore = await paymentAttemptState(dbAdmin, tenantId, rejected);
      const observed: { beforeConversion?: Awaited<ReturnType<typeof paymentAttemptState>> } = {};
      request.beforeConversion = async () => {
        await vi.waitFor(
          async () => {
            const state = await withTenantAuthority(fixture.staffAuthority, tx =>
              readPilotSwitch(tx, tenantId, 'new_sales')
            );
            expect(state).toMatchObject({ state: 'closed', revision: 2 });
          },
          { timeout: 5000 }
        );
        observed.beforeConversion = await paymentAttemptState(dbAdmin, tenantId, admitted);
      };

      useSession(fixture, 'staff');
      const approve = (attemptId: string) =>
        verifyCashAttemptAction({ attemptId, decision: 'approve' });
      const result = await finishSaleDuringPilotFlip({
        dbAdmin,
        operatorAuthority: fixture.operatorAuthority,
        expectedRevision: 1,
        intercept: hold => {
          request.hold = hold;
        },
        sell: () => approve(admitted.attemptId),
      });
      expect(observed.beforeConversion).toMatchObject({
        lead: { status: 'paid', convertedUserId: null },
        attempt: { status: 'succeeded', verifiedBy: fixture.staffId },
        audit: [{ action: 'VERIFY_PAYMENT_APPROVE', actorId: fixture.staffId }],
      });
      expect(result).toMatchObject({
        success: true,
        status: 'succeeded',
        userId: expect.any(String),
      });
      const fulfilled = await paymentAttemptState(dbAdmin, tenantId, admitted);
      expect(fulfilled.lead).toMatchObject({
        status: 'converted',
        convertedUserId: expect.any(String),
      });
      expect(result).toMatchObject({ userId: fulfilled.lead.convertedUserId });
      expect(fulfilled.attempt).toEqual(observed.beforeConversion?.attempt);
      expect(fulfilled.audit).toEqual(observed.beforeConversion?.audit);

      expect(await approve(later.attemptId)).toMatchObject({ success: false, code: 'CLOSED' });
      expect(await paymentAttemptState(dbAdmin, tenantId, later)).toEqual(laterBefore);
      useSession(fixture, 'agent');
      expect(await resubmitCashAttemptAction({ attemptId: rejected.attemptId })).toMatchObject({
        success: false,
        code: 'CLOSED',
      });
      expect(await paymentAttemptState(dbAdmin, tenantId, rejected)).toEqual(rejectedBefore);
    } finally {
      request.beforeConversion = undefined;
      await cleanupPilotSalesTenants(dbAdmin, [tenantId]);
    }
  }, 30_000);

  it('rolls back approval and its audit when the lead cannot move to paid', async () => {
    const { dbAdmin } = contract!;
    const tenantId = `pilot-cash-conflict-${randomUUID()}`;
    try {
      const fixture = await seedPilotSalesTenant(dbAdmin, tenantId, true);
      const { verifyCashAttemptAction } =
        await import('@/features/admin/verification/actions/verification');
      const target = await seedPaymentAttempt(dbAdmin, fixture, 'lost', { leadStatus: 'lost' });
      const before = await paymentAttemptState(dbAdmin, tenantId, target);
      useSession(fixture, 'staff');

      expect(
        await verifyCashAttemptAction({ attemptId: target.attemptId, decision: 'approve' })
      ).toMatchObject({ success: false, code: 'CONFLICT' });
      expect(await paymentAttemptState(dbAdmin, tenantId, target)).toEqual(before);
    } finally {
      await cleanupPilotSalesTenants(dbAdmin, [tenantId]);
    }
  }, 30_000);

  it('refuses card attempts like missing attempts without changing approval or resubmission state', async () => {
    const { dbAdmin } = contract!;
    const tenantId = `pilot-card-denied-${randomUUID()}`;
    try {
      const fixture = await seedPilotSalesTenant(dbAdmin, tenantId, true);
      const { resubmitCashAttemptAction, verifyCashAttemptAction } =
        await import('@/features/admin/verification/actions/verification');
      const pending = await seedPaymentAttempt(dbAdmin, fixture, 'card-pending', {
        method: 'card',
      });
      const rejected = await seedPaymentAttempt(dbAdmin, fixture, 'card-rejected', {
        method: 'card',
        status: 'rejected',
      });
      const pendingBefore = await paymentAttemptState(dbAdmin, tenantId, pending);
      const rejectedBefore = await paymentAttemptState(dbAdmin, tenantId, rejected);
      const missingId = `${tenantId}-missing-attempt`;

      useSession(fixture, 'staff');
      const approve = (attemptId: string) =>
        verifyCashAttemptAction({ attemptId, decision: 'approve' });
      const approval = await approve(pending.attemptId);
      expect(approval).toMatchObject({ success: false });
      expect(approval).toEqual(await approve(missingId));

      useSession(fixture, 'agent');
      const resubmit = (attemptId: string) => resubmitCashAttemptAction({ attemptId });
      const resubmission = await resubmit(rejected.attemptId);
      expect(resubmission).toMatchObject({ success: false });
      expect(resubmission).toEqual(await resubmit(missingId));

      expect(await paymentAttemptState(dbAdmin, tenantId, pending)).toEqual(pendingBefore);
      expect(await paymentAttemptState(dbAdmin, tenantId, rejected)).toEqual(rejectedBefore);
    } finally {
      await cleanupPilotSalesTenants(dbAdmin, [tenantId]);
    }
  }, 30_000);

  it('retries approved cash after the flip and rejects unverified admission without effects', async () => {
    const { dbAdmin } = contract!;
    const tenantId = `pilot-cash-${randomUUID()}`;
    try {
      const fixture = await seedPilotSalesTenant(dbAdmin, tenantId, true);
      const { convertLeadToMember } = await import('@interdomestik/domain-leads');
      const { verifyCashAttemptAction } =
        await import('@/features/admin/verification/actions/verification');
      const paidId = await seedLead(dbAdmin, fixture, 'paid', 'paid');
      const otherId = await seedLead(dbAdmin, fixture, 'other', 'paid');
      const leadEmail = (id: string) => `${id}@example.test`;
      const admittedId = `${tenantId}-admitted`;
      const pendingId = `${tenantId}-pending`;
      // Seed the durable approval records left when fulfillment has not run yet.
      await dbAdmin.insert(leadPaymentAttempts).values([
        {
          id: admittedId,
          tenantId,
          leadId: paidId,
          method: 'cash',
          status: 'succeeded',
          amount: 2000,
          verifiedBy: fixture.staffId,
          verifiedAt: new Date(),
        },
        {
          id: pendingId,
          tenantId,
          leadId: paidId,
          method: 'cash',
          status: 'pending',
          amount: 2000,
        },
      ]);
      await flipPilotSales(fixture.operatorAuthority, false, 1);

      await expect(
        convertLeadToMember(fixture.staffAuthority, {
          leadId: paidId,
          admission: { kind: 'check' },
        })
      ).rejects.toMatchObject({ code: 'CLOSED' });
      for (const [leadId, attemptId] of [
        [paidId, pendingId],
        [otherId, admittedId],
      ]) {
        await expect(
          convertLeadToMember(fixture.staffAuthority, {
            leadId,
            admission: { kind: 'verified_cash', attemptId },
          })
        ).rejects.toThrow('Lead payment is not verified');
      }
      expect(
        await dbAdmin
          .select()
          .from(user)
          .where(and(eq(user.tenantId, tenantId), eq(user.role, 'member')))
      ).toEqual([]);
      expect(
        await dbAdmin.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId))
      ).toEqual([]);
      expect(
        await dbAdmin.select().from(membershipCards).where(eq(membershipCards.tenantId, tenantId))
      ).toEqual([]);

      useSession(fixture, 'staff');
      const result = await verifyCashAttemptAction({ attemptId: admittedId, decision: 'approve' });
      expect(result).toMatchObject({
        success: true,
        status: 'succeeded',
        userId: expect.any(String),
      });
      const fulfilled = await paymentAttemptState(dbAdmin, tenantId, {
        leadId: paidId,
        attemptId: admittedId,
      });
      const userId = fulfilled.lead.convertedUserId;
      expect(result).toMatchObject({ userId });
      expect(fulfilled.lead.status).toBe('converted');
      expect(fulfilled.audit).toEqual([]);
      expect(
        await dbAdmin
          .select({ id: user.id, email: user.email })
          .from(user)
          .where(and(eq(user.tenantId, tenantId), eq(user.role, 'member')))
      ).toEqual([{ id: userId, email: leadEmail(paidId) }]);
      expect(
        await dbAdmin
          .select({ userId: subscriptions.userId })
          .from(subscriptions)
          .where(eq(subscriptions.tenantId, tenantId))
      ).toEqual([{ userId }]);
      expect(
        await dbAdmin
          .select({ userId: membershipCards.userId })
          .from(membershipCards)
          .where(eq(membershipCards.tenantId, tenantId))
      ).toEqual([{ userId }]);
      expect(
        await convertLeadToMember(fixture.staffAuthority, {
          leadId: paidId,
          admission: { kind: 'verified_cash', attemptId: admittedId },
        })
      ).toBeNull();
    } finally {
      await cleanupPilotSalesTenants(dbAdmin, [tenantId]);
    }
  }, 30_000);
});
