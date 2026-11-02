import { beforeEach, describe, expect, it, vi } from 'vitest';

const tableRefs = vi.hoisted(() => ({
  memberLeads: { table: 'memberLeads', id: 'memberLeads.id', tenantId: 'memberLeads.tenantId' },
  membershipCards: { table: 'membershipCards' },
  subscriptions: { table: 'subscriptions' },
  user: { table: 'user' },
  agentClients: { table: 'agentClients' },
}));

const mocks = vi.hoisted(() => ({
  eq: vi.fn((left, right) => ({ left, right, op: 'eq' })),
  and: vi.fn((...clauses) => ({ clauses, op: 'and' })),
  asc: vi.fn(value => ({ op: 'asc', value })),
  selectResults: [] as unknown[][],
  db: {
    query: {
      memberLeads: {
        findFirst: vi.fn(),
      },
      membershipPlans: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(),
  },
  withTenantContext: vi.fn(),
  membershipPlans: {
    id: 'membership_plans.id',
    tenantId: 'membership_plans.tenant_id',
    tier: 'membership_plans.tier',
    paddlePriceId: 'membership_plans.paddle_price_id',
    interval: 'membership_plans.interval',
    isActive: 'membership_plans.is_active',
  },
  generateMemberNumber: vi.fn(),
  nanoid: vi.fn(),
}));

vi.mock('@interdomestik/database', () => ({
  agentClients: tableRefs.agentClients,
  and: mocks.and,
  asc: mocks.asc,
  db: mocks.db,
  eq: mocks.eq,
  membershipPlans: mocks.membershipPlans,
  withTenantContext: mocks.withTenantContext,
}));

vi.mock('@interdomestik/database/member-number', () => ({
  generateMemberNumber: mocks.generateMemberNumber,
}));

vi.mock('@interdomestik/database/schema', () => tableRefs);

vi.mock('nanoid', () => ({
  nanoid: mocks.nanoid,
  customAlphabet: vi.fn(() => () => 'REFCODE01'),
}));

import { hasTenantLeadForConversion } from './convert';

describe('hasTenantLeadForConversion', () => {
  beforeEach(() => {
    mocks.db.query.memberLeads.findFirst.mockReset();
    mocks.withTenantContext.mockReset();
    mocks.withTenantContext.mockImplementation(async (_context, callback) => callback(mocks.db));
    mocks.eq.mockClear();
    mocks.and.mockClear();
  });

  it('returns true when the lead belongs to the tenant', async () => {
    mocks.db.query.memberLeads.findFirst.mockResolvedValue({ id: 'lead-1' });

    const result = await hasTenantLeadForConversion({ tenantId: 'tenant-1' }, { leadId: 'lead-1' });

    expect(result).toBe(true);
    expect(mocks.db.query.memberLeads.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        columns: { id: true },
      })
    );
    const query = mocks.db.query.memberLeads.findFirst.mock.calls[0]?.[0] as {
      where: (
        lead: typeof tableRefs.memberLeads,
        ops: { eq: typeof mocks.eq; and: typeof mocks.and }
      ) => unknown;
    };
    query.where(tableRefs.memberLeads, { eq: mocks.eq, and: mocks.and });
    expect(mocks.eq).toHaveBeenCalledWith(tableRefs.memberLeads.id, 'lead-1');
    expect(mocks.eq).toHaveBeenCalledWith(tableRefs.memberLeads.tenantId, 'tenant-1');
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
    expect(mocks.withTenantContext).toHaveBeenCalledWith(
      { tenantId: 'tenant-1' },
      expect.any(Function)
    );
  });

  it('returns false without writes when the lead is missing or belongs to another tenant', async () => {
    mocks.db.query.memberLeads.findFirst.mockResolvedValue(null);

    const result = await hasTenantLeadForConversion(
      { tenantId: 'tenant-1' },
      { leadId: 'lead-other' }
    );

    expect(result).toBe(false);
    expect(mocks.withTenantContext).toHaveBeenCalledTimes(1);
  });
});
