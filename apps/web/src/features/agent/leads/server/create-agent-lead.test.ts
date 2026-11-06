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

import { createAgentLeadCore } from './create-agent-lead';

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

describe('createAgentLeadCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.existing.mockResolvedValue([]);
    hoisted.createLead.mockResolvedValue({ leadId: 'lead_new' });
    hoisted.idempotency.mockImplementation(async ({ execute }) => execute());
    hoisted.withTenantContext.mockImplementation(async (_ctx, callback) =>
      callback({
        select: () => ({ from: () => ({ where: () => ({ limit: hoisted.existing }) }) }),
      })
    );
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
    await expect(create(individual)).resolves.toMatchObject({ code: 'POSSIBLE_DUPLICATE' });
    expect(hoisted.createLead).not.toHaveBeenCalled();
  });

  it('resolves a lost unique-index race through the same duplicate rule', async () => {
    hoisted.existing
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'lead_race', agentId: 'agent-1', branchId: 'branch-1', status: 'new' },
      ]);
    hoisted.createLead.mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
    await expect(create(individual)).resolves.toEqual({
      success: true,
      data: { leadId: 'lead_race', existing: true },
    });
  });

  it('rethrows any other write failure', async () => {
    hoisted.createLead.mockRejectedValue(new Error('db down'));
    await expect(create(individual)).rejects.toThrow('db down');
  });
});
