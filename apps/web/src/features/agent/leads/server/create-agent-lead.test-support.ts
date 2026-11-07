import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi } from 'vitest';

// Shared doubles for the createAgentLeadCore suites. Each suite wires them with vi.mock factories
// that import this module, so every suite sees the same instances it asserts on.
export const agentLeadMocks = {
  createLead: vi.fn(),
  existing: vi.fn(),
  idempotency: vi.fn(),
  withTenantContext: vi.fn(),
  referralValues: vi.fn(),
  referralWrite: vi.fn(),
};

export const databaseModule = {
  and: (...args: unknown[]) => ({ op: 'and', args }),
  eq: (left: unknown, right: unknown) => ({ op: 'eq', left, right }),
  inArray: (column: unknown, values: unknown) => ({ op: 'inArray', column, values }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: 'sql', strings, values }),
  auditLog: {},
  memberLeads: {
    id: 'member_leads.id',
    tenantId: 'member_leads.tenant_id',
    agentId: 'member_leads.agent_id',
    email: 'member_leads.email',
    status: 'member_leads.status',
  },
  withTenantContext: agentLeadMocks.withTenantContext,
};
export const domainLeadsModule = { createLead: agentLeadMocks.createLead };
export const idempotencyModule = { runCommercialActionWithIdempotency: agentLeadMocks.idempotency };

export const authority = mintTestTenantAuthority('tenant-1');
export const agent = { authority, userRole: 'agent', agentId: 'agent-1', branchId: 'branch-1' };
export const individual = {
  leadKind: 'individual',
  firstName: ' Arta ',
  lastName: 'Krasniqi',
  email: ' Arta.K@Example.com ',
  phone: '+38344111222',
  consentConfirmed: true,
};

/** A new lead by default: no own lead, a successful insert, and a writable referral. */
export function resetAgentLeadMocks(): void {
  vi.clearAllMocks();
  agentLeadMocks.existing.mockResolvedValue([]);
  agentLeadMocks.createLead.mockResolvedValue({ leadId: 'lead_new' });
  agentLeadMocks.referralWrite.mockResolvedValue(undefined);
  agentLeadMocks.idempotency.mockImplementation(async ({ execute }) => execute());
  agentLeadMocks.withTenantContext.mockImplementation(async (_ctx, callback) =>
    callback({
      select: () => ({ from: () => ({ where: () => ({ limit: agentLeadMocks.existing }) }) }),
      insert: () => ({
        values: (values: unknown) => {
          agentLeadMocks.referralValues(values);
          return { onConflictDoNothing: agentLeadMocks.referralWrite };
        },
      }),
    })
  );
}
