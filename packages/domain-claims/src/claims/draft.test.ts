import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dbUpdate: vi.fn(),
  findFirst: vi.fn(),
  transitionClaimStatus: vi.fn(),
  withTenant: vi.fn(() => ({ scoped: true })),
}));

vi.mock('@interdomestik/database', () => ({
  claimDocuments: {},
  claims: {
    id: 'claims.id',
    tenantId: 'claims.tenant_id',
  },
  db: {
    insert: vi.fn(),
    query: { claims: { findFirst: mocks.findFirst } },
    update: mocks.dbUpdate,
  },
  eq: vi.fn((left, right) => ({ left, right })),
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(() => 'tenant-1'),
}));

vi.mock('./transition', () => ({
  transitionClaimStatus: mocks.transitionClaimStatus,
}));

import { cancelClaimCore } from './draft';

const requestHeaders = new Headers({ 'user-agent': 'Vitest' });
const memberSession = { user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' } } as never;

function mockClaim(status = 'draft') {
  mocks.findFirst.mockResolvedValueOnce({
    id: 'claim-1',
    status,
    tenantId: 'tenant-1',
    title: 'Claim',
    userId: 'member-1',
  });
}

function runCancel(deps = {}) {
  return cancelClaimCore({ claimId: 'claim-1', requestHeaders, session: memberSession }, deps);
}

function sideEffectDeps() {
  return {
    logAuditEvent: vi.fn(),
    revalidatePath: vi.fn(),
  };
}

describe('cancelClaimCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transitionClaimStatus.mockResolvedValue({
      success: true,
      fromStatus: 'draft',
      lifecycleVersion: 2,
      status: 'rejected',
    });
  });

  it('routes successful cancellation through the transition command', async () => {
    const deps = sideEffectDeps();
    mockClaim();

    const result = await runCancel(deps);

    expect(result).toEqual({ success: true });
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expect(mocks.transitionClaimStatus).toHaveBeenCalledWith({
      actor: { id: 'member-1', role: 'member' },
      claimId: 'claim-1',
      tenantId: 'tenant-1',
      toStatus: 'rejected',
    });
    expect(deps.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'claim.cancelled',
        actorId: 'member-1',
        entityId: 'claim-1',
        headers: requestHeaders,
        metadata: { oldStatus: 'draft', newStatus: 'rejected' },
        tenantId: 'tenant-1',
      })
    );
    expect(deps.revalidatePath).toHaveBeenCalledWith('/member/claims');
    expect(deps.revalidatePath).toHaveBeenCalledWith('/member/claims/claim-1');
  });

  it('surfaces transition rejection without audit or revalidation side effects', async () => {
    const deps = sideEffectDeps();
    mockClaim('submitted');
    mocks.transitionClaimStatus.mockResolvedValueOnce({
      success: false,
      error: 'transition_rejected',
    });

    const result = await runCancel(deps);

    expect(result).toEqual({ success: false, error: 'Invalid status transition' });
    expect(mocks.transitionClaimStatus).toHaveBeenCalledWith({
      actor: { id: 'member-1', role: 'member' },
      claimId: 'claim-1',
      tenantId: 'tenant-1',
      toStatus: 'rejected',
    });
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
    expect(deps.logAuditEvent).not.toHaveBeenCalled();
    expect(deps.revalidatePath).not.toHaveBeenCalled();
  });

  it('preserves terminal-status cancellation rejection before transition', async () => {
    mockClaim('resolved');

    const result = await runCancel(sideEffectDeps());

    expect(result).toEqual({ success: false, error: 'Claim cannot be cancelled' });
    expect(mocks.transitionClaimStatus).not.toHaveBeenCalled();
    expect(mocks.dbUpdate).not.toHaveBeenCalled();
  });
});
