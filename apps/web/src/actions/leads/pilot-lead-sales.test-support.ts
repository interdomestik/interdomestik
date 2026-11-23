import { LEAD_NOTICE_VERSION } from '@/features/agent/leads/lead-notice';
import type { assertNewSalesOpen } from '@interdomestik/database/pilot-switch';
import { auditLog, leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema';
import type { TenantTransaction } from '@interdomestik/database/tenant';
import { and, eq } from 'drizzle-orm';
import { vi } from 'vitest';
import type {
  openPilotSalesContract,
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

export { paymentAttemptState, request, seedLead, seedPaymentAttempt, useSession };
