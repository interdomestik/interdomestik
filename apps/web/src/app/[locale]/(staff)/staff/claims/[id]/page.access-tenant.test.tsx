import { screen } from '@testing-library/react';
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
    expect(hoisted.getStaffClaimDetailMock).toHaveBeenCalledExactlyOnceWith({
      branchId: 'branch-a',
      claimId: 'claim-1',
      staffId: 'staff-1',
      tenantId: 'access-b',
    });
    expect(hoisted.getPublicStatusHistoryCoreMock).toHaveBeenCalledExactlyOnceWith({
      claimId: 'claim-1',
      tenantId: 'access-b',
    });
    expect(hoisted.getStaffAssignmentOptionsMock).toHaveBeenCalledExactlyOnceWith({
      branchId: 'branch-a',
      tenantId: 'access-b',
    });
    expect(hoisted.getAssignedStaffClaimDocumentsMock).toHaveBeenCalledExactlyOnceWith({
      claimId: 'claim-1',
      session,
    });
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
      tenantId: 'access-b',
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
