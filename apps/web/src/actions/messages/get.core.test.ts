import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { Session } from './context';

const mocks = vi.hoisted(() => ({ domain: vi.fn(), authorityRole: 'staff' }));
vi.mock('@interdomestik/domain-communications/messages/get', () => ({
  getMessagesForClaimCore: mocks.domain,
}));
vi.mock('@interdomestik/database/tenant-authority', () => ({
  readTenantAuthority: () => ({ principal: { role: mocks.authorityRole } }),
}));
vi.mock('./context', () => ({ getActionContext: vi.fn() }));
import { getMessagesForClaimCore } from './get.core';
import { getActionContext } from './context';
import { getMessagesForClaim } from '../messages';
import { getClaimMessages } from '../messaging';

const authority = {} as TenantAuthority;
function session(role: string): NonNullable<Session> {
  return { user: { id: 'actor', role } } as NonNullable<Session>;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorityRole = 'staff';
  mocks.domain.mockResolvedValue({ success: true, messages: [], canAcknowledge: true });
});
describe('claim message read content boundary', () => {
  it('denies BM before even validation or the frozen domain reader', async () => {
    expect(
      await getMessagesForClaimCore({ session: session('branch_manager'), authority, claimId: '' })
    ).toEqual({ success: false, error: 'Access denied' });
    expect(mocks.domain).not.toHaveBeenCalled();
  });
  it('also denies trusted BM authority when the presentation session claims staff', async () => {
    mocks.authorityRole = 'branch_manager';
    expect(
      await getMessagesForClaimCore({ session: session('staff'), authority, claimId: 'claim-1' })
    ).toEqual({ success: false, error: 'Access denied' });
    expect(mocks.domain).not.toHaveBeenCalled();
  });
  it.each(['tenant_admin', 'admin', 'staff', 'super_admin', 'member', 'agent', 'global_support'])(
    'preserves the domain result and inputs for %s',
    async role => {
      const params = { session: session(role), authority, claimId: 'claim-1' };
      const result = { success: true, messages: [], canAcknowledge: role !== 'global_support' };
      mocks.domain.mockResolvedValue(result);
      expect(await getMessagesForClaimCore(params)).toBe(result);
      expect(mocks.domain).toHaveBeenCalledExactlyOnceWith(params);
    }
  );
  it('denies both canonical and legacy mounted action adapters', async () => {
    vi.mocked(getActionContext).mockResolvedValue({
      session: session('branch_manager'),
      authority,
      requestHeaders: new Headers(),
    });
    expect(await getMessagesForClaim('claim-1')).toEqual({
      success: false,
      error: 'Access denied',
    });
    expect(await getClaimMessages('claim-1')).toEqual({ success: false, error: 'Access denied' });
    expect(mocks.domain).not.toHaveBeenCalled();
  });
});
