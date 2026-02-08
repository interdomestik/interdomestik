import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  domainUpdateStatus: vi.fn(),
  revalidatePath: vi.fn(),
  enforceRateLimitForAction: vi.fn(),
  claimFindFirst: vi.fn(),
  withTenant: vi.fn((tenantId, tenantColumn, condition) => ({ tenantId, tenantColumn, condition })),
}));

vi.mock('@interdomestik/domain-claims/admin-claims/update-status', () => ({
  updateClaimStatusCore: hoisted.domainUpdateStatus,
}));

vi.mock('next/cache', () => ({
  revalidatePath: hoisted.revalidatePath,
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimitForAction: hoisted.enforceRateLimitForAction,
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    query: {
      claims: {
        findFirst: hoisted.claimFindFirst,
      },
    },
  },
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: hoisted.withTenant,
}));

import { updateClaimStatusCore } from './update-status';

const session = {
  user: { id: 'admin-1', role: 'tenant_admin', tenantId: 'tenant_mk' },
  session: { id: 'session-1' },
} as unknown as NonNullable<import('./context').Session>;

describe('updateClaimStatusCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.enforceRateLimitForAction.mockResolvedValue({ limited: false });
    hoisted.domainUpdateStatus.mockResolvedValue(undefined);
    hoisted.claimFindFirst.mockResolvedValue({ id: 'claim-1', status: 'submitted' });
  });

  it('throws on invalid status before hitting domain mutation', async () => {
    const formData = new FormData();
    formData.set('claimId', 'claim-1');
    formData.set('status', 'not-a-real-status');
    formData.set('locale', 'en');

    await expect(
      updateClaimStatusCore({
        formData,
        session,
        requestHeaders: new Headers(),
      })
    ).rejects.toThrow('Invalid status');

    expect(hoisted.domainUpdateStatus).not.toHaveBeenCalled();
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });

  it('revalidates deterministic paths only on successful mutation', async () => {
    const formData = new FormData();
    formData.set('claimId', 'claim-1');
    formData.set('status', 'resolved');
    formData.set('locale', 'en');

    await updateClaimStatusCore({
      formData,
      session,
      requestHeaders: new Headers(),
    });

    expect(hoisted.revalidatePath).toHaveBeenNthCalledWith(1, '/en/admin/claims');
    expect(hoisted.revalidatePath).toHaveBeenNthCalledWith(2, '/en/admin/claims/claim-1');
    expect(hoisted.revalidatePath).toHaveBeenNthCalledWith(3, '/en/member/claims/claim-1');
    expect(hoisted.revalidatePath).toHaveBeenCalledTimes(3);
    expect(hoisted.domainUpdateStatus).toHaveBeenCalledTimes(1);
  });

  it('does not revalidate when domain mutation is denied/fails', async () => {
    hoisted.domainUpdateStatus.mockRejectedValueOnce(new Error('Claim not found'));

    const formData = new FormData();
    formData.set('claimId', 'claim-1');
    formData.set('status', 'resolved');
    formData.set('locale', 'en');

    await expect(
      updateClaimStatusCore({
        formData,
        session,
        requestHeaders: new Headers(),
      })
    ).rejects.toThrow('Claim not found');

    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });

  it('status no-op does not mutate or revalidate', async () => {
    hoisted.claimFindFirst.mockResolvedValueOnce({ id: 'claim-1', status: 'resolved' });

    const formData = new FormData();
    formData.set('claimId', 'claim-1');
    formData.set('status', 'resolved');
    formData.set('locale', 'en');

    await updateClaimStatusCore({
      formData,
      session,
      requestHeaders: new Headers(),
    });

    expect(hoisted.domainUpdateStatus).not.toHaveBeenCalled();
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });

  it('does not revalidate when persisted status remains unchanged after domain call', async () => {
    hoisted.claimFindFirst
      .mockResolvedValueOnce({ id: 'claim-1', status: 'submitted' })
      .mockResolvedValueOnce({ id: 'claim-1', status: 'submitted' });

    const formData = new FormData();
    formData.set('claimId', 'claim-1');
    formData.set('status', 'resolved');
    formData.set('locale', 'en');

    await updateClaimStatusCore({
      formData,
      session,
      requestHeaders: new Headers(),
    });

    expect(hoisted.domainUpdateStatus).toHaveBeenCalledTimes(1);
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });
});
