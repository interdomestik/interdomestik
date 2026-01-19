import { describe, expect, it, vi } from 'vitest';
import { getVerificationApiCore } from './_core';

describe('getVerificationApiCore', () => {
  const mockUser = {
    id: 'u1',
    role: 'staff',
    tenantId: 't1',
    branchId: 'b1',
  };

  const mockServices = {
    getVerificationDetailsFn: vi.fn(),
  };

  it('allows staff to see verification details', async () => {
    mockServices.getVerificationDetailsFn.mockResolvedValue({ id: 'v1', status: 'pending' });

    const result = await getVerificationApiCore({ id: 'v1', user: mockUser }, mockServices);

    expect(result.kind).toBe('ok');
    if (result.kind === 'ok') {
      expect(result.data).toEqual({ id: 'v1', status: 'pending' });
    }
    expect(mockServices.getVerificationDetailsFn).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', userRole: 'staff' }),
      'v1'
    );
  });

  it('returns forbidden for members', async () => {
    const memberUser = { ...mockUser, role: 'member' };
    const result = await getVerificationApiCore({ id: 'v1', user: memberUser }, mockServices);

    expect(result.kind).toBe('forbidden');
  });

  it('returns notFound if service returns null', async () => {
    mockServices.getVerificationDetailsFn.mockResolvedValue(null);
    const result = await getVerificationApiCore({ id: 'missing', user: mockUser }, mockServices);

    expect(result.kind).toBe('notFound');
  });
});
