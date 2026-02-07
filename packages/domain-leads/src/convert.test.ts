import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  transaction: vi.fn(),
  db: {
    query: {
      memberLeads: {
        findFirst: vi.fn(),
      },
    },
    transaction: vi.fn(),
  },
  generateMemberNumber: vi.fn(),
  nanoid: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  db: mocks.db,
}));

vi.mock('@interdomestik/database/member-number', () => ({
  generateMemberNumber: mocks.generateMemberNumber,
}));

vi.mock('nanoid', () => ({
  nanoid: mocks.nanoid,
}));

import { convertLeadToMember } from './convert';

describe('convertLeadToMember', () => {
  beforeEach(() => {
    mocks.db.query.memberLeads.findFirst = mocks.findFirst;
    mocks.db.transaction = mocks.transaction;

    mocks.findFirst.mockReset();
    mocks.transaction.mockReset();
    mocks.generateMemberNumber.mockReset();
    mocks.nanoid.mockReset();
  });

  it('returns null and does not convert when convertedUserId already exists', async () => {
    mocks.findFirst.mockResolvedValue({
      id: 'lead-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      agentId: 'agent-1',
      firstName: 'Arben',
      lastName: 'Krasniqi',
      email: 'arben@example.com',
      status: 'new',
      convertedUserId: 'usr_existing',
    });

    mocks.transaction.mockImplementation(async () => {
      throw new Error('transaction should not run');
    });

    const result = await convertLeadToMember(
      { tenantId: 'tenant-1' },
      { leadId: 'lead-1', planId: 'monthly_std' }
    );

    expect(result).toBeNull();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
