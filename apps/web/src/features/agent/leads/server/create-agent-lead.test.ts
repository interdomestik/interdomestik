import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

vi.mock(
  '@interdomestik/database',
  async () => (await import('./create-agent-lead.test-support')).databaseModule
);
vi.mock(
  '@interdomestik/domain-leads',
  async () => (await import('./create-agent-lead.test-support')).domainLeadsModule
);
vi.mock(
  '@/lib/commercial-action-idempotency',
  async () => (await import('./create-agent-lead.test-support')).idempotencyModule
);

import { AgentLeadPersistenceError, createAgentLeadCore } from './create-agent-lead';
import {
  agent,
  agentLeadMocks as hoisted,
  authority,
  individual,
  resetAgentLeadMocks,
} from './create-agent-lead.test-support';

const create = (input: unknown, ctx: Partial<typeof agent> = {}) =>
  createAgentLeadCore({ ...agent, ...ctx }, { input, idempotencyKey: 'k1' });

describe('createAgentLeadCore', () => {
  beforeEach(() => {
    resetAgentLeadMocks();
  });

  it('creates an agent-assisted lead with the normalized email and the stored notice version', async () => {
    await expect(create(individual)).resolves.toEqual({
      success: true,
      data: { leadId: 'lead_new', existing: false },
    });
    expect(hoisted.createLead).toHaveBeenCalledWith(
      { authority, agentId: 'agent-1', branchId: 'branch-1', captureChannel: 'agent_assisted' },
      expect.objectContaining({
        firstName: 'Arta',
        email: 'arta.k@example.com',
        leadKind: 'individual',
        companyName: undefined,
        source: 'agent_workspace',
        consentNoticeVersion: 'lead-notice-v1',
      })
    );
    expect(hoisted.idempotency).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'agent-lead.create',
        idempotencyKey: 'k1',
        scope: { kind: 'tenant', authority, actorUserId: 'agent-1' },
        requestFingerprint: expect.objectContaining({ branchId: 'branch-1' }),
      })
    );
  });

  it('keeps company fields only for a company lead', async () => {
    await create({ ...individual, leadKind: 'company', companyName: 'Fleet', teamSize: '11-25' });
    expect(hoisted.createLead.mock.calls[0]?.[1]).toMatchObject({
      leadKind: 'company',
      companyName: 'Fleet',
      teamSize: '11-25',
    });
  });

  it.each([
    ['member', { userRole: 'member', agentId: null }, 'FORBIDDEN'],
    ['staff', { userRole: 'staff', agentId: null }, 'FORBIDDEN'],
    ['auditor', { userRole: 'auditor', agentId: null }, 'FORBIDDEN'],
    ['global_support', { userRole: 'global_support', agentId: null }, 'FORBIDDEN'],
    ['branch_manager', { userRole: 'branch_manager' }, 'FORBIDDEN'],
    ['a branchless agent', { branchId: null }, 'BRANCH_REQUIRED'],
  ])('refuses %s without a write', async (_label, ctx, code) => {
    await expect(create(individual, ctx as Partial<typeof agent>)).resolves.toMatchObject({
      success: false,
      code,
    });
    expect(hoisted.idempotency).not.toHaveBeenCalled();
    expect(hoisted.createLead).not.toHaveBeenCalled();
  });

  it.each([
    ['missing consent', { ...individual, consentConfirmed: undefined }],
    ['unchecked consent', { ...individual, consentConfirmed: false }],
    ['a company without a name', { ...individual, leadKind: 'company' }],
    ['an invalid email', { ...individual, email: 'not-an-email' }],
  ])('refuses %s as an invalid payload', async (_label, input) => {
    await expect(create(input)).resolves.toMatchObject({ success: false, code: 'INVALID_PAYLOAD' });
    expect(hoisted.createLead).not.toHaveBeenCalled();
  });

  it('requires a request key so a double submit replays one result', async () => {
    await expect(createAgentLeadCore(agent, { input: individual })).resolves.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REQUIRED',
    });
    expect(hoisted.idempotency).not.toHaveBeenCalled();
  });

  it("returns the agent's own open lead for the same email instead of a second row", async () => {
    hoisted.existing.mockResolvedValue([
      { id: 'lead_old', agentId: 'agent-1', branchId: 'branch-1', status: 'new' },
    ]);
    await expect(create(individual)).resolves.toEqual({
      success: true,
      data: { leadId: 'lead_old', existing: true },
    });
    expect(hoisted.createLead).not.toHaveBeenCalled();
  });

  it.each([
    ['another agent', { id: 'lead_x', agentId: 'agent-2', branchId: 'branch-1', status: 'new' }],
    ['another branch', { id: 'lead_x', agentId: 'agent-1', branchId: 'branch-0', status: 'new' }],
    [
      'a closed lead',
      { id: 'lead_x', agentId: 'agent-1', branchId: 'branch-1', status: 'converted' },
    ],
  ])('flags a lead of %s as a possible duplicate, never merged', async (_label, row) => {
    hoisted.existing.mockResolvedValue([row]);
    hoisted.createLead.mockRejectedValue({
      code: '23505',
      constraint_name: 'idx_leads_tenant_email',
    });
    await expect(create(individual)).resolves.toMatchObject({ code: 'POSSIBLE_DUPLICATE' });
  });

  it('resolves a lost unique-index race through the same duplicate rule', async () => {
    hoisted.existing
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'lead_race', agentId: 'agent-1', branchId: 'branch-1', status: 'new' },
      ]);
    hoisted.createLead.mockRejectedValue({
      code: '23505',
      constraint_name: 'idx_leads_tenant_email',
    });
    await expect(create(individual)).resolves.toEqual({
      success: true,
      data: { leadId: 'lead_race', existing: true },
    });
  });

  it('rethrows any other write failure without its details', async () => {
    hoisted.createLead.mockRejectedValue(new Error('db down'));
    await expect(create(individual)).rejects.toThrow('Agent lead could not be saved');
  });
});

// Astra ACQ-1 P2: the action runner logs thrown errors, and database errors carry SQL parameters.
describe('createAgentLeadCore persistence errors', () => {
  beforeEach(() => {
    resetAgentLeadMocks();
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

const foreign = { id: 'lead_foreign', agentId: 'agent-2', branchId: 'branch-0', status: 'new' };
const indexConflict = { code: '23505', constraint_name: 'idx_leads_tenant_email' };
const caseVariant = Object.assign(new Error('A lead with this email already exists'), {
  name: 'LeadEmailConflictError',
  code: '23505',
});

// Astra ACQ-1 P1 (option A): one answer for every out-of-scope conflict, with a durable referral.
describe('createAgentLeadCore possible duplicates', () => {
  beforeEach(() => {
    resetAgentLeadMocks();
    hoisted.existing.mockResolvedValue([foreign]);
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

  it('keeps a separate referral for an edited email under the same request key', async () => {
    hoisted.createLead.mockRejectedValue(indexConflict);

    await create(individual);
    hoisted.existing.mockResolvedValue([{ ...foreign, id: 'lead_other' }]);
    await create({ ...individual, email: 'someone.else@example.com' });
    const [first, second] = hoisted.referralValues.mock.calls.map(([values]) => values);
    expect([first.entityId, second.entityId]).toEqual(['lead_foreign', 'lead_other']);
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
