import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insertValues: vi.fn(),
  withTenantContext: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({ withTenantContext: mocks.withTenantContext }));
vi.mock('@interdomestik/database/schema', () => ({ memberLeads: { table: 'memberLeads' } }));
vi.mock('nanoid', () => ({ nanoid: () => 'seed' }));

import { createLead } from './create';

const input = {
  firstName: 'Arben',
  lastName: 'Krasniqi',
  email: 'arben@example.com',
  phone: '+38344111222',
};

describe('createLead', () => {
  const authority = mintTestTenantAuthority('tenant-1');

  beforeEach(() => {
    vi.clearAllMocks();
    const tx = { insert: () => ({ values: mocks.insertValues }) };
    mocks.withTenantContext.mockImplementation(async (_context, callback) => callback(tx));
  });

  it('inserts the lead under the authority, stamped with the authority tenant', async () => {
    await expect(
      createLead({ authority, agentId: 'agent-1', branchId: 'branch-1' }, input)
    ).resolves.toEqual({ leadId: 'lead_seed' });

    expect(mocks.withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'lead_seed',
        tenantId: 'tenant-1',
        agentId: 'agent-1',
        branchId: 'branch-1',
        status: 'new',
      })
    );
  });

  it('fails closed without a write for an unrecognized authority', async () => {
    await expect(
      createLead(
        { authority: { tenantId: 'tenant-1' } as never, agentId: 'agent-1', branchId: 'branch-1' },
        input
      )
    ).rejects.toThrow('Unrecognized tenant authority');

    expect(mocks.withTenantContext).not.toHaveBeenCalled();
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it('validates input before touching the database', async () => {
    await expect(
      createLead({ authority, agentId: 'agent-1', branchId: 'branch-1' }, { ...input, phone: '1' })
    ).rejects.toThrow();

    expect(mocks.withTenantContext).not.toHaveBeenCalled();
  });
});
