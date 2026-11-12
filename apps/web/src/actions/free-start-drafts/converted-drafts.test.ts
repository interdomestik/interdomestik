import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { savedDraftClaimId } from '@/actions/claims/saved-draft-claim-identity';
import { findConvertedDrafts } from './converted-drafts';

const h = vi.hoisted(() => ({
  authorize: vi.fn(),
  select: vi.fn(),
  where: vi.fn(),
  tenant: vi.fn(),
}));
vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: h.authorize }));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: h.tenant,
}));
const context = { ownerUserId: 'member-1', tenantId: 'tenant_ks', accessTenantId: 'tenant_ks' };
const requestHeaders = new Headers();
const authority = mintTestTenantAuthority('tenant_ks', { userId: 'member-1', role: 'member' });

describe('converted draft lookup authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.authorize.mockResolvedValue({ authority });
    h.select.mockReturnValue({ from: () => ({ where: h.where }) });
    h.tenant.mockImplementation(async (_authority, action) => action({ select: h.select }));
    h.where.mockResolvedValue([{ id: savedDraftClaimId('tenant_ks', 'member-1', 'draft-a') }]);
  });

  it('batch checks deterministic claim ids and does not require a claim number', async () => {
    const result = await findConvertedDrafts(context, ['draft-a', 'draft-b'], requestHeaders);
    expect([...result]).toEqual(['draft-a']);
    expect(h.authorize).toHaveBeenCalledWith(requestHeaders);
    expect(h.tenant).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(h.select).toHaveBeenCalledOnce();
    expect(Object.keys(h.select.mock.calls[0][0])).toEqual(['id']);
  });

  it.each([
    { ...context, ownerUserId: 'other' },
    { ...context, tenantId: 'tenant_mk' },
    { ...context, accessTenantId: 'tenant_mk' },
  ])('refuses a changed account before reading claims', async stale => {
    await expect(findConvertedDrafts(stale, ['draft-a'], requestHeaders)).rejects.toThrow(
      'Draft account changed'
    );
    expect(h.tenant).not.toHaveBeenCalled();
  });

  it('refuses a lost session without reading claims', async () => {
    h.authorize.mockResolvedValueOnce(null);
    await expect(findConvertedDrafts(context, ['draft-a'], requestHeaders)).rejects.toThrow(
      'Draft account unavailable'
    );
    expect(h.tenant).not.toHaveBeenCalled();
  });

  it('does not authorize or query when the draft list is empty', async () => {
    expect(await findConvertedDrafts(context, [], requestHeaders)).toEqual(new Set());
    expect(h.authorize).not.toHaveBeenCalled();
    expect(h.tenant).not.toHaveBeenCalled();
  });
});
