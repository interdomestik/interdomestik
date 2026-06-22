import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  adminSession,
  getUpdateStatusMocks,
  mockClaim,
  requestHeaders,
} from './update-status.test-support';

import { updateClaimStatusCore } from './update-status';

const mocks = getUpdateStatusMocks();

function runStatusUpdate(
  newStatus: Parameters<typeof updateClaimStatusCore>[0]['newStatus'],
  deps = {}
) {
  return updateClaimStatusCore(
    {
      claimId: 'claim-1',
      newStatus,
      session: adminSession,
      requestHeaders,
    },
    deps
  );
}

describe('admin updateClaimStatusCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transitionClaimStatus.mockResolvedValue({
      success: true,
      fromStatus: 'verification',
      lifecycleVersion: 2,
      status: 'resolved',
    });
  });

  it('preserves invalid, cross-tenant, and no-op behavior before the command', async () => {
    await expect(runStatusUpdate('not-a-real-status' as never)).rejects.toThrow('Invalid status');

    expect(mocks.dbSelect).not.toHaveBeenCalled();
    expect(mocks.transitionClaimStatus).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.claimWhere.mockResolvedValueOnce([]);

    await expect(runStatusUpdate('resolved')).rejects.toThrow('Claim not found');

    expect(mocks.transitionClaimStatus).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mockClaim('resolved');

    await runStatusUpdate('resolved');

    expect(mocks.transitionClaimStatus).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });

  it('repairs stale compat status when lifecycle state already matches the request', async () => {
    mockClaim('resolved', 'verification');

    await runStatusUpdate('resolved');

    expect(mocks.transitionClaimStatus).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'claims.status' })
    );
    expect(mocks.updateSet).toHaveBeenCalledWith({ status: 'resolved' });
    expect(mocks.updateWhere).toHaveBeenCalledWith({
      condition: { left: 'claims.id', right: 'claim-1' },
      tenantColumn: 'claims.tenant_id',
      tenantId: 'tenant-1',
    });
  });

  it('routes admin status changes through the transition command', async () => {
    const logAuditEvent = vi.fn();
    const projectClaimStatusAuditProjection = vi.fn();
    mockClaim('submitted');

    await runStatusUpdate('resolved', { logAuditEvent, projectClaimStatusAuditProjection });

    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expect(mocks.transitionClaimStatus).toHaveBeenCalledWith({
      actor: { id: 'admin-1', role: 'tenant_admin' },
      claimId: 'claim-1',
      tenantId: 'tenant-1',
      toStatus: 'resolved',
    });
    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(projectClaimStatusAuditProjection).toHaveBeenCalledWith({
      limit: 10,
      tenantId: 'tenant-1',
    });
  });

  it('surfaces transition command rejection without audit or notification side effects', async () => {
    const logAuditEvent = vi.fn();
    const notifyStatusChanged = vi.fn();
    mockClaim('evaluation');
    mocks.transitionClaimStatus.mockResolvedValueOnce({
      success: false,
      error: 'transition_rejected',
    });

    await expect(
      runStatusUpdate('resolved', { logAuditEvent, notifyStatusChanged })
    ).rejects.toThrow('Invalid status transition');

    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expect(logAuditEvent).not.toHaveBeenCalled();
    expect(notifyStatusChanged).not.toHaveBeenCalled();
  });
});
