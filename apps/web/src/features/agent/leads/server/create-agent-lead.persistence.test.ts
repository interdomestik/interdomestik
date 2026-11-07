import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  createLead: vi.fn(),
  existing: vi.fn(),
  idempotency: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  and: (...args: unknown[]) => ({ op: 'and', args }),
  eq: (left: unknown, right: unknown) => ({ op: 'eq', left, right }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: 'sql', strings, values }),
  memberLeads: {
    id: 'member_leads.id',
    tenantId: 'member_leads.tenant_id',
    agentId: 'member_leads.agent_id',
    email: 'member_leads.email',
    status: 'member_leads.status',
  },
  withTenantContext: hoisted.withTenantContext,
}));
vi.mock('@interdomestik/domain-leads', () => ({ createLead: hoisted.createLead }));
vi.mock('@/lib/commercial-action-idempotency', () => ({
  runCommercialActionWithIdempotency: hoisted.idempotency,
}));

import { AgentLeadPersistenceError, createAgentLeadCore } from './create-agent-lead';

const authority = mintTestTenantAuthority('tenant-1');
const agent = { authority, userRole: 'agent', agentId: 'agent-1', branchId: 'branch-1' };
const individual = {
  leadKind: 'individual',
  firstName: ' Arta ',
  lastName: 'Krasniqi',
  email: ' Arta.K@Example.com ',
  phone: '+38344111222',
  consentConfirmed: true,
};
const create = (input: unknown, ctx: Partial<typeof agent> = {}) =>
  createAgentLeadCore({ ...agent, ...ctx }, { input, idempotencyKey: 'k1' });

// Astra ACQ-1 P2: the action runner logs thrown errors, and database errors carry SQL parameters.
describe('createAgentLeadCore persistence errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.existing.mockResolvedValue([]);
    hoisted.idempotency.mockImplementation(async ({ execute }) => execute());
    hoisted.withTenantContext.mockImplementation(async (_ctx, callback) =>
      callback({
        select: () => ({ from: () => ({ where: () => ({ limit: hoisted.existing }) }) }),
      })
    );
  });

  async function thrownBy(run: Promise<unknown>): Promise<AgentLeadPersistenceError> {
    const error = await run.then(
      () => null,
      (failure: unknown) => failure
    );
    expect(error).toBeInstanceOf(AgentLeadPersistenceError);
    return error as AgentLeadPersistenceError;
  }

  it('drops the SQL and parameters of a failed lookup', async () => {
    hoisted.existing.mockRejectedValue(
      Object.assign(new Error('Failed query: select ... params: arta.k@example.com'), {
        cause: Object.assign(new Error('connection terminated'), { code: '57P01' }),
      })
    );

    const error = await thrownBy(create(individual));
    expect(error.code).toBe('57P01');
    expect(JSON.stringify({ message: error.message, cause: error.cause })).not.toContain('arta');
  });

  it('drops the contact details of a failed insert', async () => {
    hoisted.createLead.mockRejectedValue(
      new Error('Failed query: insert into member_leads params: Arta,Krasniqi,+38344111222')
    );

    const error = await thrownBy(create(individual));
    expect(error.code).toBeUndefined();
    expect(error.message).not.toContain('38344111222');
  });

  it('drops the request of a failed idempotency reservation', async () => {
    hoisted.idempotency.mockRejectedValue(
      new Error('insert reservation params: arta.k@example.com')
    );

    const error = await thrownBy(create(individual));
    expect(error.message).toBe('Agent lead could not be saved');
  });
});
