import { LEAD_NOTICE_VERSION } from '@/features/agent/leads/lead-notice';
import { assertNewSalesOpen, readPilotSwitch } from '@interdomestik/database/pilot-switch';
import {
  auditLog,
  leadPaymentAttempts,
  memberLeads,
  membershipCards,
  subscriptions,
  user,
} from '@interdomestik/database/schema';
import type { TenantTransaction } from '@interdomestik/database/tenant';
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

const request = vi.hoisted(() => ({
  authenticate: vi.fn(),
  hold: undefined as ((tx: TenantTransaction) => Promise<void>) | undefined,
  beforeConversion: undefined as (() => Promise<void>) | undefined,
}));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: request.authenticate }));
vi.mock('@/lib/member-activation-invite', () => ({
  sendMemberActivationInvite: async () => ({ sent: false, reason: 'email_suppressed' }),
}));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@interdomestik/database/pilot-switch', async original => {
  const actual = await original<typeof import('@interdomestik/database/pilot-switch')>();
  const check: typeof assertNewSalesOpen = async (tx, tenant) => {
    await actual.assertNewSalesOpen(tx, tenant);
    await request.hold?.(tx);
  };
  return { ...actual, assertNewSalesOpen: check };
});
vi.mock('@interdomestik/domain-leads/convert', async original => {
  const actual = await original<typeof import('@interdomestik/domain-leads/convert')>();
  const convertLeadToMember: typeof actual.convertLeadToMember = async (authority, input) => {
    await request.beforeConversion?.();
    return actual.convertLeadToMember(authority, input);
  };
  return { ...actual, convertLeadToMember };
});

type AdminDb = Awaited<ReturnType<typeof openPilotSalesContract>>['dbAdmin'];
type Fixture = Awaited<ReturnType<typeof seedPilotSalesTenant>>;
type SessionRole = 'agent' | 'staff';
function useSession(fixture: Fixture, role: SessionRole = 'agent') {
  const id = role === 'agent' ? fixture.agentId : fixture.staffId;
  request.authenticate.mockResolvedValue({
    authority: role === 'agent' ? fixture.agentAuthority : fixture.staffAuthority,
    session: { user: { id, role, branchId: fixture.branchId, tenantId: fixture.tenantId } },
  });
}

async function seedLead(
  dbAdmin: AdminDb,
  { tenantId, branchId, agentId }: Fixture,
  suffix: string,
  status: (typeof memberLeads.$inferInsert)['status'] = 'new'
) {
  const leadId = `${tenantId}-${suffix}`;
  await dbAdmin.insert(memberLeads).values({
    id: leadId,
    tenantId,
    branchId,
    agentId,
    firstName: 'Fixture',
    lastName: 'Lead',
    email: `${leadId}@example.test`,
    phone: '+38349000000',
    status,
    consentNoticeVersion: LEAD_NOTICE_VERSION,
    consentCapturedAt: new Date(),
    consentCapturedBy: agentId,
    captureChannel: 'agent_assisted',
  });
  return leadId;
}

async function seedPaymentAttempt(
  dbAdmin: AdminDb,
  fixture: Fixture,
  suffix: string,
  {
    leadStatus = 'payment_pending',
    method = 'cash',
    status = 'pending',
  }: {
    leadStatus?: (typeof memberLeads.$inferInsert)['status'];
    method?: 'card' | 'cash';
    status?: 'pending' | 'rejected';
  } = {}
) {
  const leadId = await seedLead(dbAdmin, fixture, `${suffix}-lead`, leadStatus);
  const attemptId = `${fixture.tenantId}-${suffix}-attempt`;
  await dbAdmin.insert(leadPaymentAttempts).values({
    id: attemptId,
    tenantId: fixture.tenantId,
    leadId,
    method,
    status,
    amount: 2000,
  });
  return { leadId, attemptId };
}

