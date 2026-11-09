import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  domainAssignClaim: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('@interdomestik/domain-claims/staff-claims/assign', () => ({
  assignClaimCore: hoisted.domainAssignClaim,
}));

vi.mock('next/cache', () => ({
  revalidatePath: hoisted.revalidatePath,
}));

import { assignClaimCore } from './assign.core';

const authority = mintTestTenantAuthority('tenant-1');

describe('staff assign.core audit wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.domainAssignClaim.mockResolvedValue({ success: true });
  });

  it('delegates assignment and audit atomically to the domain mutation', async () => {
    const requestHeaders = new Headers({ 'user-agent': 'Vitest' });

    const result = await assignClaimCore({
      authority,
      claimId: 'claim-1',
      requestHeaders,
      session: {
        user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
        session: { id: 'session-1' },
      } as never,
      staffId: 'staff-2',
    });

    expect(result).toEqual({ success: true });
    expect(hoisted.domainAssignClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-1',
        requestHeaders,
        staffId: 'staff-2',
      })
    );
    expect(hoisted.revalidatePath).toHaveBeenCalledTimes(10);
  });

  it('does not revalidate when the atomic domain mutation fails', async () => {
    const failure = { success: false, error: 'Failed to assign claim' };
    hoisted.domainAssignClaim.mockResolvedValueOnce(failure);
    await expect(
      assignClaimCore({
        authority,
        claimId: 'claim-1',
        session: null,
      })
    ).resolves.toEqual(failure);
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });
});
