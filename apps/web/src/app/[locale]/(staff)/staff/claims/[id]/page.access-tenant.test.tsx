import { screen } from '@testing-library/react';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hoisted, renderPage } from './page-test-support';

describe('staff claim page effective access tenant', () => {
  beforeEach(() => vi.clearAllMocks());

  it('forwards the explicit access tenant to parent and existing child readers', async () => {
    const session = {
      user: {
        id: 'staff-1',
        role: 'staff',
        tenantId: 'home-a',
        accessTenantId: 'access-b',
        branchId: 'branch-a',
      },
    };
    hoisted.getSessionMock.mockResolvedValueOnce(session);
    await renderPage();
    expect(screen.getByTestId('staff-claim-detail-ready')).toBeInTheDocument();
    const authority = hoisted.current.authority!;
    expect(hoisted.getStaffClaimDetailMock).toHaveBeenCalledExactlyOnceWith({
      branchId: 'branch-a',
      claimId: 'claim-1',
      staffId: 'staff-1',
      authority,
    });
    expect(readTenantAuthority(authority).tenantId).toBe('access-b');
    expect(hoisted.getPublicStatusHistoryCoreMock).toHaveBeenCalledExactlyOnceWith({
      claimId: 'claim-1',
      authority,
    });
    expect(hoisted.getStaffAssignmentOptionsMock).toHaveBeenCalledExactlyOnceWith({
      branchId: 'branch-a',
      authority,
    });
    expect(hoisted.getAssignedStaffClaimDocumentsMock).toHaveBeenCalledExactlyOnceWith({
      claimId: 'claim-1',
      session,
      authority,
    });
    expect(
      (
        hoisted.getAssignedStaffClaimDocumentsMock.mock.calls[0] as unknown as [
          { authority: unknown },
        ]
      )[0].authority
    ).toBe(authority);
  });

  it('does not load a home-only claim or any children when the access-scoped parent denies', async () => {
    const session = {
      user: {
        id: 'staff-1',
        role: 'staff',
        tenantId: 'home-a',
        accessTenantId: 'access-b',
        branchId: 'branch-a',
      },
    };
    hoisted.getSessionMock.mockResolvedValueOnce(session);
    hoisted.getStaffClaimDetailMock.mockResolvedValueOnce(null as never);
    await expect(renderPage()).rejects.toThrow('notFound');
    expect(hoisted.getStaffClaimDetailMock).toHaveBeenCalledExactlyOnceWith({
      branchId: 'branch-a',
      claimId: 'claim-1',
      staffId: 'staff-1',
      authority: hoisted.current.authority!,
    });
    expect(hoisted.getPublicStatusHistoryCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getStaffAssignmentOptionsMock).not.toHaveBeenCalled();
    expect(hoisted.getAssignedStaffClaimDocumentsMock).not.toHaveBeenCalled();
  });

  it('denies before any claim read when both tenant identities are absent', async () => {
    hoisted.getSessionMock.mockResolvedValueOnce({
      user: { id: 'staff-1', role: 'staff', tenantId: '', branchId: 'branch-a' },
    });
    await expect(renderPage()).rejects.toThrow('notFound');
    expect(hoisted.getStaffClaimDetailMock).not.toHaveBeenCalled();
    expect(hoisted.getPublicStatusHistoryCoreMock).not.toHaveBeenCalled();
    expect(hoisted.getStaffAssignmentOptionsMock).not.toHaveBeenCalled();
    expect(hoisted.getAssignedStaffClaimDocumentsMock).not.toHaveBeenCalled();
  });
});
