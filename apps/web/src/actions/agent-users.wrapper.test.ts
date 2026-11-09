import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { describe, expect, it, vi } from 'vitest';

import { getAgentUsers } from './agent-users';

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: vi.fn(),
}));

vi.mock('./agent-users/get', () => ({
  getAgentUsersCore: vi.fn(),
}));

const authority = mintTestTenantAuthority('tenant_ks', { userId: 'a1', role: 'agent' });

describe('actions/agent-users wrapper', () => {
  it('denies unauthenticated requests before calling the domain reader', async () => {
    const { authorizeSessionTenant } = await import('@/lib/tenant-authority.server');
    const { getAgentUsersCore } = await import('./agent-users/get');
    vi.clearAllMocks();
    vi.mocked(authorizeSessionTenant).mockResolvedValue(null);
    await expect(getAgentUsers()).rejects.toThrow('Unauthorized');
    expect(getAgentUsersCore).not.toHaveBeenCalled();
  });
  it('delegates with the authenticated session and its authority', async () => {
    const { authorizeSessionTenant } = await import('@/lib/tenant-authority.server');
    const { getAgentUsersCore } = await import('./agent-users/get');

    (authorizeSessionTenant as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      authority,
      session: { user: { id: 'a1', role: 'agent' } },
    });

    (getAgentUsersCore as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 'u1' }]);

    const result = await getAgentUsers({ search: 'test', limit: 10, offset: 0 });

    expect(getAgentUsersCore).toHaveBeenCalledWith({
      authority,
      session: { user: { id: 'a1', role: 'agent' } },
      filters: { search: 'test', limit: 10, offset: 0 },
    });

    expect(result).toEqual([{ id: 'u1' }]);
  });
});
