import { convertLeadToClient, updateLeadStatus } from '@/features/agent/leads/actions';
import { authorizedSession, STAFF_A } from '@/test/safe-action-harness';
import { leadPaymentAttempts, memberLeads } from '@interdomestik/database/schema';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startPaymentAction } from './payment';
import { updateLeadStatusAction } from './update';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
  findLead: vi.fn(),
  lockSwitch: vi.fn(),
  update: vi.fn(),
  updateValues: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.audit }));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: mocks.transaction,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

const agent = { id: 'agent-a', tenantId: 'tenant-a', branchId: 'branch-a', role: 'agent' };
const payment = {
  leadId: 'lead-a',
  method: 'cash',
  priceId: 'default_membership',
  amountCents: 15000,
};
const saleActions = [
  {
    name: 'startPaymentAction',
    call: () => startPaymentAction(payment),
    status: 'payment_pending',
    revalidates: false,
  },
  {
    name: 'updateLeadStatusAction for payment',
    call: () => updateLeadStatusAction({ leadId: payment.leadId, status: 'payment_pending' }),
    status: 'payment_pending',
    revalidates: false,
  },
  {
    name: 'agent updateLeadStatus for payment',
    call: () => updateLeadStatus(payment.leadId, 'payment_pending'),
    status: 'payment_pending',
    revalidates: true,
  },
  {
    name: 'updateLeadStatusAction for conversion',
    call: () => updateLeadStatusAction({ leadId: payment.leadId, status: 'converted' }),
    status: 'converted',
    revalidates: false,
  },
  {
    name: 'agent updateLeadStatus for conversion',
    call: () => updateLeadStatus(payment.leadId, 'converted'),
    status: 'converted',
    revalidates: true,
  },
  {
    name: 'convertLeadToClient',
    call: () => convertLeadToClient(payment.leadId),
    status: 'converted',
    revalidates: true,
  },
] as const;

describe('member lead sales actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authorize.mockResolvedValue(authorizedSession(agent));
    mocks.audit.mockResolvedValue({ ok: true });
    mocks.findLead.mockResolvedValue({ id: payment.leadId, status: 'contacted', notes: null });
    mocks.lockSwitch.mockResolvedValue([{ value: { enabled: false, revision: 1 } }]);
    mocks.update.mockReturnValue({ set: mocks.updateValues });
    mocks.updateValues.mockReturnValue({
      where: () => ({ returning: async () => [{ id: payment.leadId }] }),
    });
    mocks.insert.mockReturnValue({ values: mocks.insertValues });
    mocks.transaction.mockImplementation(async (_authority, work) =>
      work({
        query: { memberLeads: { findFirst: mocks.findLead } },
        select: () => ({
          from: () => ({ where: () => ({ limit: () => ({ for: mocks.lockSwitch }) }) }),
        }),
        update: mocks.update,
        insert: mocks.insert,
      })
    );
  });

  it.each(saleActions)('$name responds CLOSED without writes or revalidation', async ({ call }) => {
    expect(await call()).toEqual({
      success: false,
      code: 'CLOSED',
      error: 'pricing.CLOSED',
    });
    expect(mocks.lockSwitch).toHaveBeenCalledExactlyOnceWith('share');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it.each(saleActions)('$name preserves the open path', async ({ call, status, revalidates }) => {
    const session = authorizedSession(agent);
    mocks.authorize.mockResolvedValue(session);
    mocks.lockSwitch.mockResolvedValue([{ value: { enabled: true, revision: 2 } }]);

    expect(await call()).toMatchObject({ success: true });
    expect(
      mocks.transaction.mock.calls.every(([authority]) => authority === session.authority)
    ).toBe(true);
    expect(mocks.lockSwitch).toHaveBeenCalledExactlyOnceWith('share');
    expect(mocks.lockSwitch).toHaveBeenCalledBefore(mocks.update);
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith(memberLeads);
    expect(mocks.updateValues).toHaveBeenCalledWith(expect.objectContaining({ status }));
    if (status === 'payment_pending') {
      expect(mocks.insert).toHaveBeenCalledExactlyOnceWith(leadPaymentAttempts);
      expect(mocks.insertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          leadId: payment.leadId,
          tenantId: agent.tenantId,
          method: 'cash',
          status: 'pending',
        })
      );
    } else {
      expect(mocks.insert).not.toHaveBeenCalled();
    }
    expect(mocks.revalidate).toHaveBeenCalledTimes(revalidates ? 1 : 0);
  });

  it('denies a non-agent before opening any lead transaction', async () => {
    mocks.authorize.mockResolvedValue(authorizedSession(STAFF_A));

    const responses = await Promise.allSettled(saleActions.map(({ call }) => call()));

    for (const response of responses) {
      if (response.status === 'fulfilled') {
        expect(response.value).toMatchObject({ success: false, code: 'UNAUTHORIZED' });
      } else {
        expect(response.reason).toMatchObject({ message: 'Lead not found or access denied' });
      }
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
