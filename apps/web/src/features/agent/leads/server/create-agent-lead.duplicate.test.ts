import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  createLead: vi.fn(),
  existing: vi.fn(),
  idempotency: vi.fn(),
  withTenantContext: vi.fn(),
  referralValues: vi.fn(),
  referralWrite: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  and: (...args: unknown[]) => ({ op: 'and', args }),
  eq: (left: unknown, right: unknown) => ({ op: 'eq', left, right }),
  inArray: (column: unknown, values: unknown) => ({ op: 'inArray', column, values }),
  auditLog: {},
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

const foreign = { id: 'lead_foreign', agentId: 'agent-2', branchId: 'branch-0', status: 'new' };
const indexConflict = { code: '23505', constraint_name: 'idx_leads_tenant_email' };
const caseVariant = Object.assign(new Error('A lead with this email already exists'), {
  name: 'LeadEmailConflictError',
  code: '23505',
});

// Astra ACQ-1 P1 (option A): one answer for every out-of-scope conflict, with a durable referral.
describe('createAgentLeadCore possible duplicates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.existing.mockResolvedValue([foreign]);
    hoisted.referralWrite.mockResolvedValue(undefined);
    hoisted.idempotency.mockImplementation(async ({ execute }) => execute());
    hoisted.withTenantContext.mockImplementation(async (_ctx, callback) =>
      callback({
        select: () => ({ from: () => ({ where: () => ({ limit: hoisted.existing }) }) }),
        insert: () => ({
          values: (values: unknown) => {
            hoisted.referralValues(values);
            return { onConflictDoNothing: hoisted.referralWrite };
          },
        }),
      })
    );
  });

  it.each([
    ['another agent', { ...foreign, branchId: 'branch-1' }, indexConflict],
    ['another branch', { ...foreign, agentId: 'agent-1' }, indexConflict],
    [
      'a closed own lead',
      { ...foreign, agentId: 'agent-1', branchId: 'branch-1', status: 'lost' },
      indexConflict,
    ],
    ['a case variant', foreign, caseVariant],
    ['a lost race to a foreign lead', foreign, indexConflict],
  ])('answers %s with one identical payload', async (_label, row, failure) => {
    hoisted.existing.mockResolvedValue([row]);
    hoisted.createLead.mockRejectedValue(failure);

    await expect(create(individual)).resolves.toEqual({
      success: false,
      code: 'POSSIBLE_DUPLICATE',
      error: 'A lead with this email already exists and needs review.',
    });
  });

  it('records a referral with references only, keyed to the request', async () => {
    hoisted.createLead.mockRejectedValue(indexConflict);

    await create(individual);
    await create(individual);
    const [first, second] = hoisted.referralValues.mock.calls.map(([values]) => values);
    expect(first).toMatchObject({
      tenantId: 'tenant-1',
      actorId: 'agent-1',
      actorRole: 'agent',
      action: 'AGENT_LEAD_POSSIBLE_DUPLICATE',
      entityType: 'member_lead',
      entityId: 'lead_foreign',
      metadata: { submittingBranchId: 'branch-1', review: 'pending' },
    });
    expect(second.id).toBe(first.id);
    expect(JSON.stringify(first)).not.toMatch(/arta|krasniqi|38344111222/i);
  });

  it('gives another request its own referral', async () => {
    hoisted.createLead.mockRejectedValue(indexConflict);

    await create(individual);
    await createAgentLeadCore(agent, { input: individual, idempotencyKey: 'k2' });
    const [first, second] = hoisted.referralValues.mock.calls.map(([values]) => values);
    expect(second.id).not.toBe(first.id);
  });

  it('fails the request when the referral cannot be written', async () => {
    hoisted.createLead.mockRejectedValue(indexConflict);
    hoisted.referralWrite.mockRejectedValue(
      new Error('insert into audit_log params: lead_foreign')
    );

    await expect(create(individual)).rejects.toBeInstanceOf(AgentLeadPersistenceError);
  });

  it('keeps any other unique violation a persistence failure, without a referral', async () => {
    hoisted.createLead.mockRejectedValue({ code: '23505', constraint_name: 'member_leads_pkey' });

    await expect(create(individual)).rejects.toBeInstanceOf(AgentLeadPersistenceError);
    expect(hoisted.referralValues).not.toHaveBeenCalled();
  });
});
