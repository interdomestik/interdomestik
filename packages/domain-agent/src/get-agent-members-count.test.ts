import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  select: vi.fn(),
  where: vi.fn(),
  eq: vi.fn((left, right) => [left, right]),
  tenant: vi.fn(),
}));
vi.mock('@interdomestik/database', () => ({
  agentClients: {
    memberId: 'memberId',
    tenantId: 'tenantId',
    agentId: 'agentId',
    status: 'status',
  },
  user: { id: 'userId', role: 'userRole' },
  claims: {},
  countDistinct: vi.fn(),
  eq: h.eq,
  and: (...conditions: unknown[]) => conditions,
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: h.tenant,
}));
import { getAgentMemberCount } from './get-agent-members-list';

const authority = mintTestTenantAuthority('tenant_ks', { userId: 'agent-1', role: 'agent' });
describe('agent member count', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.select.mockReturnValue({ from: () => ({ innerJoin: () => ({ where: h.where }) }) });
    h.tenant.mockImplementation(async (_authority, read) => read({ select: h.select }));
    h.where.mockResolvedValue([{ count: 65 }]);
  });
  it('counts all assigned active members beyond the list page limit', async () => {
    expect(await getAgentMemberCount({ authority, agentId: 'agent-1' })).toBe(65);
    expect(h.tenant).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(h.where).toHaveBeenCalledWith([
      ['agentId', 'agent-1'],
      ['tenantId', 'tenant_ks'],
      ['status', 'active'],
      ['userRole', 'member'],
    ]);
  });
  it.each(['member', 'admin', null])('denies a %s authority', async role => {
    const wrong = mintTestTenantAuthority('tenant_ks', { userId: 'agent-1', role });
    await expect(getAgentMemberCount({ authority: wrong, agentId: 'agent-1' })).rejects.toThrow(
      'Forbidden'
    );
    expect(h.select).not.toHaveBeenCalled();
  });
  it('denies another agent identity before any database access', async () => {
    await expect(getAgentMemberCount({ authority, agentId: 'agent-2' })).rejects.toThrow(
      'Forbidden'
    );
    expect(h.select).not.toHaveBeenCalled();
  });
});