async function paymentAttemptState(
  dbAdmin: AdminDb,
  tenantId: string,
  { leadId, attemptId }: { leadId: string; attemptId: string }
) {
  const [lead] = await dbAdmin.select().from(memberLeads).where(eq(memberLeads.id, leadId));
  const [attempt] = await dbAdmin
    .select()
    .from(leadPaymentAttempts)
    .where(eq(leadPaymentAttempts.id, attemptId));
  const audit = await dbAdmin
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.tenantId, tenantId), eq(auditLog.entityId, attemptId)));
  return { lead, attempt, audit };
}

describe.runIf(pilotSalesContractEnabled)('lead sales under a restricted PostgreSQL role', () => {
  let contract: Awaited<ReturnType<typeof openPilotSalesContract>> | undefined;
  beforeAll(async () => {
    contract = await openPilotSalesContract();
  });
  afterAll(async () => {
    await contract?.close();
  });

  it('isolates S1/S1b across tenants and finishes an in-flight sale before closing the switch', async () => {
    const { dbAdmin } = contract!;
    const tenantIds = [`pilot-lead-closed-${randomUUID()}`, `pilot-lead-open-${randomUUID()}`];
    try {
      const a = await seedPilotSalesTenant(dbAdmin, tenantIds[0], false);
      const b = await seedPilotSalesTenant(dbAdmin, tenantIds[1], true);
      const { startPaymentAction } = await import('./payment');
      const { updateLeadStatusAction } = await import('./update');
      const { updateLeadStatus } = await import('@/features/agent/leads/actions');
      const { withTenantAuthority } =
        await import('@interdomestik/database/tenant-authority-context');
      const aLead = await seedLead(dbAdmin, a, 'closed');
      const bLead = await seedLead(dbAdmin, b, 'inflight');
      const laterLead = await seedLead(dbAdmin, b, 'after-close');
      const start = (leadId: string) =>
        startPaymentAction({ leadId, amountCents: 2000, method: 'cash', priceId: 'standard' });
      const leadWrites = async (id: string, status: string, attempts: number) => {
        expect(
          await dbAdmin
            .select({ status: memberLeads.status })
            .from(memberLeads)
            .where(eq(memberLeads.id, id))
        ).toEqual([{ status }]);
        expect(
          await dbAdmin.select().from(leadPaymentAttempts).where(eq(leadPaymentAttempts.leadId, id))
        ).toHaveLength(attempts);
      };
      expect(
        await withTenantAuthority(a.agentAuthority, tx =>
          readPilotSwitch(tx, b.tenantId, 'new_sales')
        )
      ).toMatchObject({ state: 'closed', wellFormed: false });
      useSession(a);
      expect(await start(aLead)).toMatchObject({ success: false, code: 'CLOSED' });
      expect(await updateLeadStatus(aLead, 'payment_pending')).toMatchObject({
        success: false,
        code: 'CLOSED',
      });
      expect(await updateLeadStatusAction({ leadId: aLead, status: 'converted' })).toMatchObject({
        success: false,
        code: 'CLOSED',
      });
      expect(await start(bLead)).toMatchObject({ success: false });
      await leadWrites(aLead, 'new', 0);
      await leadWrites(bLead, 'new', 0);

      useSession(b, 'staff');
      expect(await start(bLead)).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
      await leadWrites(bLead, 'new', 0);
      useSession(b);
      expect(
        await startPaymentAction({
          leadId: bLead,
          amountCents: 2000,
          method: 'cash',
          priceId: 'standard',
          tenantId: a.tenantId,
        })
      ).toMatchObject({ success: false });
      await leadWrites(bLead, 'new', 0);

      expect(
        await finishSaleDuringPilotFlip({
          dbAdmin,
          operatorAuthority: b.operatorAuthority,
          expectedRevision: 1,
          intercept: hold => {
            request.hold = hold;
          },
          sell: () => start(bLead),
        })
      ).toMatchObject({ success: true });
      await leadWrites(bLead, 'payment_pending', 1);
      expect(await start(laterLead)).toMatchObject({ success: false, code: 'CLOSED' });
      await leadWrites(laterLead, 'new', 0);
    } finally {
      await cleanupPilotSalesTenants(dbAdmin, tenantIds);
    }
  }, 30_000);

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
