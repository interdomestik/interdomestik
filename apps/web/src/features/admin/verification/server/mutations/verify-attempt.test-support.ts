import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  selectRows: vi.fn(),
  selectWhere: vi.fn(),
  decidedRows: vi.fn(),
  paidRows: vi.fn(),
  insertValues: vi.fn(),
  assertNewSalesOpen: vi.fn(),
  rollback: vi.fn(),
  updates: [] as { table: unknown; values: Record<string, unknown> }[],
  convertLeadToMember: vi.fn(),
  notify: vi.fn(),
  inTransaction: false,
}));

vi.mock('@/lib/notifications', () => ({ notifyPaymentVerificationUpdate: hoisted.notify }));
vi.mock('@/lib/member-activation-invite', () => ({
  sendMemberActivationInvite: async () => ({ sent: false, reason: 'email_suppressed' }),
}));
vi.mock('@interdomestik/database/pilot-switch', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database/pilot-switch')>()),
  assertNewSalesOpen: hoisted.assertNewSalesOpen,
}));
vi.mock('@interdomestik/domain-leads/convert', () => ({
  convertLeadToMember: hoisted.convertLeadToMember,
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: async (_authority: unknown, callback: (tx: unknown) => unknown) => {
    hoisted.inTransaction = true;
    try {
      return await callback(createTx());
    } catch (error) {
      hoisted.rollback(error);
      throw error;
    } finally {
      hoisted.inTransaction = false;
    }
  },
}));

import { memberLeads } from '@interdomestik/database/schema/leads';
import type { ProtectedActionContext } from '@/lib/safe-action';

function createTx() {
  const selectChain = {
    from: () => selectChain,
    innerJoin: () => selectChain,
    where: hoisted.selectWhere.mockImplementation(() => selectChain),
    limit: () => hoisted.selectRows(),
  };
  return {
    select: () => selectChain,
    update: (table: unknown) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          hoisted.updates.push({ table, values });
          return { returning: table === memberLeads ? hoisted.paidRows : hoisted.decidedRows };
        },
      }),
    }),
    insert: () => ({ values: hoisted.insertValues }),
  };
}

function contextFor(role: string, branchId: string | null = null): ProtectedActionContext {
  return {
    tenantId: 'tenant-1',
    userRole: role,
    session: { user: { id: 'staff-1', role, branchId } },
    authority: mintTestTenantAuthority('tenant-1'),
    scope: { branchId: null, actorAgentId: null, attributedAgentId: null },
  } as unknown as ProtectedActionContext;
}
const ctx = contextFor('tenant_admin');

function row(status: string, leadStatus = 'payment_pending', method = 'cash') {
  return [
    {
      attempt: { id: 'att-1', leadId: 'lead-1', status, method, amount: 1000, currency: 'EUR' },
      lead: {
        id: 'lead-1',
        agentId: 'agent-1',
        branchId: 'branch-1',
        status: leadStatus,
        firstName: 'A',
        lastName: 'B',
      },
      agentEmail: 'agent@example.test',
    },
  ];
}

const approve = { attemptId: 'att-1', decision: 'approve' as const };
const leadUpdates = () => hoisted.updates.filter(update => update.table === memberLeads);
const verifiedCash = { leadId: 'lead-1', admission: { kind: 'verified_cash', attemptId: 'att-1' } };

export { approve, contextFor, ctx, hoisted, leadUpdates, row, verifiedCash };
