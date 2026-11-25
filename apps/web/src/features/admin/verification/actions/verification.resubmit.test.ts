import { actionFailure } from '@/lib/safe-action.failure';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizeSessionTenant: vi.fn(),
  resubmitCashAttemptCore: vi.fn(),
  writeAuditEvent: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({
  authorizeSessionTenant: mocks.authorizeSessionTenant,
}));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: mocks.writeAuditEvent }));
vi.mock('../server/verification.core', async () => ({
  ...(await import('../server/schemas')),
  resubmitCashAttemptCore: mocks.resubmitCashAttemptCore,
}));

import { resubmitCashAttemptAction } from './verification';

const input = { attemptId: 'attempt-1' };

function useSession(role: 'agent' | 'staff') {
  const user = { id: 'user-1', role, tenantId: 'tenant-ks', branchId: 'branch-1' };
  mocks.authorizeSessionTenant.mockResolvedValue({
    session: { user },
    authority: mintTestTenantAuthority(user.tenantId, { userId: user.id, role }),
  });
}

describe('resubmitCashAttemptAction', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.writeAuditEvent.mockResolvedValue({ ok: true });
    useSession('agent');
  });

  it('returns CONFLICT from the mutation without a refusal audit', async () => {
    mocks.resubmitCashAttemptCore.mockRejectedValueOnce(actionFailure('CONFLICT'));

    await expect(resubmitCashAttemptAction(input)).resolves.toMatchObject({
      success: false,
      code: 'CONFLICT',
    });
    expect(mocks.resubmitCashAttemptCore).toHaveBeenCalledTimes(1);
    expect(mocks.writeAuditEvent).not.toHaveBeenCalled();
  });

  it('refuses a non-agent before invoking the mutation', async () => {
    useSession('staff');

    await expect(resubmitCashAttemptAction(input)).resolves.toMatchObject({
      success: false,
      code: 'FORBIDDEN',
    });
    expect(mocks.resubmitCashAttemptCore).not.toHaveBeenCalled();
    expect(mocks.writeAuditEvent).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        action: 'action.refused',
        entityId: 'verification.resubmitCashAttempt',
        metadata: expect.objectContaining({ code: 'FORBIDDEN' }),
      })
    );
  });

  it('rejects injected tenant and agent fields before invoking the mutation', async () => {
    await expect(
      resubmitCashAttemptAction({ ...input, tenantId: 'other', agentId: 'other' })
    ).resolves.toMatchObject({ success: false, code: 'VALIDATION_ERROR' });
    expect(mocks.resubmitCashAttemptCore).not.toHaveBeenCalled();
    expect(mocks.writeAuditEvent).not.toHaveBeenCalled();
  });

  it('preserves the public resubmission success shape', async () => {
    mocks.resubmitCashAttemptCore.mockResolvedValueOnce({ success: true });

    await expect(resubmitCashAttemptAction(input)).resolves.toEqual({ success: true });
    expect(mocks.resubmitCashAttemptCore).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ tenantId: 'tenant-ks', userRole: 'agent' }),
      input
    );
  });
});
