import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  existing: vi.fn(),
  insertValues: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (left: unknown, right: unknown) => ({ eq: [left, right] }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: strings.join('?'),
    values,
  }),
  withTenantContext: mocks.withTenantContext,
}));
vi.mock('@interdomestik/database/schema', () => ({
  memberLeads: { id: 'id', tenantId: 'tenant_id', email: 'email' },
}));
vi.mock('nanoid', () => ({ nanoid: () => 'seed' }));

import { createLead, LeadEmailConflictError } from './create';

const input = {
  firstName: 'Arben',
  lastName: 'Krasniqi',
  email: 'arben@example.com',
  phone: '+38344111222',
  consentNoticeVersion: 'lead-notice-v1',
};
const now = new Date('2026-11-06T10:00:00.000Z');
const agentCtx = { agentId: 'agent-1', branchId: 'branch-1', now } as const;

describe('createLead', () => {
  const authority = mintTestTenantAuthority('tenant-1');

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.existing.mockResolvedValue([]);
    const tx = {
      insert: () => ({ values: mocks.insertValues }),
      select: () => ({ from: () => ({ where: () => ({ limit: mocks.existing }) }) }),
    };
    mocks.withTenantContext.mockImplementation(async (_context, callback) => callback(tx));
  });

  it('inserts the lead under the authority, stamped with the authority tenant', async () => {
    await expect(
      createLead({ authority, ...agentCtx, captureChannel: 'agent_assisted' }, input)
    ).resolves.toEqual({ leadId: 'lead_seed' });

    expect(mocks.withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'lead_seed',
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        branchId: 'branch-1',
        status: 'new',
        leadKind: 'individual',
        consentNoticeVersion: 'lead-notice-v1',
        consentCapturedAt: now,
        consentCapturedBy: 'agent-1',
        captureChannel: 'agent_assisted',
      })
    );
  });

  it('records a public-form lead with no capturing user, a lowercase email and company fields', async () => {
    await createLead(
      { authority, ...agentCtx, captureChannel: 'public_form' },
      {
        ...input,
        email: ' Fleet.Ops@Example.COM ',
        leadKind: 'company',
        companyName: 'Fleet LLC',
        teamSize: '11-25',
      }
    );

    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'fleet.ops@example.com',
        leadKind: 'company',
        companyName: 'Fleet LLC',
        teamSize: '11-25',
        consentCapturedBy: null,
        captureChannel: 'public_form',
      })
    );
  });

  it.each([
    ['missing consent', { ...input, consentNoticeVersion: undefined }],
    ['blank consent', { ...input, consentNoticeVersion: '  ' }],
    ['legacy marker', { ...input, consentNoticeVersion: 'pre-consent-legacy' }],
    ['company without a name', { ...input, leadKind: 'company' as const }],
  ])('refuses %s before touching the database', async (_label, bad) => {
    await expect(
      createLead({ authority, ...agentCtx, captureChannel: 'agent_assisted' }, bad as never)
    ).rejects.toThrow();

    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it('fails closed without a write for an unrecognized authority', async () => {
    await expect(
      createLead(
        {
          authority: { tenantId: 'tenant-1' } as never,
          ...agentCtx,
          captureChannel: 'agent_assisted',
        },
        input
      )
    ).rejects.toThrow('Unrecognized tenant authority');

    expect(mocks.withTenantContext).not.toHaveBeenCalled();
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it('validates input before touching the database', async () => {
    await expect(
      createLead(
        { authority, ...agentCtx, captureChannel: 'agent_assisted' },
        { ...input, phone: '1' }
      )
    ).rejects.toThrow();

    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });

  it('refuses an existing lead of the tenant written in another letter case', async () => {
    mocks.existing.mockResolvedValue([{ id: 'lead_legacy' }]);
    const created = createLead(
      { authority, ...agentCtx, captureChannel: 'public_form' },
      { ...input, email: 'Arben@Example.com' }
    );

    await expect(created).rejects.toBeInstanceOf(LeadEmailConflictError);
    await expect(created).rejects.toMatchObject({ code: '23505' });
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });
});
